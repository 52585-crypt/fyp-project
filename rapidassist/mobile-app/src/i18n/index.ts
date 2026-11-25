import { I18nManager } from "react-native";
import { getLanguage } from "./translate";

export { getLanguage, isRightToLeft, onLanguageChange, setLanguage, strings, t, tp, type SupportedLanguage } from "./translate";

export const isRTL = () => getLanguage() === "ur" && I18nManager.isRTL;

export const formatCurrency = (amount: number | string | undefined | null): string => {
  const num = Number(amount || 0);
  return `PKR ${num.toLocaleString("en-US")}`;
};

export const formatTabularETA = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined) return "-- MIN";
  const formatted = String(Math.max(1, Math.round(minutes))).padStart(2, "0");
  return `${formatted} MIN`;
};

export const formatTabularDistance = (km: number | null | undefined): string => {
  if (km === null || km === undefined) return "-- KM";
  return `${km.toFixed(1)} KM`;
};

