import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "rapidassist.token";

export async function getToken() {
  try {
    const token = Platform.OS === "web"
      ? globalThis.localStorage.getItem(TOKEN_KEY)
      : await SecureStore.getItemAsync(TOKEN_KEY);
    return token?.trim() || null;
  } catch {
    throw new Error("Unable to read your saved session. Enable device storage and try again.");
  }
}

export async function setToken(token: string) {
  try {
    if (Platform.OS === "web") globalThis.localStorage.setItem(TOKEN_KEY, token);
    else await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    throw new Error("Unable to save your session. Check available device storage and try again.");
  }
}

export async function clearToken() {
  try {
    if (Platform.OS === "web") globalThis.localStorage.removeItem(TOKEN_KEY);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    throw new Error("Unable to remove your saved session. Please try signing out again.");
  }
}
