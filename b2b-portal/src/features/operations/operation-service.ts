import { request } from "../../shared/api/client";
import {
  id,
  object,
  text,
  nullableText,
  timestamp,
  scoped,
  integer,
  money,
  page,
  invalid,
} from "../../shared/api/validation";
import { dateBoundary } from "../../shared/format";
export type Estimate = {
  durationMinutes: number | null;
  source: string | null;
};
export type Order = {
  id: string;
  companyId: string;
  status: "received" | "accepted" | "rejected";
  pickup: string;
  drop: string;
  requestedPickupAt: string;
  contact: { name: string; phone: string };
  vehicleNotes: string | null;
  serviceNotes: string | null;
  estimate: Estimate;
  tripId: string | null;
  rejectionReason: string | null;
  createdAt: string;
};
export type Trip = {
  id: string;
  companyId: string;
  orderId: string;
  status: "unassigned" | "assigned" | "ongoing" | "closed";
  pickup: string;
  drop: string;
  scheduledPickupAt: string;
  startedAt: string | null;
  closedAt: string | null;
  totalAmount: string;
  contact: { name: string; phone: string };
  currentDriver: { fullName: string; phone: string | null } | null;
  estimate: Estimate;
  vehicleNotes: string | null;
  serviceNotes: string | null;
  updatedAt: string;
};
export type OrderInput = {
  pickup: { address: string };
  drop: { address: string };
  requestedPickupAt: string;
  contact: { name: string; phone: string };
  vehicleNotes: string | null;
  serviceNotes: string | null;
  routeDistanceKm?: string;
};
export type Filters = {
  status?: string;
  from?: string;
  to?: string;
  cursor?: string;
};
function estimate(value: unknown): Estimate {
  const row = object(value);
  if (row.durationMinutes === null && row.source === null)
    return { durationMinutes: null, source: null };
  if (
    !["distance_heuristic", "maps", "admin_override"].includes(
      row.source as string,
    ) ||
    integer(row.durationMinutes) < 1
  )
    return invalid();
  return {
    durationMinutes: integer(row.durationMinutes),
    source: row.source as string,
  };
}
function notes(value: unknown): string | null {
  return value === null || typeof value === "string" ? value : invalid();
}
function contact(value: unknown) {
  const row = object(value);
  return { name: text(row.name), phone: text(row.phone) };
}
export function readOrder(value: unknown, companyId: string): Order {
  const row = object(value);
  if (!["received", "accepted", "rejected"].includes(row.status as string))
    return invalid();
  const tripId = row.tripId === null ? null : id(row.tripId);
  const reason = nullableText(row.rejectionReason);
  if (
    (row.status === "accepted" && (!tripId || reason !== null)) ||
    (row.status !== "accepted" && tripId !== null) ||
    (row.status === "rejected" && !reason) ||
    (row.status === "received" && reason !== null)
  )
    return invalid();
  return {
    id: id(row.id),
    companyId: scoped(row.companyId, companyId),
    status: row.status as Order["status"],
    pickup: text(object(row.pickup).address),
    drop: text(object(row.drop).address),
    requestedPickupAt: timestamp(row.requestedPickupAt),
    contact: contact(row.contact),
    vehicleNotes: notes(row.vehicleNotes),
    serviceNotes: notes(row.serviceNotes),
    estimate: estimate(row.estimate),
    tripId,
    rejectionReason: reason,
    createdAt: timestamp(row.createdAt),
  };
}
export function readTrip(value: unknown, companyId: string): Trip {
  const row = object(value);
  if (
    !["unassigned", "assigned", "ongoing", "closed"].includes(
      row.status as string,
    ) ||
    row.currency !== "INR"
  )
    return invalid();
  const driver = row.currentDriver === null ? null : object(row.currentDriver);
  return {
    id: id(row.id),
    orderId: id(row.orderId),
    companyId: scoped(row.companyId, companyId),
    status: row.status as Trip["status"],
    pickup: text(object(row.pickup).address),
    drop: text(object(row.drop).address),
    scheduledPickupAt: timestamp(row.scheduledPickupAt),
    startedAt: row.startedAt === null ? null : timestamp(row.startedAt),
    closedAt: row.closedAt === null ? null : timestamp(row.closedAt),
    totalAmount: money(row.totalAmount),
    contact: contact(row.contact),
    currentDriver: driver
      ? { fullName: text(driver.fullName), phone: nullableText(driver.phone) }
      : null,
    estimate: estimate(row.estimate),
    vehicleNotes: notes(row.vehicleNotes),
    serviceNotes: notes(row.serviceNotes),
    updatedAt: timestamp(row.updatedAt),
  };
}
function query(filters: Filters, collection: "orders" | "trips") {
  const params = new URLSearchParams({ limit: "25" });
  if (filters.status) params.set("status", filters.status);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.from)
    params.set(
      collection === "orders" ? "createdFrom" : "scheduledFrom",
      dateBoundary(filters.from),
    );
  if (filters.to)
    params.set(
      collection === "orders" ? "createdTo" : "scheduledTo",
      dateBoundary(filters.to, true),
    );
  return params;
}
export async function listOrders(
  filters: Filters,
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const result = page(
    await request(`/orders?${query(filters, "orders")}`, { token, signal }),
    (value) => readOrder(value, companyId),
  );
  if (
    filters.status &&
    result.items.some((item) => item.status !== filters.status)
  )
    return invalid();
  return result;
}
export async function listTrips(
  filters: Filters,
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const result = page(
    await request(`/trips?${query(filters, "trips")}`, { token, signal }),
    (value) => readTrip(value, companyId),
  );
  if (
    filters.status &&
    result.items.some((item) => item.status !== filters.status)
  )
    return invalid();
  return result;
}
export async function getOrder(
  recordId: string,
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const result = readOrder(
    await request(`/orders/${id(recordId)}`, { token, signal }),
    companyId,
  );
  return result.id === recordId ? result : invalid();
}
export async function getTrip(
  recordId: string,
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const result = readTrip(
    await request(`/trips/${id(recordId)}`, { token, signal }),
    companyId,
  );
  return result.id === recordId ? result : invalid();
}
export async function createOrder(
  input: OrderInput,
  key: string,
  token: string,
  companyId: string,
) {
  // Construct the partner DTO explicitly; company/source/pricing can never be caller-supplied.
  const body = {
    pickup: input.pickup,
    drop: input.drop,
    requestedPickupAt: input.requestedPickupAt,
    contact: input.contact,
    vehicleNotes: input.vehicleNotes,
    serviceNotes: input.serviceNotes,
    ...(input.routeDistanceKm
      ? { routeDistanceKm: input.routeDistanceKm }
      : {}),
  };
  const result = readOrder(
    await request("/orders", { method: "POST", token, body, key }),
    companyId,
  );
  return result.status === "received" ? result : invalid();
}
export async function revealCode(
  tripId: string,
  token: string,
  signal: AbortSignal,
) {
  const row = object(
    await request(`/trips/${id(tripId)}/close-code/reveal`, {
      method: "POST",
      token,
      signal,
    }),
  );
  if (typeof row.code !== "string" || !/^\d{6}$/.test(row.code))
    return invalid();
  const expiresAt = row.expiresAt === null ? null : timestamp(row.expiresAt);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return invalid();
  return { code: row.code, expiresAt };
}
export async function getExpenses(
  tripId: string,
  token: string,
  signal: AbortSignal,
) {
  const row = object(
    await request(`/trips/${id(tripId)}/expenses`, { token, signal }),
  );
  if (!Array.isArray(row.items)) return invalid();
  return {
    total: money(row.totalExpenseAmount),
    items: row.items.map((value) => {
      const item = object(value);
      if (id(item.tripId) !== tripId) return invalid();
      return {
        id: id(item.id),
        description: text(item.description),
        category: text(item.category),
        amount: money(item.amount),
        loggedAt: timestamp(item.loggedAt),
      };
    }),
  };
}
