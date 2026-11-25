/** Helpers for driving the Expo (react-native-web) build with Playwright. */

/** Visible accessible controls on the page (buttons/inputs/links), for debugging and screen inventories. */
async function inventory(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const out = [];
    document.querySelectorAll('[role="button"],button,input,textarea,[role="link"],a,[role="tab"],[role="checkbox"],[role="radio"],[role="switch"]').forEach((el) => {
      if (!visible(el)) return;
      const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || (el.innerText || "").trim().slice(0, 40);
      out.push(`${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[${el.getAttribute("role")}]` : ""}:${label}`);
    });
    return [...new Set(out)];
  });
}

async function bodyText(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

/** Click the first visible control whose accessible name matches. */
async function tap(page, name, { timeout = 15000 } = {}) {
  const loc = page.getByRole("button", { name }).filter({ visible: true }).first();
  await loc.waitFor({ state: "visible", timeout });
  await loc.click();
}

async function fill(page, label, value, { timeout = 15000 } = {}) {
  const loc = page.getByLabel(label, { exact: true }).filter({ visible: true }).first();
  await loc.waitFor({ state: "visible", timeout });
  await loc.fill(value);
}

async function waitText(page, re, timeout = 20000) {
  await page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText), re.source, { timeout });
}

module.exports = { inventory, bodyText, tap, fill, waitText };
