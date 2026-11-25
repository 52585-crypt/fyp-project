import { getLanguage, setLanguage, strings, t, tp } from "./translate";

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
});
