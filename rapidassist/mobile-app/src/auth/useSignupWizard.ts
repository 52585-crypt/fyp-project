import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { getNetworkErrorMessage } from "../config/api";
import { authDestination, enrollProvider, linkGoogleAccount, loginWithGoogle, recoverProviderRegistration, register } from "./auth.api";
import type { AuthResponse, GoogleMechanicProfile, MechanicServiceCategory, UserRole } from "./auth.types";
import { useAuth } from "./AuthProvider";
import { useGoogleSignIn } from "./GoogleSignInOption";
import { captureDocumentPhoto, captureLiveLocation, pickDocumentPhoto } from "./signupMedia";
import { emptyDocs, stepsFor, type LiveLocation, type MechanicDocs, type MechanicPhotoField, type SignupStep } from "./signupSteps";

type GoogleDraft = { profile: GoogleMechanicProfile; idToken: string; enrollmentTicket?: string };

/**
 * All signup state and API calls. Customer: role → details. Provider: role (+ Google/phone choice)
 * → service → details → documents → location → account created → identity verification.
 * No account is created until every required step is complete; submit is single-flight.
 */
export function useSignupWizard() {
  const { setSession, token: sessionToken, user, updateUser } = useAuth();
  const params = useLocalSearchParams<{ role?: string; linkGoogle?: string }>();
  const initialRole: UserRole = params.role === "mechanic" ? "mechanic" : "user";

  const [role, setRole] = useState<UserRole>(initialRole);
  const selectedRole = useRef<UserRole>(initialRole);
  const [step, setStep] = useState<SignupStep>("role");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [serviceCategory, setServiceCategory] = useState<MechanicServiceCategory>("mechanic");
  const [docs, setDocs] = useState<MechanicDocs>(emptyDocs);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<"phone" | "google" | null>(null);
  const activeMethod = useRef(method);
  activeMethod.current = method;
  const [googleDraft, setGoogleDraft] = useState<GoogleDraft | null>(null);
  const submitting = useRef(false);
  const createdProvider = useRef<AuthResponse | null>(null);
  const linking = Boolean(params.linkGoogle === "1" && sessionToken && user?.role === "user"
    && user.authProvider === "local" && !user.hasGoogleSignIn);

  const google = useGoogleSignIn(
    setError,
    role === "mechanic" ? "mechanic_register" : "customer",
    (profile, idToken, enrollmentTicket) => {
      if (selectedRole.current !== "mechanic" || activeMethod.current !== null) return;
      if (googleDraft?.profile.email !== profile.email) setName(profile.name);
      if (googleDraft && googleDraft.profile.email !== profile.email) {
        setPhone("");
        setDocs(emptyDocs);
        setLiveLocation(null);
      }
      if (enrollmentTicket) setPhone(profile.phone ?? "");
      if (linking && user) updateUser({ ...user, hasGoogleSignIn: true });
      setGoogleDraft({ profile, idToken, enrollmentTicket });
      setPassword("");
      if (!enrollmentTicket) { setMethod("google"); setStep("service"); }
    },
    linking && sessionToken ? (idToken) => linkGoogleAccount(sessionToken, idToken, password) : undefined
  );

  const steps = stepsFor(role);
  const recognized = role === "mechanic" && method === null && Boolean(googleDraft?.enrollmentTicket);
  const accountReady = useMemo(() => (Boolean(googleDraft?.enrollmentTicket) || name.trim().length >= 2)
    && phone.trim().length >= 10 && (method === "google" || password.length >= 6), [googleDraft?.enrollmentTicket, method, name, phone, password]);
  const documentsReady = useMemo(() => {
    if (role !== "mechanic") return true;
    if (serviceCategory === "mechanic") return Boolean(docs.workshopPhotoUrl && docs.certificateUrl);
    return Boolean(docs.drivingLicenseUrl);
  }, [docs, role, serviceCategory]);
  const canSubmit = accountReady && documentsReady;
  const canMoveNext = step === "role" ? role === "user"
    : step === "service" ? true : step === "details" ? accountReady : step === "documents" ? documentsReady : false;

  function go(next: SignupStep) { setStep(next); setError(null); }

  function selectRole(next: UserRole) {
    if (next === role) return;
    selectedRole.current = next;
    setRole(next);
    setMethod(null);
    if (googleDraft) setName("");
    setGoogleDraft(null);
    go("role");
  }

  /** Provider chose phone + password instead of Google. */
  function choosePhone() {
    if (googleDraft) setName("");
    setGoogleDraft(null);
    setMethod("phone");
    go("service");
  }

  /** Recognised Google customer upgrading to provider. */
  function continueAsProvider() { setMethod("google"); go("service"); }

  function next() {
    if (!canMoveNext) return;
    const index = steps.indexOf(step);
    if (index < steps.length - 1) go(steps[index + 1]!);
  }

  function back() {
    const index = steps.indexOf(step);
    if (index > 1 || (index === 1 && role === "user")) return go(steps[index - 1]!);
    if (index === 1) {
      setMethod(null);
      if (!googleDraft?.enrollmentTicket) {
        if (method === "google") setName("");
        setGoogleDraft(null);
      }
      return go("role");
    }
    if (router.canGoBack()) router.back(); else router.replace("/(auth)/welcome");
  }

  function selectServiceCategory(next: MechanicServiceCategory) {
    setServiceCategory(next);
    setError(null);
    setDocs((c) => ({
      workshopPhotoUrl: next === "mechanic" ? c.workshopPhotoUrl : "",
      certificateUrl: next === "mechanic" ? c.certificateUrl : "",
      drivingLicenseUrl: next === "mechanic" ? "" : c.drivingLicenseUrl
    }));
  }

  async function attach(field: MechanicPhotoField, source: () => Promise<string | null>) {
    setError(null);
    try {
      const uri = await source();
      if (uri) setDocs((c) => ({ ...c, [field]: uri }));
    } catch (e: any) { setError(e?.message ?? "Unable to attach the photo."); }
  }

  async function fetchLocation() {
    setLocationLoading(true);
    setError(null);
    try { setLiveLocation(await captureLiveLocation()); } catch (e: any) { setError(e?.message || "Failed to fetch location"); } finally { setLocationLoading(false); }
  }

  async function returnToCustomer() {
    if (!googleDraft || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await loginWithGoogle(googleDraft.idToken, "customer");
      if ("registrationRequired" in data) throw new Error("Sign in again to continue as a customer.");
      await setSession(data.token, data.user);
      router.replace(authDestination(data.user));
    } catch (failure: any) {
      if (failure?.response?.status === 401) setGoogleDraft(null);
      setError(getNetworkErrorMessage(failure));
    } finally { submitting.current = false; setLoading(false); }
  }

  async function submit() {
    const finalStep = steps[steps.length - 1];
    if (!canSubmit || submitting.current || step !== finalStep) return;
    submitting.current = true;
    const useGoogle = role === "mechanic" && method === "google" && googleDraft;
    try {
      setLoading(true);
      setError(null);
      const mechanicProfile = {
        serviceCategory,
        workshopPhotoUrl: serviceCategory === "mechanic" ? docs.workshopPhotoUrl : null,
        certificateUrl: serviceCategory === "mechanic" ? docs.certificateUrl || null : null,
        drivingLicenseUrl: serviceCategory === "mechanic" ? null : docs.drivingLicenseUrl,
        liveLocation: liveLocation || undefined
      };
      const createAccount = () => useGoogle && useGoogle.enrollmentTicket
        ? enrollProvider({ enrollmentTicket: useGoogle.enrollmentTicket, phone: phone.trim(), mechanicProfile })
        : register({
            ...(useGoogle ? { role: "mechanic" as const, googleIdToken: useGoogle.idToken } : { role, password }),
            name: name.trim(),
            phone: phone.trim(),
            mechanicProfile: role === "mechanic" ? mechanicProfile : undefined
          });
      const data = createdProvider.current ?? await createAccount().catch(async (failure) => {
        const status = failure?.response?.status;
        if (role === "mechanic" && (status === undefined || status === 409 || status >= 500 || (useGoogle && status === 401))) {
          const recovered = await recoverProviderRegistration(useGoogle ? { googleIdToken: useGoogle.idToken } : { phone: phone.trim(), password });
          if (recovered) return recovered;
        }
        throw failure;
      });
      if (data.user.role === "mechanic") createdProvider.current = data;
      await setSession(data.token, data.user);
      router.replace(authDestination(data.user, role === "mechanic"));
    } catch (e: any) {
      if (useGoogle && e?.response?.status === 401) {
        if (useGoogle.enrollmentTicket) setGoogleDraft(null);
        setMethod(null);
        setStep("role");
      }
      setError(getNetworkErrorMessage(e));
    } finally { submitting.current = false; setLoading(false); }
  }

  return {
    role, step, steps, method, name, phone, password, serviceCategory, docs, liveLocation, loading, locationLoading, error,
    googleDraft, linking, recognized, canMoveNext, canSubmit, providerOnlyEntry: params.role === "mechanic",
    accountLocked: Boolean(createdProvider.current),
    nameEditable: !googleDraft?.enrollmentTicket,
    phoneEditable: !googleDraft?.enrollmentTicket || !googleDraft.profile.phone,
    needsPassword: role === "user" || method === "phone",
    googleDisabled: loading || (linking && !password),
    setName, setPhone, setPassword, selectRole, choosePhone, continueAsProvider, next, back, selectServiceCategory,
    captureDocument: (field: MechanicPhotoField) => attach(field, captureDocumentPhoto),
    pickDocument: (field: MechanicPhotoField) => attach(field, pickDocumentPhoto),
    fetchLocation, returnToCustomer, submit,
    googleLoading: google.googleLoading,
    onGoogleSignIn: google.onGoogleSignIn,
    onGoogleError: google.onGoogleError,
    /** Customer Google sign-in (customer details step). */
    onCustomerGoogleCredential: (credential: string) => { if (selectedRole.current === "user") google.onGoogleCredential(credential); },
    /** Provider Google entry (role step). */
    onProviderGoogleCredential: (credential: string) => {
      if (selectedRole.current === "mechanic" && activeMethod.current === null) google.onGoogleCredential(credential);
    }
  };
}

export type SignupWizard = ReturnType<typeof useSignupWizard>;
