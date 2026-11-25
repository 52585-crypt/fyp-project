// Pure translation core (no React Native imports), so plain modules and tests can use it.
// Language state, the English/Urdu dictionaries, t() and tp(). src/i18n/index.ts re-exports all of this.

export type SupportedLanguage = "en" | "ur";

let currentLanguage: SupportedLanguage = "en";
const listeners = new Set<(lang: SupportedLanguage) => void>();

export function setLanguage(lang: SupportedLanguage) {
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  listeners.forEach((listener) => listener(lang));
}

export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

/** Called after every language change; returns an unsubscribe function. */
export function onLanguageChange(listener: (lang: SupportedLanguage) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Urdu is written right to left. */
export function isRightToLeft(lang: SupportedLanguage = currentLanguage) {
  return lang === "ur";
}

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** True when the text contains Urdu (Arabic-script) characters, so it should run right to left. */
export function hasRightToLeftText(text: unknown): boolean {
  if (typeof text === "string") return ARABIC_SCRIPT.test(text);
  if (Array.isArray(text)) return text.some(hasRightToLeftText);
  return false;
}

/** A stored preference as a supported language; anything else (missing, corrupted) means English. */
export function parseStoredLanguage(value: unknown): SupportedLanguage {
  return value === "ur" ? "ur" : "en";
}

// Base string dictionary supporting both English (default) and future Urdu toggle
export const strings = {
  en: {
    nearby: {
      approxNotice: "Location shown is approximate. We send your request to the best available provider nearby.",
      listSummary: "{count} online near your pickup · locations are approximate. We send your request to the best available provider.",
      listLabel: "Nearby {service} providers",
      emptyTitle: "No providers nearby right now",
      emptyMessage: "You can still send a request and we will look for an available provider for you.",
      offlineTitle: "Can't load nearby providers",
      offlineMessage: "You seem to be offline. We'll retry automatically when you're back online.",
      offlineSince: "Offline – showing last update from {time}. Retrying…",
      offlineNothing: "Offline – couldn't load nearby providers yet. Retrying…",
      viewMap: "Map",
      viewList: "List",
      viewToggle: "Show nearby providers as",
      request: "Request {service}",
      rating: "Rating",
      ratingValue: "{rating} from {count} reviews",
      newProvider: "New provider",
      jobs: "Jobs",
      jobsCompleted: "{count} completed",
      distance: "Distance",
      eta: "ETA",
      etaAbout: "about {minutes} min",
      etaCalculating: "calculating",
      etaUnavailable: "unavailable",
      closeDetails: "Close provider details",
      bandUnder2: "under 2 km",
      band2to5: "2–5 km",
      band5to10: "5–10 km",
      band10plus: "10+ km"
    },
    location: {
      mapLabel: "Map of your location",
      mapLabelApprox: "Map of your approximate location",
      approximateWithin: "Approximate, within about {meters} m",
      approximateSuffix: " (approximate)"
    },
    tracking: {
      towOnTheWay: "Your vehicle is on the way",
      towTo: "To {place}",
      towDropoffFallback: "the drop-off location",
      remaining: "Remaining",
      eta: "ETA",
      wholeTrip: "Whole trip",
      gpsDelayed: "The driver's live location is delayed. Showing the last known spot.",
      pickedUp: "Picked up"
    },
    settings: {
      language: "Language",
      languageHint: "Labels without a translation stay in English. Messages from the server are in English for now."
    },
    providerNav: {
      toPickup: "Navigate to pickup",
      toDropoff: "Navigate to drop-off",
      hint: "Opens Google Maps driving directions",
      noPickup: "The pickup location is unavailable.",
      noDropoff: "This job has no drop-off location.",
      noMapsApp: "No maps app or browser could open the directions."
    },
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
    nearby: {
      approxNotice: "دکھایا گیا مقام تخمینی ہے۔ ہم آپ کی درخواست قریب ترین دستیاب مددگار کو بھیجتے ہیں۔",
      listSummary: "{count} مددگار آپ کے پک اپ کے قریب آن لائن ہیں · مقامات تخمینی ہیں۔ ہم آپ کی درخواست بہترین دستیاب مددگار کو بھیجتے ہیں۔",
      listLabel: "قریبی {service} مددگار",
      emptyTitle: "اس وقت قریب کوئی مددگار دستیاب نہیں",
      emptyMessage: "آپ پھر بھی درخواست بھیج سکتے ہیں، ہم آپ کے لیے دستیاب مددگار تلاش کریں گے۔",
      offlineTitle: "قریبی مددگار لوڈ نہیں ہو سکے",
      offlineMessage: "لگتا ہے آپ آف لائن ہیں۔ رابطہ بحال ہوتے ہی ہم خود دوبارہ کوشش کریں گے۔",
      offlineSince: "آف لائن – {time} کی آخری معلومات دکھائی جا رہی ہیں۔ دوبارہ کوشش جاری ہے…",
      offlineNothing: "آف لائن – قریبی مددگار ابھی لوڈ نہیں ہو سکے۔ دوبارہ کوشش جاری ہے…",
      viewMap: "نقشہ",
      viewList: "فہرست",
      viewToggle: "قریبی مددگار اس طرح دکھائیں",
      request: "{service} کی درخواست کریں",
      rating: "ریٹنگ",
      ratingValue: "{count} جائزوں میں {rating}",
      newProvider: "نیا مددگار",
      jobs: "مکمل کام",
      jobsCompleted: "{count} مکمل",
      distance: "فاصلہ",
      eta: "متوقع وقت",
      etaAbout: "تقریباً {minutes} منٹ",
      etaCalculating: "حساب جاری ہے",
      etaUnavailable: "دستیاب نہیں",
      closeDetails: "مددگار کی تفصیل بند کریں",
      bandUnder2: "2 کلومیٹر سے کم",
      band2to5: "2–5 کلومیٹر",
      band5to10: "5–10 کلومیٹر",
      band10plus: "10+ کلومیٹر"
    },
    location: {
      mapLabel: "آپ کے مقام کا نقشہ",
      mapLabelApprox: "آپ کے تخمینی مقام کا نقشہ",
      approximateWithin: "تخمینی، تقریباً {meters} میٹر کے اندر",
      approximateSuffix: " (تخمینی)"
    },
    tracking: {
      towOnTheWay: "آپ کی گاڑی راستے میں ہے",
      towTo: "منزل: {place}",
      towDropoffFallback: "ڈراپ آف کی جگہ",
      remaining: "باقی فاصلہ",
      eta: "متوقع وقت",
      wholeTrip: "کل سفر",
      gpsDelayed: "ڈرائیور کا لائیو مقام تاخیر سے آ رہا ہے۔ آخری معلوم جگہ دکھائی جا رہی ہے۔",
      pickedUp: "یہاں سے اٹھائی گئی"
    },
    settings: {
      language: "زبان",
      languageHint: "جن عبارتوں کا ترجمہ نہیں ہوا وہ انگریزی میں رہیں گی۔ سرور کے پیغامات فی الحال انگریزی میں ہیں۔"
    },
    providerNav: {
      toPickup: "پک اپ تک راستہ",
      toDropoff: "ڈراپ آف تک راستہ",
      hint: "گوگل میپس میں ڈرائیونگ کا راستہ کھولتا ہے",
      noPickup: "پک اپ کی جگہ دستیاب نہیں۔",
      noDropoff: "اس جاب کی کوئی ڈراپ آف جگہ نہیں۔",
      noMapsApp: "راستہ کھولنے کے لیے کوئی نقشہ ایپ یا براؤزر دستیاب نہیں۔"
    },
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

/** t() with {placeholders} filled in, e.g. tp("nearby", "etaAbout", { minutes: 7 }) → "about 7 min". */
export function tp<Section extends keyof typeof strings.en, Key extends keyof (typeof strings.en)[Section]>(
  section: Section,
  key: Key,
  values: Record<string, string | number>
): string {
  return t(section, key).replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
