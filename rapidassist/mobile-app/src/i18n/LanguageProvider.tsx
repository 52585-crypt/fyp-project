import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { getLanguage, parseStoredLanguage, setLanguage, type SupportedLanguage } from "./translate";

export const LANGUAGE_STORAGE_KEY = "rapidassist.language";

type LanguageContextValue = { language: SupportedLanguage; changeLanguage: (next: SupportedLanguage) => Promise<void> };
const LanguageContext = createContext<LanguageContextValue>({ language: "en", changeLanguage: async () => {} });

/** On web, tell the browser (screen readers, fonts, spell-check) which language the page is in. */
function markDocument(lang: SupportedLanguage) {
  if (Platform.OS === "web" && typeof document !== "undefined") document.documentElement.lang = lang;
}

/**
 * The app language (English / Urdu): loaded from storage before the first render, persisted on change.
 * t() reads module state, so on a change the screens below are re-keyed and render again with the new strings
 * (the navigation container sits above this provider, so the current screen is kept).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setState] = useState<SupportedLanguage | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((stored) => parseStoredLanguage(stored))
      .catch(() => "en" as const)
      .then((lang) => { if (!active) return; setLanguage(lang); markDocument(lang); setState(lang); });
    return () => { active = false; };
  }, []);

  const changeLanguage = useCallback(async (next: SupportedLanguage) => {
    if (next === getLanguage()) return;
    setLanguage(next);
    markDocument(next);
    setState(next);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ language: language ?? "en", changeLanguage }), [language, changeLanguage]);
  if (!language) return null;
  return <LanguageContext.Provider value={value}><Fragment key={language}>{children}</Fragment></LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
