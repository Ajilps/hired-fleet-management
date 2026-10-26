import { test, expect } from "@playwright/test";
import { mockApi, ids, user } from "./fixtures";
test("overview shows authoritative company counts, journeys and statements without overflow", async ({
  page,
}, info) => {
  await mockApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hello, Ananya." }),
  ).toBeVisible();
  await expect(page.locator(".welcome-banner .pill")).toBeVisible();
  await expect(page.locator(".metric-value")).toHaveText(["8", "3", "24", "4"]);
  await expect(
    page.getByRole("link", { name: /September 2026/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("overview.png"),
    fullPage: true,
  });
});
test("partner sign-in requests browser transport and keeps credentials outside storage", async ({
  page,
}, info) => {
  const calls = await mockApi(page, { authenticated: false });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Good to see you." })).toBeVisible();
  await page.screenshot({ path: info.outputPath("sign-in.png"), fullPage: true });
  await page.getByLabel("Work email").fill(user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic partner initial password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Ananya." }),
  ).toBeVisible();
  expect(
    calls.find((call) => call.path.endsWith("/login"))?.body?.transport,
  ).toBe("browser");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toMatch(/synthetic-in-memory-access|password|refresh/i);
});
test("first-login restriction requires a password change and fresh sign-in", async ({
  page,
}) => {
  const calls = await mockApi(page, { restricted: true });
  await page.goto("/orders/new");
  await expect(
    page.getByRole("heading", { name: "Make this account yours." }),
  ).toBeVisible();
  expect(calls.some((call) => call.path === "/orders")).toBe(false);
  await page.getByLabel("Current password").fill("Synthetic initial password");
  await page
    .getByLabel("New password", { exact: true })
    .fill("Synthetic chosen password");
  await page
    .getByLabel("Confirm new password")
    .fill("Synthetic chosen password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await expect(
    page.getByText("Password updated. Sign in with your new password."),
  ).toBeVisible();
});
test("wrong-role credentials never open company data", async ({ page }) => {
  const calls = await mockApi(page, { authenticated: false, role: "admin" });
  await page.goto("/login");
  await page.getByLabel("Work email").fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Use a partner account issued by your HireD administrator."),
  ).toBeVisible();
  expect(calls.some((call) => call.path.startsWith("/companies"))).toBe(false);
});
test("order review submits a strict partner DTO and retries an interrupted response with the same intent", async ({
  page,
}) => {
  const calls = await mockApi(page, { failFirstOrder: true });
  await page.goto("/orders/new");
  await page.getByLabel("Pickup address").fill("Synthetic pickup road");
  await page.getByLabel("Destination address").fill("Synthetic drop road");
  await page.getByLabel("Pickup date · IST").fill("2026-10-20");
  await page.getByLabel("Pickup time · IST").fill("10:30");
  await page.getByLabel("Contact phone").fill("+91 9000000000");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Request not confirmed")).toBeVisible();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(
    page.getByText(
      "Request received. HireD will review it and confirm the next steps.",
    ),
  ).toBeVisible();
  const writes = calls.filter(
    (call) => call.path === "/orders" && call.method === "POST",
  );
  expect(writes).toHaveLength(2);
  expect(writes[0].key).toBe(writes[1].key);
  expect(writes[0].body).not.toHaveProperty("companyId");
  expect(writes[0].body).not.toHaveProperty("source");
  expect(writes[0].body).not.toHaveProperty("totalAmount");
  expect(writes[0].body?.requestedPickupAt).toBe("2026-10-20T05:00:00.000Z");
});
test("order validation focuses the first invalid field and does not submit", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.getByLabel("Pickup address")).toBeFocused();
  expect(
    calls.some((call) => call.path === "/orders" && call.method === "POST"),
  ).toBe(false);
});
test("directories filter and paginate by contract without company identity filters", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto("/orders");
  await page.getByLabel("Status").selectOption("rejected");
  await expect(page.getByText("8 orders matching your filters")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("button", { name: "First page" })).toBeVisible();
  await page.getByLabel("From date").fill("2026-10-01");
  await page.getByLabel("To date").fill("2026-10-31");
  await expect(page).toHaveURL(/from=2026-10-01/);
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await expect(page.getByText("3 trips matching your filters")).toBeVisible();
  expect(calls.every((call) => !call.path.includes("companyId"))).toBe(true);
});
test("close code is explicit, transient, hidden after navigation and never stored", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto(`/trips/${ids.trip}`);
  await expect(page.getByLabel("Close code hidden")).toBeVisible();
  expect(calls.some((call) => call.path.endsWith("/reveal"))).toBe(false);
  await page.getByRole("button", { name: "Reveal close code" }).click();
  await expect(page.getByLabel("Revealed close code")).toHaveText("629741");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("629741");
  await page.getByRole("button", { name: "Hide code" }).click();
  await expect(page.getByLabel("Close code hidden")).toBeVisible();
  await page.getByRole("button", { name: "Reveal close code" }).click();
  await expect(page.getByLabel("Revealed close code")).toBeVisible();
  await page.getByRole("link", { name: "View original order" }).click();
  await expect(page.getByText("629741")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel("Close code hidden")).toBeVisible();
});
test("published statement and frozen report keep expenses separate from recorded shares", async ({
  page,
}, info) => {
  await mockApi(page);
  await page.goto(`/statements/${ids.statement}`);
  await expect(
    page.getByRole("heading", { name: "September 2026", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("₹7,000.00").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Approve|Publish|Pay now/ }),
  ).toHaveCount(0);
  await page.goto(`/reports/${ids.report}`);
  await expect(
    page.getByRole("heading", { name: "Recorded trip financials" }),
  ).toBeVisible();
  await expect(page.getByText("₹150.00").first()).toBeVisible();
  await page.screenshot({
    path: info.outputPath("closed-report.png"),
    fullPage: true,
  });
});
test("unpublished and foreign-company records are refused", async ({
  page,
}) => {
  await mockApi(page, { foreign: true, unpublished: true });
  await page.goto("/orders");
  await expect(
    page.getByText(
      "The server returned an unexpected response. Try refreshing.",
    ),
  ).toBeVisible();
  await page.goto(`/statements/${ids.statement}`);
  await expect(
    page.getByText(
      "The server returned an unexpected response. Try refreshing.",
    ),
  ).toBeVisible();
  await expect(page.getByText("₹7,000.00")).toHaveCount(0);
});
test("unavailable backend collections never masquerade as empty records or zero counts", async ({
  page,
}) => {
  await mockApi(page, { unavailable: true });
  await page.goto("/");
  await expect(page.locator(".metric-value")).toHaveText(["—", "—", "—", "—"]);
  await page.goto("/orders");
  await expect(
    page.getByText("This information is unavailable."),
  ).toBeVisible();
  await expect(page.getByText("No orders to show")).toHaveCount(0);
});
test("company account and navigation are usable at narrow sizes", async ({
  page,
}, info) => {
  await mockApi(page);
  await page.goto("/");
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Company & account" })
      .click();
  } else await page.getByRole("link", { name: "Company & account" }).click();
  await expect(
    page.getByRole("heading", { name: "Company & account" }),
  ).toBeVisible();
  await expect(page.getByText("Meridian Motors Private Limited")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Change password" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("company.png"),
    fullPage: true,
  });
});
test("server revocation returns to sign-in and removes protected content", async ({
  page,
}) => {
  await mockApi(page, { expire: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hello, Ananya." }),
  ).toHaveCount(0);
});
test("failed sign-out keeps the session and offers an explicit retry", async ({
  page,
}, info) => {
  await mockApi(page, { logoutFails: true });
  await page.goto("/company");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(page.getByText("Sign out not completed")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Company & account" }),
  ).toBeVisible();
});

test("320px layout preserves forms, navigation and financial records", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockApi(page);
  for (const route of [
    "/",
    "/orders/new",
    "/orders",
    `/reports/${ids.report}`,
    `/statements/${ids.statement}`,
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("new-order-narrow.png"),
    fullPage: true,
  });
});
test("login throttling disables resubmission until the server delay passes", async ({
  page,
}) => {
  await mockApi(page, { authenticated: false });
  await page.route("**/api/v1/auth-sessions/login", (route) =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": "2" },
      json: { error: { code: "RATE_LIMITED" } },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Try again in/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled({ timeout: 5000 });
});
test("bootstrap outage offers deliberate retry and sign-in recovery", async ({
  page,
}) => {
  await mockApi(page, { authenticated: false });
  await page.route("**/api/v1/auth-sessions/refresh", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Let’s reconnect." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
});
test("backgrounding the page clears exposed close-code state", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/trips/${ids.trip}`);
  await page.getByRole("button", { name: "Reveal close code" }).click();
  await expect(page.getByLabel("Revealed close code")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByLabel("Close code hidden")).toBeVisible();
  await expect(page.getByText("629741")).toHaveCount(0);
});
test("an explicitly empty collection is distinguished from a failed request", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/v1/orders?*", (route) =>
    route.fulfill({
      json: {
        items: [],
        pageInfo: { totalCount: 0, hasMore: false, nextCursor: null },
      },
    }),
  );
  await page.goto("/orders");
  await expect(
    page.getByRole("heading", { name: "No orders to show" }),
  ).toBeVisible();
  await expect(page.getByText("0 orders matching your filters")).toBeVisible();
});

test('returning after access expiry renews the business session before protected queries resume', async ({page}) => {
  const calls = await mockApi(page);
  await page.clock.install();
  await page.goto('/company');
  await expect(page.getByText('Meridian Motors Private Limited')).toBeVisible();
  let renewals = 0;
  await page.route('**/api/v1/auth-sessions/refresh', async route => {
    renewals++;
    const now = await page.evaluate(()=>Date.now());
    return route.fulfill({json:{user,transport:'browser',tokenType:'Bearer',accessToken:'synthetic-renewed-access',accessTokenExpiresAt:new Date(now+900_000).toISOString()}});
  });
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
  await page.clock.fastForward(2*60*60*1000);
  await expect(page.getByText('Opening your workspace…')).toBeVisible();
  expect(renewals).toBe(0);
  const before = calls.length;
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.getByText('Meridian Motors Private Limited')).toBeVisible();
  expect(renewals).toBe(1);
  expect(calls.slice(before).some(call=>call.path==='/auth-sessions/login')).toBe(false);
  await page.route('**/api/v1/auth-sessions/refresh',route=>route.fulfill({status:401,json:{error:{code:'UNAUTHORIZED'}}}));
  await page.clock.fastForward(24*60*60*1000);
  await expect(page.getByRole('heading',{name:'Good to see you.'})).toBeVisible();
});
