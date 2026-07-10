import type { Page } from "@playwright/test";

// Intercepts every Supabase call the browser makes so e2e runs fully offline
// and never reaches the real database. Auth token requests return a scripted
// outcome; all other REST/auth calls resolve empty. Call at the top of a test
// BEFORE page.goto().
export async function stubSupabase(page: Page, opts: { loginSucceeds?: boolean } = {}) {
  // gotrue auth endpoints (login, refresh, logout, user)
  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/token")) {
      if (opts.loginSucceeds) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            access_token: "stub-access",
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "stub-refresh",
            user: { id: "stub-user", email: "admin@dash.id", aud: "authenticated" },
          }),
        });
      }
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  // PostgREST data endpoints — return empty result sets
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}
