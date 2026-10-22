import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:3002/api/v1";
const adminEmail = `live-business-admin-${randomUUID()}@example.test`;
const adminPassword = "Synthetic live business admin password";
test.beforeAll(() => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli/create-admin.ts",
      "--email",
      adminEmail,
      "--name",
      "Synthetic Business Admin",
    ],
    {
      cwd: fileURLToPath(new URL("../../backend", import.meta.url)),
      env: { ...process.env, ADMIN_BOOTSTRAP_PASSWORD: adminPassword },
      stdio: "pipe",
    },
  );
});
test("real partner provisioning, first-login change, cookie restoration, own-company read, logout and account revocation", async ({
  page,
}, info) => {
  const adminLogin = await page.request.post(`${api}/auth-sessions/login`, {
    data: { email: adminEmail, password: adminPassword },
  });
  expect(adminLogin.status()).toBe(200);
  const administrator = await adminLogin.json();
  const adminHeaders = {
    Authorization: `Bearer ${administrator.accessToken}`,
    "Idempotency-Key": randomUUID(),
  };
  const createCompany = await page.request.post(`${api}/companies`, {
    headers: adminHeaders,
    data: {
      legalName: "Synthetic Business Portal Private Limited",
      displayName: "Synthetic Partner Company",
      contactName: "Synthetic Partner",
      contactEmail: "synthetic-billing@example.test",
      contactPhone: "+91 synthetic",
      billingAddress: "Synthetic Business Park, Kochi",
      initialPayoutRate: { driverPercent: "30.00", companyPercent: "70.00" },
    },
  });
  expect(createCompany.status()).toBe(201);
  const company = await createCompany.json();
  const email = `live-business-partner-${randomUUID()}@example.test`;
  const initialPassword = "Synthetic initial partner password";
  const chosenPassword = "Synthetic chosen partner password";
  const createPartner = await page.request.post(
    `${api}/companies/${company.id}/partners`,
    {
      headers: { ...adminHeaders, "Idempotency-Key": randomUUID() },
      data: {
        email,
        fullName: "Synthetic Business Partner",
        phone: "+91 synthetic",
        initialPassword,
        isPrimaryContact: true,
      },
    },
  );
  expect(createPartner.status()).toBe(201);
  const partner = await createPartner.json();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make this account yours." }),
  ).toBeVisible();
  await page.getByLabel("Current password").fill(initialPassword);
  await page.getByLabel("New password", { exact: true }).fill(chosenPassword);
  await page.getByLabel("Confirm new password").fill(chosenPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByText("Password updated. Sign in with your new password."),
  ).toBeVisible();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(chosenPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Synthetic." }),
  ).toBeVisible();
  await expect(page.locator(".metric-value")).toHaveText(["0", "0", "0", "—"]);
  await page.goto("/company");
  await expect(
    page.getByText("Synthetic Business Portal Private Limited"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Synthetic Business Portal Private Limited"),
  ).toBeVisible();
  const cookies = await page
    .context()
    .cookies("http://127.0.0.1:3002/api/v1/auth-sessions");
  expect(
    cookies.some(
      (cookie) => cookie.name === "hired_refresh" && cookie.httpOnly,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toMatch(/accessToken|refreshToken|password/i);
  await page.screenshot({
    path: info.outputPath("partner-company-live.png"),
    fullPage: true,
  });
  const native = await (
    await page.request.post(`${api}/auth-sessions/login`, {
      data: { email, password: chosenPassword },
    })
  ).json();
  expect(
    (
      await page.request.get(`${api}/companies/${randomUUID()}`, {
        headers: { Authorization: `Bearer ${native.accessToken}` },
      })
    ).status(),
  ).toBe(404);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(chosenPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Synthetic." }),
  ).toBeVisible();
  const disable = await page.request.patch(
    `${api}/users/${partner.user.id}/status`,
    {
      headers: { ...adminHeaders, "Idempotency-Key": randomUUID() },
      data: {
        isActive: false,
        reason: "Synthetic partner portal revocation verification",
      },
    },
  );
  expect(disable.status()).toBe(200);
  await page.goto("/company");
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
});
