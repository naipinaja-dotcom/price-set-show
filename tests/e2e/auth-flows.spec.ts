import { test, expect } from "@playwright/test";
import { stubSupabase } from "./_stub";

// Main UI entry-flow: routing guards + the login form. Supabase is stubbed
// (see _stub.ts) so these run offline and deterministically.

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
});

test("unauthenticated root redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk ke DASH" })).toBeVisible();
});

test("protected admin route redirects unauthenticated users to /login", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("login page renders the admin form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Masuk ke DASH" })).toBeVisible();
  await expect(page.getByPlaceholder("admin@dash.id")).toBeVisible();
  await expect(page.getByRole("button", { name: "Masuk", exact: true })).toBeVisible();
});

test("empty admin submit shows a client-side validation error", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByText("Email & password wajib diisi")).toBeVisible();
  // still on the login page (no navigation)
  await expect(page).toHaveURL(/\/login$/);
});

test("switching to Rider mode reveals the Kode Mitra field", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Rider", exact: true }).click();
  await expect(page.getByPlaceholder("MTR0001")).toBeVisible();
  await expect(page.getByText("Belum pernah login? Buat PIN pertama kali")).toBeVisible();
});

test("first-time PIN flow rejects mismatched PINs", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Rider", exact: true }).click();
  await page.getByText("Belum pernah login? Buat PIN pertama kali").click();

  await page.getByPlaceholder("MTR0001").fill("MTR0001");
  await page.getByPlaceholder("0812...").fill("081234567890");
  const pinFields = page.getByPlaceholder("4-8 digit");
  await pinFields.nth(0).fill("1234");
  await pinFields.nth(1).fill("5678");
  await page.getByRole("button", { name: /Buat PIN & Masuk/ }).click();

  await expect(page.getByText("PIN baru tidak sama")).toBeVisible();
});

test("admin login with wrong credentials surfaces an error and stays on /login", async ({ page }) => {
  await stubSupabase(page, { loginSucceeds: false });
  await page.goto("/login");
  await page.getByPlaceholder("admin@dash.id").fill("admin@dash.id");
  await page.getByPlaceholder("••••••••").fill("wrongpass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();

  // Sonner renders a toast; login must not navigate away
  await expect(page.locator("[data-sonner-toast]")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
