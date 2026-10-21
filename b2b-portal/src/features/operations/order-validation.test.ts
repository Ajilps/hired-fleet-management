import { describe, expect, it, vi, afterEach } from "vitest";
import { validateOrder } from "./order-validation";
import { createOrder, readOrder, readTrip } from "./operation-service";
import { formatMoney, dateBoundary } from "../../shared/format";
const fields = {
  pickup: " Pickup road ",
  drop: " Destination road ",
  date: "2026-10-20",
  time: "10:30",
  name: " Contact ",
  phone: "+91 9000000000",
  vehicle: "",
  notes: " Front gate ",
  distance: "20.5",
};
const companyId = "20000000-0000-4000-8000-000000000001";
const order = {
  id: "30000000-0000-4000-8000-000000000001",
  companyId,
  status: "received",
  pickup: { address: "Pickup road" },
  drop: { address: "Destination road" },
  requestedPickupAt: "2026-10-20T05:00:00.000Z",
  contact: { name: "Contact", phone: "+91 9000000000" },
  vehicleNotes: null,
  serviceNotes: null,
  estimate: { durationMinutes: null, source: null },
  tripId: null,
  rejectionReason: null,
  createdAt: "2026-10-18T06:00:00Z",
};
afterEach(() => vi.unstubAllGlobals());
describe("partner order boundary", () => {
  it("normalizes text and explicit IST time without adding company, source or amount", () => {
    const result = validateOrder(fields);
    expect(result.errors).toEqual({});
    expect(result.input?.requestedPickupAt).toBe("2026-10-20T05:00:00.000Z");
    expect(result.input?.routeDistanceKm).toBe("20.50");
    expect(result.input?.pickup.address).toBe("Pickup road");
    expect(result.input).not.toHaveProperty("companyId");
  });
  it.each([
    { date: "2026-02-30" },
    { time: "25:00" },
    { name: "  " },
    { phone: "" },
    { pickup: "" },
    { distance: "0" },
    { distance: "1.123" },
    { distance: "-2" },
  ])("rejects invalid input %j", (patch) => {
    expect(validateOrder({ ...fields, ...patch }).input).toBeUndefined();
  });
  it("uses explicit IST exclusive date bounds even at month end", () => {
    expect(dateBoundary("2026-10-31")).toBe("2026-10-30T18:30:00.000Z");
    expect(dateBoundary("2026-10-31", true)).toBe("2026-10-31T18:30:00.000Z");
  });
  it("never renders foreign-company or inconsistent order results", () => {
    expect(() =>
      readOrder(
        { ...order, companyId: "20000000-0000-4000-8000-000000000002" },
        companyId,
      ),
    ).toThrow();
    expect(() =>
      readOrder({ ...order, status: "accepted" }, companyId),
    ).toThrow();
    expect(() =>
      readOrder({ ...order, status: "rejected" }, companyId),
    ).toThrow();
    expect(
      readOrder({ ...order, closeCode: "sensitive" }, companyId),
    ).not.toHaveProperty("closeCode");
  });
  it("projects only minimal assigned-driver contact and ignores secret fields", () => {
    const result = readTrip(
      {
        ...order,
        orderId: order.id,
        status: "ongoing",
        totalAmount: "10000.00",
        currency: "INR",
        scheduledPickupAt: order.requestedPickupAt,
        startedAt: order.createdAt,
        closedAt: null,
        updatedAt: order.createdAt,
        currentDriver: {
          fullName: "Synthetic Driver",
          phone: null,
          documentNumber: "private",
        },
        closeCode: "private",
      },
      companyId,
    );
    expect(result).not.toHaveProperty("closeCode");
    expect(result.currentDriver).not.toHaveProperty("documentNumber");
  });
  it("constructs strict partner intake and preserves supplied replay key", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(order));
    vi.stubGlobal("fetch", fetcher);
    const input = {
      ...validateOrder(fields).input!,
      companyId: "forged",
      source: "admin_manual",
      totalAmount: "999.00",
    };
    await createOrder(input, "original-intent", "synthetic", companyId);
    const options = fetcher.mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("companyId");
    expect(body).not.toHaveProperty("source");
    expect(body).not.toHaveProperty("totalAmount");
    expect(options.headers["Idempotency-Key"]).toBe("original-intent");
  });
  it("formats exact large amounts without floating-point conversion", () => {
    expect(formatMoney("999999999999.99")).toBe("₹9,99,99,99,99,999.99");
    expect(formatMoney("0.00")).toBe("₹0.00");
  });
});
