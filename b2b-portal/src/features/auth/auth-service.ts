import { ApiError, request } from "../../shared/api/client";
import {
  id,
  object,
  text,
  timestamp,
  invalid,
} from "../../shared/api/validation";
import type { PartnerSession, PartnerUser } from "./auth-store";
export function readUser(value: unknown): PartnerUser {
  const row = object(value);
  if (
    row.role !== "partner" ||
    row.isActive !== true ||
    typeof row.passwordChangeRequired !== "boolean"
  )
    throw new ApiError(
      403,
      "Use a partner account issued by your HireD administrator.",
    );
  return {
    id: id(row.id),
    companyId: id(row.companyId),
    fullName: text(row.fullName),
    email: text(row.email),
    role: "partner",
    isActive: true,
    passwordChangeRequired: row.passwordChangeRequired,
  };
}
function readSession(value: unknown): PartnerSession {
  const row = object(value);
  if (row.transport !== "browser" || row.tokenType !== "Bearer")
    return invalid();
  const expires = timestamp(row.accessTokenExpiresAt);
  if (Date.parse(expires) <= Date.now()) return invalid();
  return {
    accessToken: text(row.accessToken),
    accessTokenExpiresAt: expires,
    user: readUser(row.user),
  };
}
async function lock<T>(run: () => Promise<T>) {
  return navigator.locks
    ? navigator.locks.request("hired-browser-session", run)
    : run();
}
export async function signIn(email: string, password: string) {
  return lock(async () => {
    let value: unknown;
    try {
      value = await request("/auth-sessions/login", {
        method: "POST",
        cookie: true,
        body: {
          email: email.trim().toLowerCase(),
          password,
          transport: "browser",
          deviceName: "HireD business portal",
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw new ApiError(401, "The email or password is incorrect.");
      throw error;
    }
    try {
      return readSession(value);
    } catch (error) {
      const row = object(value);
      if (typeof row.accessToken === "string")
        await request("/auth-sessions/logout", {
          method: "POST",
          token: row.accessToken,
          cookie: true,
          body: { transport: "browser" },
        }).catch(() => undefined);
      throw error;
    }
  });
}
let refresh: Promise<PartnerSession | null> | null = null;
export function restoreSession() {
  refresh ??= lock(async () => {
    try {
      return readSession(
        await request("/auth-sessions/refresh", {
          method: "POST",
          cookie: true,
          body: { transport: "browser" },
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status))
        return null;
      throw error;
    }
  }).finally(() => {
    refresh = null;
  });
  return refresh;
}
export async function signOut(token: string) {
  return lock(async () => {
    try {
      await request("/auth-sessions/logout", {
        method: "POST",
        token,
        cookie: true,
        body: { transport: "browser" },
      });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
  });
}
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  await request("/users/me/password", {
    method: "POST",
    token,
    cookie: true,
    body: { currentPassword, newPassword },
  });
}
