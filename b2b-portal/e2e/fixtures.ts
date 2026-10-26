import type { Page } from "@playwright/test";
export const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  company: "20000000-0000-4000-8000-000000000001",
  order: "30000000-0000-4000-8000-000000000001",
  trip: "40000000-0000-4000-8000-000000000001",
  report: "50000000-0000-4000-8000-000000000001",
  statement: "60000000-0000-4000-8000-000000000001",
  driver: "70000000-0000-4000-8000-000000000001",
};
export const user = {
  id: ids.user,
  companyId: ids.company,
  role: "partner",
  fullName: "Ananya Menon",
  email: "synthetic-partner@example.test",
  isActive: true,
  passwordChangeRequired: false,
};
export const session = () => ({
  user,
  accessToken: "synthetic-in-memory-access",
  accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
  tokenType: "Bearer",
  transport: "browser",
});
export const company = {
  id: ids.company,
  displayName: "Meridian Motors",
  legalName: "Meridian Motors Private Limited",
  contactName: "Ananya Menon",
  contactEmail: "synthetic-billing@example.test",
  contactPhone: "+91 90000 12345",
  billingAddress: "42 Business Park, Kochi, Kerala",
  isActive: true,
};
const estimate = { durationMinutes: 45, source: "distance_heuristic" };
export const order = {
  id: ids.order,
  companyId: ids.company,
  status: "received",
  pickup: { address: "Meridian Motors, Edappally" },
  drop: { address: "Cochin International Airport" },
  requestedPickupAt: "2026-10-20T04:30:00Z",
  contact: { name: "Ananya Menon", phone: "+91 90000 12345" },
  vehicleNotes: "Automatic sedan",
  serviceNotes: "Please use the north entrance.",
  estimate,
  tripId: null,
  rejectionReason: null,
  createdAt: "2026-10-18T06:00:00Z",
};
export const trip = {
  ...order,
  id: ids.trip,
  orderId: ids.order,
  status: "ongoing",
  currentDriver: {
    id: ids.driver,
    fullName: "Synthetic Driver",
    phone: "+91 90000 43210",
  },
  totalAmount: "10000.00",
  currency: "INR",
  scheduledPickupAt: order.requestedPickupAt,
  startedAt: "2026-10-20T04:30:00Z",
  closedAt: null,
  updatedAt: "2026-10-20T05:00:00Z",
};
export const statement = {
  id: ids.statement,
  companyId: ids.company,
  periodStart: "2026-09-01",
  periodEnd: "2026-10-01",
  billingTimezone: "Asia/Kolkata",
  status: "published",
  contentVersion: 1,
  totalTripAmount: "10000.00",
  totalDriverShare: "3000.00",
  totalCompanyShare: "7000.00",
  publishedAt: "2026-10-05T06:00:00Z",
  items: [
    {
      tripId: ids.trip,
      tripPayrollRecordId: ids.report,
      tripAmount: "10000.00",
      appliedDriverPercent: "30.00",
      appliedCompanyPercent: "70.00",
      driverShareAmount: "3000.00",
      companyShareAmount: "7000.00",
    },
  ],
};
export const report = {
  reportId: ids.report,
  snapshotVersion: 1,
  generatedAt: "2026-10-20T06:00:00Z",
  currency: "INR",
  trip: {
    ...trip,
    status: "closed",
    driver: { name: "Synthetic Driver" },
    closedAt: "2026-10-20T06:00:00Z",
  },
  expenses: [
    {
      id: ids.report,
      description: "Airport parking",
      amount: "150.00",
      category: "parking",
    },
  ],
  totalExpenseAmount: "150.00",
  payroll: { ...statement.items[0], id: ids.report, totalAmount: "10000.00" },
};
export function list(
  items: unknown[],
  total = items.length,
  cursor: string | null = null,
) {
  return {
    items,
    pageInfo: {
      totalCount: total,
      hasMore: cursor !== null,
      nextCursor: cursor,
    },
  };
}
export type MockOptions = {
  authenticated?: boolean;
  restricted?: boolean;
  unavailable?: boolean;
  role?: string;
  failFirstOrder?: boolean;
  logoutFails?: boolean;
  foreign?: boolean;
  unpublished?: boolean;
  expire?: boolean;
};
export async function mockApi(page: Page, options: MockOptions = {}) {
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
    key?: string;
  }[] = [];
  let isAuthenticated = options.authenticated ?? true;
  let isRestricted = options.restricted ?? false;
  let writes = 0;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const body = request.postDataJSON();
    calls.push({
      path,
      method,
      body,
      key: request.headers()["idempotency-key"],
    });
    const send = (data: unknown, status = 200) =>
      route.fulfill({ status, json: data });
    const error = (status: number) =>
      send(
        {
          error: {
            code: status === 401 ? "UNAUTHORIZED" : "UNAVAILABLE",
            retryAfterSeconds: null,
          },
        },
        status,
      );
    const authBody = () => ({
      ...session(),
      user: {
        ...user,
        passwordChangeRequired: isRestricted,
        role: options.role ?? "partner",
      },
    });
    if (path === "/auth-sessions/refresh")
      return isAuthenticated ? send(authBody()) : error(401);
    if (path === "/auth-sessions/login") {
      isAuthenticated = true;
      return send(authBody());
    }
    if (path === "/auth-sessions/logout") {
      if (options.logoutFails) return error(503);
      isAuthenticated = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "/users/me/password") {
      isRestricted = false;
      isAuthenticated = false;
      return route.fulfill({ status: 204 });
    }
    if (options.expire) return error(401);
    if (path === `/companies/${ids.company}`) return send(company);
    if (options.unavailable) return error(404);
    if (path === "/orders" && method === "POST") {
      writes++;
      if (options.failFirstOrder && writes === 1) return route.abort();
      return send({ ...order, ...body }, 201);
    }
    if (path === "/orders") {
      const status = url.searchParams.get("status") ?? "received";
      return send(
        list(
          [
            {
              ...order,
              status,
              tripId: status === "accepted" ? ids.trip : null,
              rejectionReason:
                status === "rejected"
                  ? "No drivers available for that time."
                  : null,
              ...(options.foreign ? { companyId: ids.driver } : {}),
            },
          ],
          8,
          url.searchParams.has("cursor") ? null : "synthetic-cursor",
        ),
      );
    }
    if (path === `/orders/${ids.order}`) return send(order);
    if (path === "/trips") {
      const status = url.searchParams.get("status") ?? "ongoing";
      return send(
        list(
          [
            {
              ...trip,
              status,
              closedAt: status === "closed" ? "2026-10-20T06:00:00Z" : null,
            },
          ],
          status === "closed" ? 24 : 3,
        ),
      );
    }
    if (path === `/trips/${ids.trip}`) return send(trip);
    if (path.endsWith("/close-code/reveal"))
      return send({
        code: "629741",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      });
    if (path.endsWith("/expenses"))
      return send({ items: [], totalExpenseAmount: "0.00" });
    if (path === "/statements")
      return send(
        list(
          [
            {
              ...statement,
              ...(options.unpublished ? { status: "draft" } : {}),
            },
          ],
          4,
        ),
      );
    if (path === `/statements/${ids.statement}`)
      return send({
        ...statement,
        ...(options.unpublished ? { status: "draft" } : {}),
      });
    if (path === "/trip-reports")
      return send(
        list([
          {
            id: ids.report,
            tripId: ids.trip,
            companyId: ids.company,
            closedAt: "2026-10-20T06:00:00Z",
            snapshotVersion: 1,
          },
        ]),
      );
    if (path === `/trip-reports/${ids.report}`) return send(report);
    return error(404);
  });
  return calls;
}
