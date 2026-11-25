import { getLanguage, hasRightToLeftText, isRightToLeft, onLanguageChange, parseStoredLanguage, setLanguage, strings, t, tp } from "./translate";

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe("translations", () => {
  afterEach(() => setLanguage("en"));

  it("has the same sections, keys and {placeholders} in English and Urdu, none empty", () => {
    const en = strings.en as Record<string, Record<string, string>>;
    const ur = strings.ur as Record<string, Record<string, string>>;
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
    for (const section of Object.keys(en)) {
      expect(Object.keys(ur[section]).sort()).toEqual(Object.keys(en[section]).sort());
      for (const key of Object.keys(en[section])) {
        expect(`${section}.${key}: ${en[section][key].trim().length > 0 && ur[section][key].trim().length > 0}`).toBe(`${section}.${key}: true`);
        expect([section, key, placeholders(ur[section][key])]).toEqual([section, key, placeholders(en[section][key])]);
      }
    }
  });

  it("fills placeholders and follows the selected language", () => {
    expect(getLanguage()).toBe("en");
    expect(tp("nearby", "etaAbout", { minutes: 7 })).toBe("about 7 min");
    expect(tp("nearby", "request", { service: "Car Towing" })).toBe("Request Car Towing");
    expect(tp("nearby", "etaAbout", {})).toBe("about {minutes} min");
    setLanguage("ur");
    expect(tp("nearby", "etaAbout", { minutes: 7 })).toBe("تقریباً 7 منٹ");
    expect(t("nearby", "viewList")).toBe("فہرست");
  });

  it("notifies listeners once per real change and treats Urdu as right to left", () => {
    const seen: string[] = [];
    const stop = onLanguageChange((lang) => seen.push(lang));
    setLanguage("ur");
    setLanguage("ur");
    expect(isRightToLeft()).toBe(true);
    setLanguage("en");
    stop();
    setLanguage("ur");
    expect(seen).toEqual(["ur", "en"]);
    expect(isRightToLeft("en")).toBe(false);
  });

  it("reads a stored preference safely", () => {
    expect(parseStoredLanguage("ur")).toBe("ur");
    expect(parseStoredLanguage("en")).toBe("en");
    for (const bad of [null, undefined, "", "fr", "UR", 1]) expect(parseStoredLanguage(bad)).toBe("en");
  });

  it("detects Urdu text so only it runs right to left", () => {
    expect(hasRightToLeftText("زبان")).toBe(true);
    expect(hasRightToLeftText(["Request ", "کار ٹوئنگ"])).toBe(true);
    expect(hasRightToLeftText("Vehicles")).toBe(false);
    expect(hasRightToLeftText(["3.8", " (5)"])).toBe(false);
    expect(hasRightToLeftText(42)).toBe(false);
    expect(hasRightToLeftText(null)).toBe(false);
  });
});
