import { etaLabel } from "./useProviderPreview";

describe("provider ETA label", () => {
  it("says 'about X min', never less than a minute, and nothing when unknown", () => {
    expect(etaLabel(7.4)).toBe("about 7 min");
    expect(etaLabel(0.2)).toBe("about 1 min");
    expect(etaLabel(null)).toBeNull();
  });
});
