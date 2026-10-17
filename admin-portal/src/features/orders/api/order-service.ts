import {
  requestAuthenticated,
  requestAuthenticatedJson,
} from "../../../shared/api/api-client";
import {
  invalidResponse,
  readEtag,
  readId,
  readNullableText,
  readObject,
  readPage,
  readText,
  readTimestamp,
} from "../../../shared/api/response-validation";
import { orderSources, orderStatuses } from "../types/order-types";
import type {
  CreateOrderInput,
  Order,
  OrderDetail,
  OrderFilters,
} from "../types/order-types";
import { dateBoundary } from "../validation/order-validation";
import { readTrip } from "../../trips";

export function readOrder(value: unknown): Order {
  const row = readObject(value);
  if (
    !orderStatuses.some((status) => status === row.status) ||
    !orderSources.some((source) => source === row.source)
  )
    return invalidResponse();
  const estimate = readObject(row.estimate);
  if (
    !(
      estimate.durationMinutes === null ||
      (Number.isSafeInteger(estimate.durationMinutes) &&
        (estimate.durationMinutes as number) > 0)
    ) ||
    ![null, "maps", "distance_heuristic", "admin_override"].includes(
      estimate.source as string | null,
    ) ||
    (estimate.durationMinutes === null) !== (estimate.source === null)
  )
    return invalidResponse();
  const order: Order = {
    id: readId(row.id),
    companyId: readId(row.companyId),
    status: row.status as Order["status"],
    source: row.source as Order["source"],
    pickup: readText(readObject(row.pickup).address),
    drop: readText(readObject(row.drop).address),
    requestedPickupAt: readTimestamp(row.requestedPickupAt),
    contact: {
      name: readText(readObject(row.contact).name),
      phone: readText(readObject(row.contact).phone),
    },
    vehicleNotes: readNotes(row.vehicleNotes),
    serviceNotes: readNotes(row.serviceNotes),
    estimate: {
      durationMinutes: estimate.durationMinutes as number | null,
      source: estimate.source as Order["estimate"]["source"],
    },
    tripId: row.tripId === null ? null : readId(row.tripId),
    rejectionReason: readNullableText(row.rejectionReason),
    createdAt: readTimestamp(row.createdAt),
  };
  if (
    order.status === "accepted"
      ? !order.tripId || order.rejectionReason !== null
      : order.tripId !== null ||
        (order.status === "rejected"
          ? !order.rejectionReason
          : order.rejectionReason !== null)
  )
    return invalidResponse();
  return order;
}

function readNotes(value: unknown): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  return invalidResponse()
}

export async function listOrders(
  filters: OrderFilters,
  token: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "25" });
  for (const key of ["status", "companyId", "cursor"] as const)
    if (filters[key]) params.set(key, filters[key]);
  if (filters.from) params.set("createdFrom", dateBoundary(filters.from));
  if (filters.to) params.set("createdTo", dateBoundary(filters.to, true));
  const data = readObject(
    await requestAuthenticatedJson(`/api/v1/orders?${params}`, {
      accessToken: token,
      signal,
    }),
  );
  if (!Array.isArray(data.items)) return invalidResponse();
  const items = data.items.map(readOrder);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item) =>
        (filters.status && item.status !== filters.status) ||
        (filters.companyId && item.companyId !== filters.companyId),
    )
  )
    return invalidResponse();
  return { items, pageInfo: readPage(data.pageInfo, items.length, 25) };
}

export async function getOrder(
  id: string,
  token: string,
  signal: AbortSignal,
): Promise<OrderDetail> {
  const result = await requestAuthenticated(
    `/api/v1/orders/${encodeURIComponent(id)}`,
    { accessToken: token, signal },
  );
  const order = readOrder(result.data);
  if (order.id !== id) return invalidResponse();
  return { order, etag: readEtag(result.etag) };
}

export async function createOrder(
  input: CreateOrderInput,
  key: string,
  token: string,
): Promise<Order> {
  const data = await requestAuthenticatedJson("/api/v1/orders", {
    accessToken: token,
    method: "POST",
    body: input,
    idempotencyKey: key,
  });
  const order = readOrder(data);
  if (
    order.status !== "received" ||
    order.companyId !== input.companyId ||
    order.source !== input.source
  )
    return invalidResponse();
  return order;
}

export async function decideOrder(
  id: string,
  action: "accept" | "reject",
  body: { totalAmount: string } | { reason: string },
  etag: string,
  key: string,
  token: string,
): Promise<OrderDetail> {
  const result = await requestAuthenticated(
    `/api/v1/orders/${encodeURIComponent(id)}/${action}`,
    { accessToken: token, method: "POST", body, etag, idempotencyKey: key },
  );
  const data =
    action === "accept" ? readObject(result.data).order : result.data;
  const order = readOrder(data);
  if (
    order.id !== id ||
    order.status !== (action === "accept" ? "accepted" : "rejected")
  )
    return invalidResponse();
  if (action === "accept") {
    const trip = readTrip(readObject(result.data).trip);
    if (
      trip.id !== order.tripId ||
      trip.orderId !== order.id ||
      trip.companyId !== order.companyId ||
      trip.status !== "unassigned" ||
      !("totalAmount" in body) ||
      trip.totalAmount !== body.totalAmount
    )
      return invalidResponse();
  }
  if (
    action === "reject" &&
    (!("reason" in body) || order.rejectionReason !== body.reason)
  )
    return invalidResponse();
  return { order, etag: readEtag(result.etag) };
}
