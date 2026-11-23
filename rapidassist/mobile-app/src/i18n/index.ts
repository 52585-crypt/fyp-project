import { I18nManager } from "react-native";

export type SupportedLanguage = "en" | "ur";

let currentLanguage: SupportedLanguage = "en";

export function setLanguage(lang: SupportedLanguage) {
  currentLanguage = lang;
}

export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

export const isRTL = () => currentLanguage === "ur" && I18nManager.isRTL;

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

// Base string dictionary supporting both English (default) and future Urdu toggle
export const strings = {
  en: {
    common: {
      appName: "RapidAssist",
      emergency: "EMERGENCY ROADSIDE",
      refresh: "Refresh",
      loading: "Loading...",
      cancel: "Cancel",
      decline: "Decline",
      approve: "Approve",
      retry: "Retry",
      offlineNotice: "Offline · Data may be delayed. Reconnect to retry actions.",
      pinLabel: "ARRIVAL PIN",
      ticketLabel: "JOB TICKET"
    },
    customer: {
      homeEyebrow: "HIGHWAY & ROADSIDE ASSISTANCE",
      homeTitle: "Need help right now?",
      homeSubtitle: "Instant towing, mobile mechanics, and roadside fuel.",
      activeJobTitle: "ACTIVE SERVICE TICKET",
      selectService: "SELECT ASSISTANCE TYPE",
      towing: "Car Towing",
      fuel: "Fuel Delivery",
      mechanic: "Mechanic",
      towingDesc: "Flatbed and wheel-lift towing to your workshop.",
      fuelDesc: "5L or 10L emergency petrol/diesel brought to you.",
      mechanicDesc: "On-site battery jump, tyre fix, and inspection.",
      trackingTitle: "SERVICE DISPATCH TRACKER",
      providerArriving: "Provider is on the way",
      providerArrived: "Provider has arrived on scene",
      extraWorkTitle: "ESTIMATE FOR EXTRA WORK",
      extraWorkNotice: "Review additional parts and labor before authorizing work.",
      callProvider: "Call Provider",
      chatProvider: "Message Chat"
    },
    provider: {
      dashboardTitle: "DISPATCH BOARD",
      dutyOnline: "READY FOR JOBS",
      dutyOffline: "OFFLINE",
      dutyTogglePrompt: "Toggle duty to receive nearby roadside requests",
      incomingOffer: "INCOMING DISPATCH OFFER",
      acceptDispatch: "ACCEPT DISPATCH",
      declineOffer: "DECLINE",
      dailyEarnings: "TODAY'S EARNINGS",
      weeklyEarnings: "THIS WEEK"
    }
  },
  ur: {
    common: {
      appName: "ریپڈ اسسٹ",
      emergency: "ہنگامی روڈ سائیڈ مدد",
      refresh: "تازہ کریں",
      loading: "لوڈ ہو رہا ہے...",
      cancel: "منسوخ",
      decline: "مسترد",
      approve: "منظور",
      retry: "دوبارہ کوشش کریں",
      offlineNotice: "آف لائن · رابطہ بحال کریں۔",
      pinLabel: "آمد پن کوڈ",
      ticketLabel: "جاب ٹکٹ"
    },
    customer: {
      homeEyebrow: "ہائی وے اور روڈ سائیڈ مدد",
      homeTitle: "گاڑی میں کوئی مسئلہ ہے؟",
      homeSubtitle: "فوری ٹوئنگ، آن سائٹ مکینک اور ہنگامی ایندھن۔",
      activeJobTitle: "جاری سروس ٹکٹ",
      selectService: "سروس کا انتخاب کریں",
      towing: "کار ٹوئنگ",
      fuel: "ایندھن کی ترسیل",
      mechanic: "مکینک سروس",
      towingDesc: "آپ کی گاڑی کو قریبی ورکشاپ منتقل کریں۔",
      fuelDesc: "5 یا 10 لیٹر پٹرول/ڈیزل جائے وقوعہ پر۔",
      mechanicDesc: "بیٹری جمپ اسٹارٹ، ٹائر اور مرمت۔",
      trackingTitle: "لائیو ٹریکنگ بورڈ",
      providerArriving: "مددگار راستے میں ہے",
      providerArrived: "مددگار پہنچ چکا ہے",
      extraWorkTitle: "اضافی کام کی منظوری",
      extraWorkNotice: "کام شروع کرنے سے پہلے تخمینہ چیک کریں۔",
      callProvider: "کال کریں",
      chatProvider: "چیٹ میسج"
    },
    provider: {
      dashboardTitle: "ڈسپیچ بورڈ",
      dutyOnline: "جابز کے لیے آن لائن",
      dutyOffline: "آف لائن",
      dutyTogglePrompt: "جابز وصول کرنے کے لیے آن لائن ہوں",
      incomingOffer: "نئی جاب کی آفر",
      acceptDispatch: "آفر قبول کریں",
      declineOffer: "مسترد کریں",
      dailyEarnings: "آج کی کمائی",
      weeklyEarnings: "اس ہفتے کی کمائی"
    }
  }
} as const;

export function t<Section extends keyof typeof strings.en, Key extends keyof (typeof strings.en)[Section]>(
  section: Section,
  key: Key
): string {
  const lang = currentLanguage;
  const dict = strings[lang] || strings.en;
  const sectionObj = dict[section] as Record<string, string>;
  const fallbackObj = strings.en[section] as Record<string, string>;
  return sectionObj?.[key as string] || fallbackObj?.[key as string] || "";
}
