import { afterEach, expect, it, vi } from "vitest";
import { request, retryAt } from "./client";
afterEach(() => vi.unstubAllGlobals());
it("honors retry headers and safe body fallback without trusting invalid delays", () => {
  const now = Date.now();
  expect(
    retryAt(new Response(null, { headers: { "Retry-After": "2" } }), 10),
  ).toBeGreaterThanOrEqual(now + 2000);
  expect(retryAt(new Response(null), 3)).toBeGreaterThanOrEqual(now + 3000);
  expect(retryAt(new Response(null), -1)).toBeNull();
  expect(retryAt(new Response(null), Infinity)).toBeNull();
});
it("does not expose server error strings, credentials or private values", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            error: {
              message: "private-secret",
              code: "RATE_LIMITED",
              retryAfterSeconds: 3,
            },
          },
          { status: 429 },
        ),
      ),
  );
  await expect(request("/orders")).rejects.toMatchObject({
    status: 429,
    code: "RATE_LIMITED",
    message: "Too many requests. Please wait before trying again.",
  });
});
it("business reads omit cookies and use bearer authorization without caching", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  await request("/orders", { token: "synthetic" });
  const options = fetcher.mock.calls[0][1];
  expect(options.credentials).toBe("omit");
  expect(options.cache).toBe("no-store");
  expect(options.headers.Authorization).toBe("Bearer synthetic");
});
it("propagates failed connectivity instead of fabricating a result", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("private detail")),
  );
  await expect(request("/orders")).rejects.toMatchObject({
    status: 0,
    message: "Unable to connect. Check your connection and try again.",
  });
});
