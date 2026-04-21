import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "rapidassist.token";

function canUseSecureStore() {
  return (
    typeof (SecureStore as any)?.getItemAsync === "function" &&
    typeof (SecureStore as any)?.setItemAsync === "function"
  );
}

function canUseLocalStorage() {
  try {
    return typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export async function getToken() {
  let t: string | null = null;
  if (canUseSecureStore()) {
    try {
      t = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      // SecureStore is present but broken in some runtimes (web)
      t = null;
    }
  }
  if (!t && canUseLocalStorage()) {
    t = globalThis.localStorage.getItem(TOKEN_KEY);
  }
  if (!t) return null;
  if (t.trim() === "") return null;
  return t;
}

export async function setToken(token: string) {
  if (canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      return;
    } catch {
      // fallthrough to localStorage
    }
  }
  if (canUseLocalStorage()) {
    globalThis.localStorage.setItem(TOKEN_KEY, token);
  }
}

export async function clearToken() {
  if (canUseSecureStore() && typeof (SecureStore as any)?.deleteItemAsync === "function") {
    try {
      await (SecureStore as any).deleteItemAsync(TOKEN_KEY);
      return;
    } catch {
      // fallthrough to localStorage
    }
  }
  if (canUseLocalStorage()) {
    globalThis.localStorage.removeItem(TOKEN_KEY);
  }
}

