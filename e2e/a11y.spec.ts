import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility checks on screens that render without a signed-in user.
 * Signed-in screens are covered in app.spec.ts (needs Supabase).
 */

const PAGES = ["/", "/signin", "/signup", "/forgot-password", "/privacy", "/terms", "/disclaimer", "/ai-use", "/grievance", "/no-such-page", "/demo-portal", "/demo-portal/login"];

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
}

for (const path of PAGES) {
  test(`no serious axe violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test("Hindi pages have no serious axe violations and declare their language", async ({ page, context }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "hi", url: page.url() === "about:blank" ? (process.env.E2E_BASE_URL ?? "http://localhost:3100") : page.url() }]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  expect(await seriousViolations(page)).toEqual([]);
});

test("usable at 360px wide without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/", "/signin", "/privacy", "/demo-portal/login"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("keyboard: skip link reaches the main content and focus is visible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to main content/i });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});

test("security headers and a nonce-based CSP are present", async ({ request }) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("the demo portal always shows the fictional-portal banner and no government emblem", async ({ page }) => {
  await page.goto("/demo-portal");
  await expect(page.getByRole("note")).toHaveText("FICTIONAL DEMO PORTAL - NOT A GOVERNMENT WEBSITE");
  await expect(page.locator("img")).toHaveCount(0);
});
