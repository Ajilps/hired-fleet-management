import { afterEach, expect, it, vi } from "vitest";
import { restoreAuthentication } from "./restore-authentication";
import { useAuthStore } from "./auth-store";
const session = {
  accessToken: "synthetic",
  accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    companyId: "20000000-0000-4000-8000-000000000001",
    fullName: "Synthetic",
    email: "synthetic@example.test",
    role: "partner" as const,
    isActive: true as const,
    passwordChangeRequired: false,
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.getState().clear();
});
it("ignores refresh completion after a newer sign-out", async () => {
  let complete!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    ),
  );
  const pending = restoreAuthentication();
  await vi.waitFor(() => expect(complete).toBeDefined());
  useAuthStore.getState().clear();
  complete(
    Response.json({ ...session, transport: "browser", tokenType: "Bearer" }),
  );
  await pending;
  expect(useAuthStore.getState().session).toBeNull();
});
it("preserves an unexpired session through a transient renewal outage", async () => {
  useAuthStore.getState().accept(session);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await restoreAuthentication();
  expect(useAuthStore.getState().session).toEqual(session);
  expect(useAuthStore.getState().phase).toBe("ready");
});
it("shows a recoverable bootstrap error when there is no prior session", async () => {
  useAuthStore.getState().clear();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await restoreAuthentication();
  expect(useAuthStore.getState().phase).toBe("error");
  expect(useAuthStore.getState().session).toBeNull();
});
