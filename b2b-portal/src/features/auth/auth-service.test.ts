import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readUser,
  signIn,
  restoreSession,
  changePassword,
  signOut,
} from "./auth-service";
import { useAuthStore } from "./auth-store";
const user = {
  id: "10000000-0000-4000-8000-000000000001",
  companyId: "20000000-0000-4000-8000-000000000001",
  role: "partner",
  fullName: "Synthetic Partner",
  email: "partner@example.test",
  isActive: true,
  passwordChangeRequired: false,
};
const session = {
  user,
  accessToken: "synthetic-access",
  accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
  tokenType: "Bearer",
  transport: "browser",
  refreshToken: "must-never-be-retained",
};
afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.getState().clear();
});
describe("partner session boundary", () => {
  it("keeps only partner identity and the in-memory access credential", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(session));
    vi.stubGlobal("fetch", fetcher);
    const result = await signIn(
      " Partner@Example.test ",
      "synthetic password with spaces",
    );
    expect(result).not.toHaveProperty("refreshToken");
    expect(result.user).not.toHaveProperty("passwordHash");
    const options = fetcher.mock.calls[0][1];
    expect(options.credentials).toBe("include");
    expect(options.cache).toBe("no-store");
    expect(options.headers["X-CSRF-Guard"]).toBe("1");
    expect(JSON.parse(options.body)).toEqual({
      email: "partner@example.test",
      password: "synthetic password with spaces",
      transport: "browser",
      deviceName: "HireD business portal",
    });
  });
  it.each([
    { ...user, role: "admin" },
    { ...user, role: "driver" },
    { ...user, isActive: false },
    { ...user, companyId: null },
  ])("refuses invalid role, disabled account or missing scope", (value) => {
    expect(() => readUser(value)).toThrow();
  });
  it("revokes a wrong-role sign-in instead of accepting it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...session, user: { ...user, role: "admin" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      signIn(user.email, "synthetic password"),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher.mock.calls[1][0]).toContain("/logout");
  });
  it("serializes concurrent refreshes and projects safe results", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(session));
    vi.stubGlobal("fetch", fetcher);
    const [first, second] = await Promise.all([
      restoreSession(),
      restoreSession(),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).not.toHaveProperty("refreshToken");
  });
  it("treats an expired refresh as signed out but preserves network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(restoreSession()).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(restoreSession()).rejects.toMatchObject({ status: 0 });
  });
  it("changes password with browser guard/cookie and sends exact password bytes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await changePassword(
      "synthetic-access",
      " old password ",
      " a new password with spaces ",
    );
    const options = fetcher.mock.calls[0][1];
    expect(JSON.parse(options.body)).toEqual({
      currentPassword: " old password ",
      newPassword: " a new password with spaces ",
    });
    expect(options.headers["X-CSRF-Guard"]).toBe("1");
    expect(options.credentials).toBe("include");
  });
  it("accepts already-revoked logout and does not hide server failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(signOut("synthetic")).resolves.toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(signOut("synthetic")).rejects.toMatchObject({ status: 503 });
  });
});
