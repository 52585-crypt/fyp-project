import React, { useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { RATextInput } from "../../src/components/RATextInput";
import { RAButton } from "../../src/components/RAButton";
import { PrimaryButton } from "../../src/ui/components";
import { authDestination, enrollProvider, linkGoogleAccount, loginWithGoogle, recoverProviderRegistration, register } from "../../src/auth/auth.api";
import { useAuth } from "../../src/auth/AuthProvider";
import { GoogleSignInOption, useGoogleSignIn } from "../../src/auth/GoogleSignInOption";
import { GoogleSignInButton } from "../../src/auth/GoogleSignInButton";
import type { AuthResponse, GoogleMechanicProfile, MechanicServiceCategory, UserRole } from "../../src/auth/auth.types";
import { getNetworkErrorMessage } from "../../src/config/api";
import { ProviderRegistrationProgress } from "../../src/verification/ProviderRegistrationProgress";

// Safe logo asset loading that works in Metro bundler and Node test runner
let logoAsset: any = null;
try {
  logoAsset = require("../../assets/icon.png");
} catch {
  logoAsset = null;
}

// Palette constants aligning with RapidAssist design system
const BRAND_GREEN = "#006341";
const BRAND_GREEN_PRESSED = "#00482F";
const BRAND_GREEN_SOFT = "#E8F3ED";
const TEXT_DARK = "#0F1A15";
const TEXT_MUTED = "#4B5E55";
const BORDER_LIGHT = "#D1D9D4";
const WHITE = "#FFFFFF";
const DANGER_RED = "#DC2626";
const DANGER_SOFT = "#FEE2E2";

type MechanicPhotoField =
  | "workshopPhotoUrl"
  | "certificateUrl"
  | "drivingLicenseUrl";

type MechanicDocs = Record<MechanicPhotoField, string>;

type LiveLocation = {
  lat: number;
  lng: number;
  addressText: string | null;
};

type MechanicStep = 0 | 1 | 2;

const serviceCategories: Array<{
  label: string;
  value: MechanicServiceCategory;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { label: "Car Mechanic", value: "mechanic", icon: "construct-outline" },
  { label: "Fuel Delivery", value: "fuel_delivery", icon: "water-outline" },
  { label: "Car Towing", value: "towing", icon: "car-outline" }
];

function serviceCategoryLabel(category: MechanicServiceCategory) {
  if (category === "fuel_delivery") return "Fuel delivery rider";
  if (category === "towing") return "Towing driver";
  return "Mechanic";
}

function documentRequirement(category: MechanicServiceCategory) {
  if (category === "mechanic") {
    return {
      icon: "construct-outline" as keyof typeof Ionicons.glyphMap,
      title: "Mechanic documents required",
      text: "Upload a workshop photo and mechanic certificate before creating the account."
    };
  }

  return {
    icon: "card-outline" as keyof typeof Ionicons.glyphMap,
    title: `${serviceCategoryLabel(category)} document required`,
    text: "Upload a clear driving licence photo before creating the account."
  };
}

const initialDocs: MechanicDocs = {
  workshopPhotoUrl: "",
  certificateUrl: "",
  drivingLicenseUrl: ""
};

function imageAssetToDataUri(asset: ImagePicker.ImagePickerAsset) {
  if (!asset.base64) {
    throw new Error("Image conversion failed. Please retake the photo.");
  }
  return `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
}

function ServiceCategoryPicker({
  value,
  onChange
}: {
  value: MechanicServiceCategory;
  onChange: (next: MechanicServiceCategory) => void;
}) {
  return (
    <View style={styles.categoryGrid}>
      {serviceCategories.map((item) => {
        const selected = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.value)}
            style={[styles.categoryButton, selected ? styles.categoryButtonSelected : null]}
          >
            <View style={[styles.categoryIconWrap, selected ? styles.categoryIconWrapSelected : null]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={selected ? BRAND_GREEN : TEXT_MUTED}
              />
            </View>
            <Text style={[styles.categoryText, selected ? styles.categoryTextSelected : null]}>
              {item.label}
            </Text>
            {selected ? (
              <Ionicons name="checkmark-circle" size={18} color={BRAND_GREEN} style={{ marginLeft: "auto" }} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function UploadRow({
  title,
  value,
  icon,
  onCamera,
  onGallery,
  optional
}: {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onCamera?: () => void;
  onGallery?: () => void;
  optional?: boolean;
}) {
  return (
    <View style={styles.uploadRow}>
      <View style={styles.uploadPreview}>
        {value ? (
          <Image source={{ uri: value }} style={styles.uploadImage} />
        ) : (
          <Ionicons name={icon} size={22} color={TEXT_MUTED} />
        )}
      </View>
      <View style={styles.uploadBody}>
        <Text style={styles.uploadTitle}>
          {title}
          {optional ? <Text style={styles.optional}> (optional)</Text> : null}
        </Text>
        <Text style={[styles.uploadStatus, value ? styles.uploadStatusAttached : null]}>
          {value ? "✓ Attached" : optional ? "Optional" : "Required"}
        </Text>
      </View>
      <View style={styles.uploadActions}>
        {onCamera ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Take photo for ${title}`}
            onPress={onCamera}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
          >
            <Ionicons name="camera-outline" size={19} color={BRAND_GREEN} />
          </Pressable>
        ) : null}
        {onGallery ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Select photo from gallery for ${title}`}
            onPress={onGallery}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
          >
            <Ionicons name="image-outline" size={19} color={BRAND_GREEN} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function Signup() {
  const { setSession, token: sessionToken, user, updateUser } = useAuth();

  const params = useLocalSearchParams<{ role?: string; linkGoogle?: string }>();
  const initialRole: UserRole = params.role === "mechanic" ? "mechanic" : "user";

  const [role, setRole] = useState<UserRole>(initialRole);
  const selectedRole = useRef<UserRole>(initialRole);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serviceCategory, setServiceCategory] = useState<MechanicServiceCategory>("mechanic");
  const [docs, setDocs] = useState<MechanicDocs>(initialDocs);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [mechanicStep, setMechanicStep] = useState<MechanicStep>(0);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<"phone" | "google" | null>(null);
  const activeMethod = useRef(method);
  activeMethod.current = method;
  const [googleDraft, setGoogleDraft] = useState<{ profile: GoogleMechanicProfile; idToken: string; enrollmentTicket?: string } | null>(null);
  const submitting = useRef(false);
  const createdProvider = useRef<AuthResponse | null>(null);
  const scroll = useRef<ScrollView>(null);
  const linking = params.linkGoogle === "1" && sessionToken && user?.role === "user"
    && user.authProvider === "local" && !user.hasGoogleSignIn;

  const { googleLoading, onGoogleSignIn, onGoogleCredential, onGoogleError } = useGoogleSignIn(
    setError,
    role === "mechanic" ? "mechanic_register" : "customer",
    (profile, idToken, enrollmentTicket) => {
      if (selectedRole.current !== "mechanic" || activeMethod.current !== null) return;
      if (googleDraft?.profile.email !== profile.email) setName(profile.name);
      if (googleDraft && googleDraft.profile.email !== profile.email) {
        setPhone("");
        setDocs(initialDocs);
        setLiveLocation(null);
        setMechanicStep(0);
      }
      if (enrollmentTicket) setPhone(profile.phone ?? "");
      if (linking && user) updateUser({ ...user, hasGoogleSignIn: true });
      setGoogleDraft({ profile, idToken, enrollmentTicket });
      setPassword("");
      if (!enrollmentTicket) setMethod("google");
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    linking && sessionToken ? (idToken) => linkGoogleAccount(sessionToken, idToken, password) : undefined
  );
  const providerEntry = role === "mechanic" && method === null;
  const recognized = providerEntry && Boolean(googleDraft?.enrollmentTicket);

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
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const currentRequirement = useMemo(() => documentRequirement(serviceCategory), [serviceCategory]);

  const accountReady = useMemo(() => {
    return (Boolean(googleDraft?.enrollmentTicket) || name.trim().length >= 2)
      && phone.trim().length >= 10 && (method === "google" || password.length >= 6);
  }, [googleDraft?.enrollmentTicket, method, name, phone, password]);

  const workshopReady = useMemo(() => {
    if (role !== "mechanic") return true;
    if (serviceCategory === "mechanic") return Boolean(docs.workshopPhotoUrl && docs.certificateUrl);
    return Boolean(docs.drivingLicenseUrl);
  }, [docs.certificateUrl, docs.drivingLicenseUrl, docs.workshopPhotoUrl, role, serviceCategory]);

  const canSubmit = useMemo(() => {
    return accountReady && workshopReady;
  }, [accountReady, workshopReady]);

  const canMoveNext = useMemo(() => {
    if (mechanicStep === 0) return Boolean(serviceCategory);
    if (mechanicStep === 1) return accountReady;
    return workshopReady;
  }, [accountReady, mechanicStep, serviceCategory, workshopReady]);

  function selectRole(nextRole: UserRole) {
    if (nextRole === role) return;
    selectedRole.current = nextRole;
    setRole(nextRole);
    setMethod(null);
    if (googleDraft) setName("");
    setGoogleDraft(null);
    setError(null);
    setMechanicStep(0);
  }

  function changeStep(nextStep: MechanicStep) {
    setMechanicStep(nextStep);
    setError(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function selectServiceCategory(nextCategory: MechanicServiceCategory) {
    setServiceCategory(nextCategory);
    setError(null);
    setDocs((current) => ({
      ...current,
      workshopPhotoUrl: nextCategory === "mechanic" ? current.workshopPhotoUrl : "",
      certificateUrl: nextCategory === "mechanic" ? current.certificateUrl : "",
      drivingLicenseUrl: nextCategory === "mechanic" ? "" : current.drivingLicenseUrl
    }));
  }

  function goNext() {
    if (canMoveNext && mechanicStep < 2) changeStep((mechanicStep + 1) as MechanicStep);
  }

  function goBack() {
    if (mechanicStep > 0) changeStep((mechanicStep - 1) as MechanicStep);
    else {
      setMethod(null);
      if (!googleDraft?.enrollmentTicket) {
        if (method === "google") setName("");
        setGoogleDraft(null);
      }
      setError(null);
    }
  }

  async function captureImage(field: MechanicPhotoField) {
    try {
      setError(null);
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError("Camera permission is required. Allow camera access and try again.");
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.2,
        base64: true,
        mediaTypes: ["images"],
        cameraType: ImagePicker.CameraType.back
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setDocs((current) => ({ ...current, [field]: imageAssetToDataUri(result.assets[0]) }));
      }
    } catch (e: any) {
      setError(e?.message || "Camera is not available on this device. Try the gallery option.");
    }
  }

  async function pickImage(field: MechanicPhotoField) {
    try {
      setError(null);
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Photo library permission is required");
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.2,
        base64: true,
        mediaTypes: ["images"]
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setDocs((current) => ({ ...current, [field]: imageAssetToDataUri(result.assets[0]) }));
      }
    } catch (error: any) {
      setError(error?.message || "Unable to open your photo library. Please try again.");
    }
  }

  async function fetchLocation() {
    try {
      setLocationLoading(true);
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission is required");
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let addressText: string | null = null;

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        });
        if (address) {
          addressText = [address.name, address.street, address.city, address.region].filter(Boolean).join(", ") || null;
        }
      } catch {
        addressText = null;
      }

      setLiveLocation({
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        addressText
      });
    } catch (e: any) {
      setError(e?.message || "Failed to fetch location");
    } finally {
      setLocationLoading(false);
    }
  }

  async function onSubmit() {
    if (!canSubmit || submitting.current || (role === "mechanic" && mechanicStep !== 2)) return;
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
        if (role === "mechanic" &&
          (status === undefined || status === 409 || status >= 500 || (useGoogle && status === 401))) {
          const recovered = await recoverProviderRegistration(useGoogle
            ? { googleIdToken: useGoogle.idToken } : { phone: phone.trim(), password });
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
        scroll.current?.scrollTo({ y: 0, animated: false });
      }
      setError(getNetworkErrorMessage(e));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {!providerEntry ? <View pointerEvents="none" style={styles.bottomDecoration} /> : null}

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          {/* Section A — App Branding */}
          <View style={styles.brandingSection}>
            <View style={styles.logoWrap}>
              {logoAsset ? (
                <Image
                  source={logoAsset}
                  style={styles.logoImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="car-sport" size={38} color={BRAND_GREEN} />
              )}
            </View>
            <Text style={styles.appName}>RapidAssist</Text>
            {!providerEntry ? <Text style={styles.tagline}>Your Roadside Companion</Text> : null}
          </View>

          {/* Section B — Screen Heading */}
          <View style={styles.headingSection}>
            <Text style={styles.screenHeading}>{recognized ? "Welcome Back!" : role === "mechanic" ? "Become a Service Provider" : "Create an account"}</Text>
            <Text style={styles.screenSubtitle}>
              {recognized ? "You already have a RapidAssist customer account. You can use the same account to become a service provider."
                : providerEntry ? "Choose how to create your provider account." : "Providers complete identity and service verification before receiving jobs."}
            </Text>
          </View>

          {/* Section C — Role Selector */}
          {(role === "user" || (providerEntry && !recognized && params.role !== "mechanic")) ? <View style={styles.roleContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="User account type"
              accessibilityState={{ selected: role === "user" }}
              disabled={googleLoading}
              onPress={() => selectRole("user")}
              style={[
                styles.roleOption,
                role === "user" ? styles.roleOptionSelected : null
              ]}
            >
              <Text
                style={[
                  styles.roleOptionText,
                  role === "user" ? styles.roleOptionTextSelected : null
                ]}
              >
                User
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Provider account type"
              accessibilityState={{ selected: role === "mechanic" }}
              disabled={googleLoading}
              onPress={() => selectRole("mechanic")}
              style={[
                styles.roleOption,
                role === "mechanic" ? styles.roleOptionSelected : null
              ]}
            >
              <Text
                style={[
                  styles.roleOptionText,
                  role === "mechanic" ? styles.roleOptionTextSelected : null
                ]}
              >
                Provider
              </Text>
            </Pressable>
          </View> : null}

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorAlert} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={DANGER_RED} style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Section D — User Registration Flow */}
          {role === "user" ? (
            <View style={styles.userForm}>
              <View style={styles.inputsGroup}>
                <RATextInput
                  icon="person-outline"
                  placeholder="Full name"
                  autoCapitalize="words"
                  value={name}
                  onChangeText={setName}
                />
                <View style={styles.fieldSpacer} />
                <RATextInput
                  icon="call-outline"
                  placeholder="03001234567"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                <View style={styles.fieldSpacer} />
                <RATextInput
                  icon="lock-closed-outline"
                  placeholder="Password (min 6 chars)"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  rightElement={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                      onPress={() => setShowPassword((prev) => !prev)}
                      hitSlop={12}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={TEXT_MUTED}
                      />
                    </Pressable>
                  }
                />
              </View>

              {/* Section E — Primary Action Button */}
              <View style={{ height: 18 }} />
              <RAButton
                title={loading ? "Please wait..." : "Create account"}
                disabled={!canSubmit || loading || googleLoading}
                onPress={onSubmit}
              />

              {/* Section F & G — Divider and Google Sign-In */}
              <GoogleSignInOption
                loading={googleLoading}
                disabled={loading}
                onPress={onGoogleSignIn}
                onCredential={(credential) => {
                  if (selectedRole.current === "user") onGoogleCredential(credential);
                }}
                onError={onGoogleError}
              />
            </View>
          ) : recognized && googleDraft ? (
            <View style={[styles.stepCard, styles.authActions]}>
              <View style={styles.googleAccount}>
                {googleDraft.profile.profilePictureUrl ? <Image source={{ uri: googleDraft.profile.profilePictureUrl }} style={styles.googleAvatar} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.requirementTitle}>{googleDraft.profile.name}</Text>
                  <Text style={styles.requirementText}>{googleDraft.profile.email}</Text>
                </View>
              </View>
              <PrimaryButton title="Continue as Service Provider" disabled={loading} onPress={() => {
                setMethod("google");
                changeStep(0);
              }} />
              <PrimaryButton title="Back to Customer" variant="outline" loading={loading} onPress={returnToCustomer} />
            </View>
          ) : providerEntry ? (
            <View style={[styles.stepCard, styles.authActions]}>
              {linking ? <>
                <Text style={styles.requirementText}>Confirm your current password and sign in with Google to link it to this customer account.</Text>
                <RATextInput accessibilityLabel="Current password" placeholder="Current password" secureTextEntry
                  autoComplete="current-password" value={password} onChangeText={setPassword} />
              </> : null}
              <GoogleSignInButton loading={googleLoading} disabled={loading || Boolean(linking && !password)} onPress={onGoogleSignIn}
                onCredential={(credential) => {
                  if (selectedRole.current === "mechanic" && activeMethod.current === null) onGoogleCredential(credential);
                }} onError={onGoogleError} />
              {!linking ? <PrimaryButton title="Continue with Phone" disabled={googleLoading} onPress={() => {
                if (googleDraft) setName("");
                setGoogleDraft(null);
                setMethod("phone");
                changeStep(0);
              }} /> : null}
            </View>
          ) : (
            /* Provider Registration Flow */
            <View style={styles.mechanicBlock}>
              <ProviderRegistrationProgress currentStep={mechanicStep} />

              {mechanicStep === 0 ? (
                <View style={styles.stepCard}>
                  <Text style={styles.sectionTitle}>Select service category</Text>
                  <ServiceCategoryPicker value={serviceCategory} onChange={selectServiceCategory} />
                  <View style={styles.requirementCard}>
                    <View style={styles.requirementIcon}>
                      <Ionicons name={currentRequirement.icon} size={20} color={BRAND_GREEN} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requirementTitle}>{currentRequirement.title}</Text>
                      <Text style={styles.requirementText}>{currentRequirement.text}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {mechanicStep === 1 ? (
                <View style={styles.stepCard}>
                  <Text style={styles.sectionTitle}>Personal information</Text>
                  <RATextInput
                    icon="person-outline"
                    placeholder="Full name"
                    accessibilityLabel="Full name"
                    editable={!googleDraft?.enrollmentTicket}
                    autoCapitalize="words"
                    value={name}
                    onChangeText={setName}
                  />
                  {name.length > 0 && name.trim().length < 2 ? <Text style={styles.errorText}>Enter at least 2 characters.</Text> : null}
                  {googleDraft ? <View style={styles.googleAccount}>
                    {googleDraft.profile.profilePictureUrl ? <Image source={{ uri: googleDraft.profile.profilePictureUrl }} style={styles.googleAvatar} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requirementTitle}>Google email</Text>
                      <Text style={styles.requirementText}>{googleDraft.profile.email}</Text>
                    </View>
                  </View> : null}
                  <View style={styles.fieldSpacer} />
                  <RATextInput
                    icon="call-outline"
                    placeholder="03001234567"
                    accessibilityLabel="Mobile number"
                    editable={!googleDraft?.enrollmentTicket || !googleDraft.profile.phone}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                  {phone.length > 0 && phone.trim().length < 10 ? <Text style={styles.errorText}>Enter at least 10 characters for your mobile number.</Text> : null}
                  {method === "phone" ? <>
                    <View style={styles.fieldSpacer} />
                    <RATextInput
                    icon="lock-closed-outline"
                    placeholder="Password (min 6 chars)"
                    accessibilityLabel="Password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    rightElement={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                        onPress={() => setShowPassword((prev) => !prev)}
                        hitSlop={12}
                        style={styles.eyeBtn}
                      >
                        <Ionicons
                          name={showPassword ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={TEXT_MUTED}
                        />
                      </Pressable>
                    }
                  />
                    {password.length > 0 && password.length < 6 ? <Text style={styles.errorText}>Use at least 6 characters.</Text> : null}
                  </> : null}
                </View>
              ) : null}

              {mechanicStep === 2 ? (
                <View style={styles.stepCard}>
                  {serviceCategory === "mechanic" ? (
                    <>
                      <Text style={styles.sectionTitle}>Workshop & certificate</Text>
                      <View style={styles.requirementCard}>
                        <View style={styles.requirementIcon}>
                          <Ionicons name="construct-outline" size={20} color={BRAND_GREEN} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.requirementTitle}>Both documents are required</Text>
                          <Text style={styles.requirementText}>
                            Use clear photos so admin can verify your workshop account quickly.
                          </Text>
                        </View>
                      </View>
                      <UploadRow
                        title="Workshop photo"
                        value={docs.workshopPhotoUrl}
                        icon="business-outline"
                        onCamera={() => captureImage("workshopPhotoUrl")}
                        onGallery={() => pickImage("workshopPhotoUrl")}
                      />
                      <UploadRow
                        title="Mechanic certificate"
                        value={docs.certificateUrl}
                        icon="document-text-outline"
                        onCamera={() => captureImage("certificateUrl")}
                        onGallery={() => pickImage("certificateUrl")}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.sectionTitle}>Driving licence</Text>
                      <View style={styles.requirementCard}>
                        <View style={styles.requirementIcon}>
                          <Ionicons name="card-outline" size={20} color={BRAND_GREEN} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.requirementTitle}>Driving licence is required</Text>
                          <Text style={styles.requirementText}>
                            Upload the valid licence for this {serviceCategoryLabel(serviceCategory).toLowerCase()} account.
                          </Text>
                        </View>
                      </View>
                      <UploadRow
                        title="Driving licence"
                        value={docs.drivingLicenseUrl}
                        icon="card-outline"
                        onCamera={() => captureImage("drivingLicenseUrl")}
                        onGallery={() => pickImage("drivingLicenseUrl")}
                      />
                    </>
                  )}

                  <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
                    Live location <Text style={styles.optional}>(optional)</Text>
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fetch real-time location"
                    onPress={fetchLocation}
                    style={styles.locationButton}
                    disabled={locationLoading}
                  >
                    <View style={styles.locationIconWrap}>
                      <Ionicons name="location" size={20} color={BRAND_GREEN} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.locationTitle}>
                        {locationLoading
                          ? "Fetching GPS location..."
                          : liveLocation
                          ? "Location captured"
                          : "Fetch real-time location"}
                      </Text>
                      {liveLocation ? (
                        <Text style={styles.locationText} numberOfLines={2}>
                          {liveLocation.addressText || `${liveLocation.lat.toFixed(5)}, ${liveLocation.lng.toFixed(5)}`}
                        </Text>
                      ) : (
                        <Text style={styles.locationSub}>Tap to capture your workshop or service coordinates</Text>
                      )}
                    </View>
                    <Ionicons
                      name={liveLocation ? "checkmark-circle" : "chevron-forward"}
                      size={20}
                      color={liveLocation ? BRAND_GREEN : TEXT_MUTED}
                    />
                  </Pressable>
                  <View style={styles.matchBox}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={BRAND_GREEN} />
                    <Text style={styles.matchText}>
                      Continuing saves your provider account. You will then add a selfie and CNIC front before submitting for review.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Stepper Navigation Actions */}
              <View style={styles.wizardActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous step"
                  accessibilityState={{ disabled: loading || Boolean(createdProvider.current) }}
                  disabled={loading || Boolean(createdProvider.current)}
                  onPress={goBack}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed ? styles.backButtonPressed : null
                  ]}
                >
                  <Ionicons name="chevron-back" size={18} color={TEXT_DARK} />
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>
                {mechanicStep < 2 ? (
                  <PrimaryButton
                    title="Next"
                    disabled={!canMoveNext}
                    onPress={goNext}
                    style={styles.nextButton}
                  />
                ) : (
                  <PrimaryButton
                    title="Continue to identity verification"
                    loading={loading}
                    disabled={!canSubmit || loading}
                    onPress={onSubmit}
                    style={styles.nextButton}
                  />
                )}
              </View>
            </View>
          )}

          {/* Section H — Login Navigation */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>
              Already have an account?{" "}
              <Link href={role === "mechanic" ? { pathname: "/(auth)/login", params: { role: "mechanic" } } : "/(auth)/login"} style={styles.loginLink}>
                Login
              </Link>
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authActions: { gap: 12 },
  googleAccount: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  googleAvatar: { width: 40, height: 40, borderRadius: 20 },
  safe: {
    flex: 1,
    backgroundColor: WHITE
  },
  bottomDecoration: {
    position: "absolute",
    left: "-15%",
    right: "-15%",
    bottom: -60,
    height: 160,
    borderTopLeftRadius: 300,
    borderTopRightRadius: 300,
    backgroundColor: BRAND_GREEN_SOFT,
    opacity: 0.65,
    zIndex: 0
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 40
  },
  contentWrap: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    zIndex: 1
  },

  // Section A — Branding
  brandingSection: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4
  },
  logoWrap: {
    width: 74,
    height: 74,
    borderRadius: 20,
    backgroundColor: BRAND_GREEN_SOFT,
    borderWidth: 1.5,
    borderColor: BRAND_GREEN,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: BRAND_GREEN,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }
  },
  logoImage: {
    width: "100%",
    height: "100%"
  },
  appName: {
    marginTop: 12,
    fontSize: 26,
    fontWeight: "900",
    color: TEXT_DARK,
    letterSpacing: -0.6,
    textAlign: "center"
  },
  tagline: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_MUTED,
    letterSpacing: 0.4,
    textAlign: "center"
  },

  // Section B — Heading
  headingSection: {
    marginTop: 26,
    marginBottom: 16,
    width: "100%"
  },
  screenHeading: {
    fontSize: 26,
    fontWeight: "900",
    color: TEXT_DARK,
    letterSpacing: -0.5
  },
  screenSubtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_MUTED
  },

  // Section C — Role Selector
  roleContainer: {
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F4F5F4",
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    padding: 4,
    flexDirection: "row",
    marginBottom: 18,
    width: "100%"
  },
  roleOption: {
    flex: 1,
    height: "100%",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  roleOptionSelected: {
    backgroundColor: BRAND_GREEN,
    shadowColor: BRAND_GREEN,
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  roleOptionText: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT_DARK
  },
  roleOptionTextSelected: {
    color: WHITE,
    fontWeight: "800"
  },

  // Error Alert
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DANGER_SOFT,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14
  },
  errorText: {
    flex: 1,
    color: DANGER_RED,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
  },

  // Section D — Inputs Group
  userForm: {
    width: "100%"
  },
  inputsGroup: {
    width: "100%"
  },
  fieldSpacer: {
    height: 12
  },
  eyeBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center"
  },

  // Section H — Login Link
  loginRow: {
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  loginText: {
    fontSize: 14,
    color: TEXT_MUTED
  },
  loginLink: {
    color: BRAND_GREEN,
    fontWeight: "800"
  },

  // Provider Stepper and Blocks
  mechanicBlock: {
    width: "100%",
    marginTop: 4
  },
  stepCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    backgroundColor: WHITE,
    padding: 16,
    shadowColor: TEXT_DARK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1
  },
  sectionTitle: {
    marginBottom: 12,
    color: TEXT_DARK,
    fontSize: 15,
    fontWeight: "800"
  },

  // Category Grid
  categoryGrid: {
    gap: 10
  },
  categoryButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER_LIGHT,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  categoryButtonSelected: {
    backgroundColor: BRAND_GREEN_SOFT,
    borderColor: BRAND_GREEN
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F4F5F4",
    alignItems: "center",
    justifyContent: "center"
  },
  categoryIconWrapSelected: {
    backgroundColor: WHITE
  },
  categoryText: {
    color: TEXT_DARK,
    fontSize: 14,
    fontWeight: "700"
  },
  categoryTextSelected: {
    color: BRAND_GREEN,
    fontWeight: "800"
  },

  // Requirement Card
  requirementCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#A9D5BF",
    backgroundColor: BRAND_GREEN_SOFT,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  requirementIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center"
  },
  requirementTitle: {
    color: BRAND_GREEN,
    fontSize: 13,
    fontWeight: "800"
  },
  requirementText: {
    marginTop: 2,
    color: TEXT_MUTED,
    fontSize: 12,
    lineHeight: 16
  },

  // Upload Rows
  uploadRow: {
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER_LIGHT,
    backgroundColor: WHITE,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10
  },
  uploadPreview: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#F4F5F4",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  uploadImage: {
    width: "100%",
    height: "100%"
  },
  uploadBody: {
    flex: 1,
    minWidth: 0
  },
  uploadTitle: {
    color: TEXT_DARK,
    fontSize: 13,
    fontWeight: "800"
  },
  optional: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: "600"
  },
  uploadStatus: {
    marginTop: 3,
    color: TEXT_MUTED,
    fontSize: 12,
    fontWeight: "600"
  },
  uploadStatusAttached: {
    color: BRAND_GREEN,
    fontWeight: "700"
  },
  uploadActions: {
    flexDirection: "row",
    gap: 8
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: BRAND_GREEN_SOFT,
    borderWidth: 1,
    borderColor: "#A9D5BF",
    alignItems: "center",
    justifyContent: "center"
  },
  iconButtonPressed: {
    backgroundColor: "#D6EBDC"
  },

  matchBox: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: BRAND_GREEN_SOFT,
    borderWidth: 1,
    borderColor: "#A9D5BF",
    padding: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  matchText: {
    flex: 1,
    color: BRAND_GREEN,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },

  // Location Button
  locationButton: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER_LIGHT,
    backgroundColor: WHITE,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  locationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: BRAND_GREEN_SOFT,
    alignItems: "center",
    justifyContent: "center"
  },
  locationTitle: {
    color: TEXT_DARK,
    fontSize: 13,
    fontWeight: "800"
  },
  locationSub: {
    marginTop: 2,
    color: TEXT_MUTED,
    fontSize: 11
  },
  locationText: {
    marginTop: 2,
    color: BRAND_GREEN,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },

  // Stepper Actions
  wizardActions: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  backButton: {
    height: 54,
    width: 100,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER_LIGHT,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  backButtonPressed: {
    backgroundColor: "#F4F5F4"
  },
  backButtonText: {
    color: TEXT_DARK,
    fontSize: 14,
    fontWeight: "700"
  },
  nextButton: {
    flex: 1
  }
});
