import { describe, expect, it, vi, afterEach } from "vitest";
import { readStatement, getStatement, getReport } from "./statement-service";
const companyId = "20000000-0000-4000-8000-000000000001";
const recordId = "40000000-0000-4000-8000-000000000001";
const tripId = "50000000-0000-4000-8000-000000000001";
const statement = {
  id: recordId,
  companyId,
  periodStart: "2026-09-01",
  periodEnd: "2026-10-01",
  status: "published",
  billingTimezone: "Asia/Kolkata",
  contentVersion: 1,
  totalTripAmount: "10000.00",
  totalDriverShare: "3000.00",
  totalCompanyShare: "7000.00",
  publishedAt: "2026-10-05T08:00:00Z",
};
const item = {
  tripId,
  tripPayrollRecordId: recordId,
  tripAmount: "10000.00",
  appliedDriverPercent: "30.00",
  appliedCompanyPercent: "70.00",
  driverShareAmount: "3000.00",
  companyShareAmount: "7000.00",
};
afterEach(() => vi.unstubAllGlobals());
describe("published records", () => {
  it.each(["draft", "verified", "pending_verification"])(
    "rejects unpublished %s statements",
    (status) => {
      expect(() =>
        readStatement({ ...statement, status }, companyId),
      ).toThrow();
    },
  );
  it("rejects foreign-company and inconsistent financial summaries", () => {
    expect(() => readStatement(statement, tripId)).toThrow();
    expect(() =>
      readStatement({ ...statement, totalCompanyShare: "7000.01" }, companyId),
    ).toThrow();
  });
  it("checks complete line totals with exact decimal arithmetic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ...statement, items: [item] })),
    );
    expect(
      (
        await getStatement(
          recordId,
          "synthetic",
          companyId,
          new AbortController().signal,
        )
      ).items,
    ).toHaveLength(1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ...statement, items: [] })),
    );
    await expect(
      getStatement(
        recordId,
        "synthetic",
        companyId,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("rejects repeated trip lines or inconsistent split percentages", async () => {
    for (const items of [
      [item, item],
      [{ ...item, appliedCompanyPercent: "69.00" }],
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ ...statement, items })),
      );
      await expect(
        getStatement(
          recordId,
          "synthetic",
          companyId,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ status: 502 });
    }
  });
  it("projects frozen report and separately reconciles expenses", async () => {
    const report = {
      reportId: recordId,
      snapshotVersion: 1,
      currency: "INR",
      generatedAt: statement.publishedAt,
      trip: {
        id: tripId,
        companyId,
        status: "closed",
        pickup: { address: "Pickup" },
        drop: { address: "Drop" },
        driver: { name: "Synthetic Driver" },
        closedAt: statement.publishedAt,
        startedAt: statement.publishedAt,
      },
      payroll: { ...item, id: recordId, totalAmount: "10000.00" },
      expenses: [],
      totalExpenseAmount: "0.00",
      walletCredit: { secret: "unneeded" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(report)));
    const result = await getReport(
      recordId,
      "synthetic",
      companyId,
      new AbortController().signal,
    );
    expect(result).not.toHaveProperty("walletCredit");
    expect(result.totalExpenses).toBe("0.00");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ...report, totalExpenseAmount: "0.01" }),
        ),
    );
    await expect(
      getReport(recordId, "synthetic", companyId, new AbortController().signal),
    ).rejects.toMatchObject({ status: 502 });
  });
});
