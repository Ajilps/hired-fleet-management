import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createSessionResponse } from "../src/test/auth-fixtures";
import {
  allDriverDocuments,
  downloadLinkResponse,
  driverDocumentList,
  fileAssetResponse,
  syntheticPdf,
  syntheticPng,
  TEST_ASSET_ID,
  TEST_PRIVATE_URL,
} from "../src/test/driver-document-fixtures";
import {
  driverList,
  driverResponse,
  TEST_DRIVER_ID,
} from "../src/test/driver-fixtures";
import {
  mockCurrentAdmin,
  mockEmptyOverview,
  openNavigation,
  signIn,
} from "./auth-helpers";

async function openDriver(page: Page) {
  await page.goto("/login");
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  await openNavigation(page);
  await page.getByRole("link", { name: "Drivers", exact: true }).click();
  await page.getByRole("link", { name: "View Test Driver" }).click();
  await expect(
    page.getByRole("heading", { name: "Test Driver", exact: true }),
  ).toBeVisible();
}
async function openLicence(page: Page) {
  await page
    .getByRole("button", { name: "View Driving Licence privately" })
    .click();
}
async function checkWidths(page: Page) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible())
      expect(
        await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
  }
}
test.beforeEach(async ({ page }) => {
  await mockCurrentAdmin(page);
  await mockEmptyOverview(page);
  await page.route("**/api/v1/auth-sessions/login", (route) =>
    route.fulfill({ json: createSessionResponse() }),
  );
  await page.route("**/api/v1/drivers?*", (route) =>
    route.fulfill({ json: driverList() }),
  );
  await page.route(`**/api/v1/drivers/${TEST_DRIVER_ID}`, (route) =>
    route.fulfill({ json: driverResponse() }),
  );
  await page.route("**/api/v1/drivers/*/documents?*", (route) =>
    route.fulfill({ json: driverDocumentList(allDriverDocuments()) }),
  );
  await page.route("**/api/v1/file-assets/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return route.fulfill({ json: fileAssetResponse({ id }) });
  });
  await page.route("**/api/v1/file-assets/*/download-links", (route) =>
    route.fulfill({ json: downloadLinkResponse() }),
  );
  await page.route("https://files.example.test/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(syntheticPng()),
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
});

test("shows all four current uploads and privately previews images/PDFs with modal focus and cleanup", async ({
  page,
}, testInfo) => {
  const calls: string[] = [];
  let image: Buffer = Buffer.from(syntheticPng());
  await page.route("**/api/v1/file-assets/*", (route) => {
    calls.push(route.request().url());
    expect(route.request().headers().authorization).toBe(
      "Bearer synthetic-access-token",
    );
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return route.fulfill({
      json: fileAssetResponse({ id, sizeBytes: image.byteLength }),
    });
  });
  await page.route("https://files.example.test/**", (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers().cookie).toBeUndefined();
    expect(route.request().headers().referer).toBeUndefined();
    return route.fulfill({
      contentType: "image/png",
      body: image,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await openDriver(page);
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 480;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#eef2ff";
    context.fillRect(0, 0, 800, 480);
    context.fillStyle = "#24245c";
    context.font = "bold 32px sans-serif";
    context.fillText("SYNTHETIC TEST DOCUMENT", 50, 95);
    context.font = "22px sans-serif";
    context.fillText("No real personal information", 50, 160);
    context.fillText("Sample reference: TEST-XXXX-1234", 50, 220);
    return canvas.toDataURL("image/png");
  });
  image = Buffer.from(dataUrl.split(",")[1], "base64");
  for (const type of ["Driving Licence", "Aadhaar", "PAN", "PCC"])
    await expect(
      page.getByRole("button", { name: `View ${type} privately` }),
    ).toBeVisible();
  expect(calls).toHaveLength(0);
  await checkWidths(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: testInfo.outputPath("driver-documents-desktop.png"),
    fullPage: true,
  });
  await openLicence(page);
  const dialog = page.getByRole("dialog", {
    name: "Driving Licence · Private preview",
  });
  const preview = dialog.getByRole("img", {
    name: "Driving Licence private document",
  });
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBe(800);
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect(page.locator('[src*="signature="]')).toHaveCount(0);
  const storage = await page.evaluate(() => [
    JSON.stringify(localStorage),
    JSON.stringify(sessionStorage),
    location.href,
  ]);
  expect(storage.join(" ")).not.toContain("synthetic-only");
  await expect(
    dialog.getByRole("button", { name: "Close preview" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await checkWidths(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: testInfo.outputPath("private-preview-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 1100 });
  await page.screenshot({
    path: testInfo.outputPath("private-preview-mobile.png"),
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "View Driving Licence privately" }),
  ).toBeFocused();
  const pdf = syntheticPdf();
  await page.route("**/api/v1/file-assets/*", (route) =>
    route.fulfill({
      json: fileAssetResponse({
        id: new URL(route.request().url()).pathname.split("/").at(-1)!,
        mimeType: "application/pdf",
        sizeBytes: pdf.byteLength,
      }),
    }),
  );
  await page.route("https://files.example.test/**", (route) =>
    route.fulfill({
      contentType: "application/pdf",
      body: Buffer.from(pdf),
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.getByRole("button", { name: "View PAN privately" }).click();
  await expect(page.getByTitle("PAN PDF preview")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(page.getByTitle("PAN PDF preview")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("private-pdf-preview.png"),
  });
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(page.getByTitle("PAN PDF preview")).toHaveCount(0);
});

test("finishes document pagination before showing missing uploads and keeps the profile visible after document-only failures", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const documents = allDriverDocuments();
  await page.route("**/api/v1/drivers/*/documents?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("isCurrent")).toBe("true");
    if (params.has("cursor")) {
      await gate;
      await route.fulfill({
        json: driverDocumentList(documents.slice(1, 3), 3),
      });
      return;
    }
    await route.fulfill({
      json: driverDocumentList(documents.slice(0, 1), 3, "next/current"),
    });
  });
  await openDriver(page);
  await expect(
    page.getByText("Loading documents…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No current upload.", { exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("region", { name: "PCC", exact: true }),
  ).toContainText("No current upload.");
  await expect(
    page.getByRole("button", { name: "View Aadhaar privately" }),
  ).toBeVisible();
  await page.route("**/api/v1/drivers/*/documents?*", (route) =>
    route.fulfill({ status: 503, json: { error: {} } }),
  );
  await page.getByRole("button", { name: "Refresh documents" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText(
      "These upload records may be stale. Refresh documents before opening a file.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Driving Licence privately" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Synthetic address, Bengaluru", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/drivers/*/documents?*", (route) =>
    route.fulfill({ json: driverDocumentList([]) }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("No current upload.", { exact: true }),
  ).toHaveCount(4);
});

test("recovers from an initial document-list denial without ending the admin session", async ({
  page,
}) => {
  await page.route("**/api/v1/drivers/*/documents?*", (route) =>
    route.fulfill({ status: 403, json: { error: {} } }),
  );
  await openDriver(page);
  await expect(page.getByRole("alert")).toContainText("You do not have access");
  await expect(
    page.getByRole("heading", { name: "Test Driver", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Driving Licence privately" }),
  ).toHaveCount(0);
  await page.route("**/api/v1/drivers/*/documents?*", (route) =>
    route.fulfill({ json: driverDocumentList() }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View Driving Licence privately" }),
  ).toBeVisible();
});

test("blocks pending/rejected scan results and recovers from file-level access denial", async ({
  page,
}) => {
  let scanStatus = "pending";
  let links = 0;
  let denied = true;
  await page.route(`**/api/v1/file-assets/${TEST_ASSET_ID}`, (route) =>
    route.fulfill({ json: fileAssetResponse({ scanStatus }) }),
  );
  await page.route(
    `**/api/v1/file-assets/${TEST_ASSET_ID}/download-links`,
    (route) => {
      links++;
      return route.fulfill(
        denied
          ? { status: 403, json: { error: {} } }
          : { json: downloadLinkResponse() },
      );
    },
  );
  await openDriver(page);
  await openLicence(page);
  await expect(page.getByRole("alert")).toContainText("still being scanned");
  expect(links).toBe(0);
  scanStatus = "rejected";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("scan was rejected");
  expect(links).toBe(0);
  scanStatus = "clean";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("You do not have access");
  denied = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Driving Licence private document" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Test Driver", exact: true }),
  ).toBeVisible();
});

test("renews expired/unavailable links, honors server retry delays and clears expired previews", async ({
  page,
}) => {
  let mode = "expired";
  let linkRequests = 0;
  await page.route(
    `**/api/v1/file-assets/${TEST_ASSET_ID}/download-links`,
    (route) => {
      linkRequests++;
      if (mode === "throttled")
        return route.fulfill({
          status: 429,
          headers: { "Retry-After": "1" },
          json: { error: {} },
        });
      return route.fulfill({
        json: downloadLinkResponse({
          expiresAt:
            mode === "expired"
              ? "2000-01-01T00:00:00Z"
              : new Date(
                  Date.now() + (mode === "short" ? 1800 : 60_000),
                ).toISOString(),
        }),
      });
    },
  );
  await page.route("https://files.example.test/**", (route) =>
    route.fulfill(
      mode === "unavailable"
        ? { status: 403, headers: { "Access-Control-Allow-Origin": "*" } }
        : {
            contentType: "image/png",
            body: Buffer.from(syntheticPng()),
            headers: { "Access-Control-Allow-Origin": "*" },
          },
    ),
  );
  await openDriver(page);
  await openLicence(page);
  await expect(page.getByRole("alert")).toContainText("private link expired");
  mode = "unavailable";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "private file is unavailable",
  );
  mode = "throttled";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeDisabled();
  const before = linkRequests;
  mode = "short";
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled({ timeout: 3000 });
  expect(linkRequests).toBe(before);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Driving Licence private document" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "private preview expired",
    { timeout: 4000 },
  );
  await expect(
    page.getByRole("img", { name: "Driving Licence private document" }),
  ).toHaveCount(0);
  mode = "ready";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Driving Licence private document" }),
  ).toBeVisible();
});

test("clears the viewer and session after an authenticated file-link 401", async ({
  page,
}) => {
  await page.route(
    `**/api/v1/file-assets/${TEST_ASSET_ID}/download-links`,
    (route) => route.fulfill({ status: 401, json: { error: {} } }),
  );
  await openDriver(page);
  await openLicence(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Your session expired", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("removes an already loaded preview when the admin session expires", async ({
  page,
}) => {
  // Advance the browser's clock after loading a preview to exercise the root session monitor.
  await page.clock.install();
  await openDriver(page);
  await openLicence(page);
  await expect(
    page.getByRole("img", { name: "Driving Licence private document" }),
  ).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Driving Licence private document" }),
  ).toHaveCount(0);
});

test("cancels an in-flight preview on close/navigation and discards its late file response", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("https://files.example.test/**", async (route) => {
    requested = true;
    await gate;
    await route
      .fulfill({
        contentType: "image/png",
        body: Buffer.from(syntheticPng()),
        headers: { "Access-Control-Allow-Origin": "*" },
      })
      .catch(() => undefined);
  });
  await openDriver(page);
  await openLicence(page);
  await expect.poll(() => requested).toBe(true);
  await expect(
    page.getByText("Loading private document…", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.getByRole("link", { name: "← Back to drivers" }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "Drivers", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Driving Licence private document" }),
  ).toHaveCount(0);
  expect(page.url()).not.toContain(TEST_PRIVATE_URL);
});
