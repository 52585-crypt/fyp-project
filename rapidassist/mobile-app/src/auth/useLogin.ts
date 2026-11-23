import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { getNetworkErrorMessage } from "../config/api";
import { authDestination, login } from "./auth.api";
import { useAuth } from "./AuthProvider";
import { resumeAfterSignIn } from "./customerNavigation";
import { useGoogleSignIn } from "./GoogleSignInOption";

/** Phone + password and Google sign-in state for the Login screen. */
export function useLogin() {
  const { role, returnTo } = useLocalSearchParams<{ role?: string; returnTo?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState(role === "mechanic");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const { setSession } = useAuth();
  const google = useGoogleSignIn(setError, provider ? "mechanic_login" : "customer", undefined, undefined, returnTo);
  const canSubmit = Boolean(phone.trim() && password) && !loading && !google.googleLoading;

  async function signInWithPhone() {
    if (pending.current || google.googleLoading || !phone.trim() || !password) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await login({ phone: phone.trim(), password });
      await setSession(token, user);
      router.replace(resumeAfterSignIn(user, returnTo) ?? authDestination(user));
    } catch (failure) {
      setError(getNetworkErrorMessage(failure));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  function chooseAccountType(isProvider: boolean) {
    setProvider(isProvider);
    setError(null);
  }

  return { phone, setPhone, password, setPassword, provider, chooseAccountType, loading, error, canSubmit, signInWithPhone, ...google };
}
