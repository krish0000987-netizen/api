import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Data setup runs against the same local database the app uses (.env).
function helper(...args: string[]): string {
  const quoted = args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(" ");
  return execSync(`npx tsx scripts/e2e-helper.ts ${quoted}`, { encoding: "utf8" });
}

const ADMIN_EMAIL = "admin@test.local";
const ADMIN_PASSWORD = "testpass123";
const CUSTOMER_EMAIL = `pw-${Date.now()}@t.local`;
const CUSTOMER_PASSWORD = "pwpass123456";

test.beforeAll(() => {
  // Ensure the two vendors exist (idempotent), then a fresh customer.
  helper("upsert-vendor", "sms", "SMS Vendor", "http://localhost:9100/sandbox", "sandbox-secret-1", "http://localhost:9100/live", "live-secret-2");
  helper("upsert-vendor", "payments", "Payments Vendor", "http://localhost:9100/sandbox", "psand-secret", "http://localhost:9100/live", "plive-secret", "1");
  helper("create-customer", CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
});

async function login(page: Page, url: string, email: string, password: string) {
  await page.goto(url);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
}

// Perform a real pointer drag from one element's center to another's center.
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move(to.x, to.y, { steps: 25 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

async function centerOf(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box: " + locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("Integration Builder (drag to enable)", () => {
  test("drag a vendor block onto the canvas, reorder, and remove it", async ({ page }) => {
    await login(page, "/login", CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/integrations");
    await expect(page.getByRole("heading", { name: "Integration Builder" })).toBeVisible();

    // Fresh customer: canvas is empty, both vendors in the palette.
    await expect(page.getByTestId("canvas-item-sms")).toHaveCount(0);
    await expect(page.getByTestId("palette-sms")).toBeVisible();

    // 1) Drag the SMS block onto the canvas.
    await drag(page, await centerOf(page.getByTestId("palette-sms")), await centerOf(page.getByTestId("canvas")));
    await expect(page.getByTestId("canvas-item-sms")).toBeVisible({ timeout: 8000 });

    // 2) Drag the payments block on too.
    await drag(page, await centerOf(page.getByTestId("palette-payments")), await centerOf(page.getByTestId("canvas-item-sms")));
    await expect(page.getByTestId("canvas-item-payments")).toBeVisible({ timeout: 8000 });

    // 3) Reorder: drag payments above sms (payments currently last).
    // Sortable rows only listen on their ⠿ handle button, so start there.
    const paymentsHandle = page.getByRole("button", { name: /reorder payments/i });
    const sms = await centerOf(page.getByTestId("canvas-item-sms"));
    await drag(page, await centerOf(paymentsHandle), sms);
    await page.waitForTimeout(500);

    const orderAfter = await page
      .locator('[data-testid^="canvas-item-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(orderAfter).toEqual(["canvas-item-payments", "canvas-item-sms"]);

    // 4) Remove payments via the button.
    await page.getByTestId("canvas-item-payments").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId("canvas-item-payments")).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId("palette-payments")).toBeVisible();
  });
});

test.describe("Dashboard widgets (drag to reorder, saved)", () => {
  test("reorder the Mode widget to the front and keep it after reload", async ({ page }) => {
    await login(page, "/login", CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    // Default order starts with "plan".
    const first = page.locator('[data-testid^="widget-"]').first();
    await expect(first).toHaveAttribute("data-testid", "widget-plan");

    // Drag the Mode widget's handle onto the Plan widget.
    const modeHandle = page.getByRole("button", { name: "Reorder Mode" });
    const planTarget = page.getByTestId("widget-plan");
    await drag(page, await centerOf(modeHandle), await centerOf(planTarget));
    await page.waitForTimeout(800);

    await expect(page.locator('[data-testid^="widget-"]').first()).toHaveAttribute("data-testid", "widget-mode");

    // Reload: the layout is saved per user, so it must persist.
    await page.reload();
    await expect(page.locator('[data-testid^="widget-"]').first()).toHaveAttribute("data-testid", "widget-mode");
  });
});

test.describe("Admin vendor fallback order (drag to reorder)", () => {
  test("reorder the fallback priority list and persist", async ({ page }) => {
    await login(page, "/admin/login", ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto("/admin/vendors");
    await expect(page.getByTestId("priority-payments")).toBeVisible();

    // Drag payments onto the current first row so it lands at the top,
    // regardless of what other vendors exist in the list. The priority list
    // sits below the fold on this page, so scroll both rows into view first.
    const firstRow = page.locator("[data-testid^='priority-']").first();
    const firstName = await firstRow.getAttribute("data-testid");
    if (firstName !== "priority-payments") {
      const handle = page.getByRole("button", { name: /reorder payments/i });
      await handle.scrollIntoViewIfNeeded();
      await firstRow.scrollIntoViewIfNeeded();
      await drag(page, await centerOf(handle), await centerOf(firstRow));
      await page.waitForTimeout(800);
    }

    await expect(page.locator("[data-testid^='priority-']").first()).toHaveAttribute("data-testid", "priority-payments");

    // Reload: priorities persist.
    await page.reload();
    await expect(page.locator("[data-testid^='priority-']").first()).toHaveAttribute("data-testid", "priority-payments");
  });
});
