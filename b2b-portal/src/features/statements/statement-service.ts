import { isCalendarDate } from "../../shared/format";
import { request } from "../../shared/api/client";
import {
  object,
  id,
  scoped,
  text,
  money,
  integer,
  timestamp,
  page,
  invalid,
} from "../../shared/api/validation";
export type Statement = {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  status: "published";
  totalTripAmount: string;
  totalDriverShare: string;
  totalCompanyShare: string;
  publishedAt: string;
  contentVersion: number;
};
export type StatementItem = {
  tripId: string;
  tripPayrollRecordId: string;
  tripAmount: string;
  driverShareAmount: string;
  companyShareAmount: string;
  appliedDriverPercent: string;
  appliedCompanyPercent: string;
};
function cents(value: string) {
  return BigInt(value.replace(".", ""));
}
export function readStatement(value: unknown, companyId: string): Statement {
  const row = object(value);
  if (
    row.status !== "published" ||
    row.billingTimezone !== "Asia/Kolkata" ||
    typeof row.periodStart !== "string" ||
    !isCalendarDate(row.periodStart) ||
    typeof row.periodEnd !== "string" ||
    !isCalendarDate(row.periodEnd) ||
    row.periodStart >= row.periodEnd ||
    integer(row.contentVersion) < 1
  )
    return invalid();
  const result: Statement = {
    id: id(row.id),
    companyId: scoped(row.companyId, companyId),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: "published",
    totalTripAmount: money(row.totalTripAmount),
    totalDriverShare: money(row.totalDriverShare),
    totalCompanyShare: money(row.totalCompanyShare),
    publishedAt: timestamp(row.publishedAt),
    contentVersion: integer(row.contentVersion),
  };
  if (
    cents(result.totalDriverShare) + cents(result.totalCompanyShare) !==
    cents(result.totalTripAmount)
  )
    return invalid();
  return result;
}
export async function listStatements(
  filters: { month?: string; cursor?: string },
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "25", status: "published" });
  if (filters.month) params.set("billingMonth", filters.month);
  if (filters.cursor) params.set("cursor", filters.cursor);
  const result = page(
    await request(`/statements?${params}`, { token, signal }),
    (value) => readStatement(value, companyId),
  );
  if (
    filters.month &&
    result.items.some((item) => item.periodStart.slice(0, 7) !== filters.month)
  )
    return invalid();
  return result;
}
export function readStatementItem(value: unknown): StatementItem {
  const row = object(value);
  const result = {
    tripId: id(row.tripId),
    tripPayrollRecordId: id(row.tripPayrollRecordId),
    tripAmount: money(row.tripAmount),
    driverShareAmount: money(row.driverShareAmount),
    companyShareAmount: money(row.companyShareAmount),
    appliedDriverPercent: money(row.appliedDriverPercent),
    appliedCompanyPercent: money(row.appliedCompanyPercent),
  };
  if (
    cents(result.driverShareAmount) + cents(result.companyShareAmount) !==
      cents(result.tripAmount) ||
    cents(result.appliedDriverPercent) + cents(result.appliedCompanyPercent) !==
      10000n
  )
    return invalid();
  return result;
}
export async function getStatement(
  recordId: string,
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const row = object(
    await request(`/statements/${id(recordId)}`, { token, signal }),
  );
  const summary = readStatement(row, companyId);
  if (summary.id !== recordId || !Array.isArray(row.items)) return invalid();
  const items = row.items.map(readStatementItem);
  if (new Set(items.map((item) => item.tripId)).size !== items.length)
    return invalid();
  for (const [total, item] of [
    ["totalTripAmount", "tripAmount"],
    ["totalDriverShare", "driverShareAmount"],
    ["totalCompanyShare", "companyShareAmount"],
  ] as const)
    if (
      items.reduce((sum, row) => sum + cents(row[item]), 0n) !==
      cents(summary[total])
    )
      return invalid();
  return { ...summary, items };
}
export type ReportSummary = {
  id: string;
  tripId: string;
  companyId: string;
  closedAt: string;
};
export async function listReports(
  cursor: string,
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "25" });
  if (cursor) params.set("cursor", cursor);
  return page(
    await request(`/trip-reports?${params}`, { token, signal }),
    (value) => {
      const row = object(value);
      if (row.snapshotVersion !== 1) return invalid();
      return {
        id: id(row.id),
        tripId: id(row.tripId),
        companyId: scoped(row.companyId, companyId),
        closedAt: timestamp(row.closedAt),
      };
    },
  );
}
export async function getReport(
  recordId: string,
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const row = object(
    await request(`/trip-reports/${id(recordId)}`, { token, signal }),
  );
  const trip = object(row.trip);
  const payroll = object(row.payroll);
  if (
    id(row.reportId) !== recordId ||
    row.snapshotVersion !== 1 ||
    row.currency !== "INR" ||
    trip.status !== "closed" ||
    !Array.isArray(row.expenses)
  )
    return invalid();
  scoped(trip.companyId, companyId);
  const amounts = readStatementItem({
    ...payroll,
    tripId: trip.id,
    tripPayrollRecordId: payroll.id,
  });
  if (money(payroll.totalAmount) !== amounts.tripAmount) return invalid();
  const expenses = row.expenses.map((value) => {
    const expense = object(value);
    return {
      id: id(expense.id),
      description: text(expense.description),
      amount: money(expense.amount),
      category: text(expense.category),
    };
  });
  const totalExpenses = money(row.totalExpenseAmount);
  if (
    expenses.reduce((sum, item) => sum + cents(item.amount), 0n) !==
    cents(totalExpenses)
  )
    return invalid();
  return {
    id: recordId,
    tripId: id(trip.id),
    pickup: text(object(trip.pickup).address),
    drop: text(object(trip.drop).address),
    driver: text(object(trip.driver).name),
    closedAt: timestamp(trip.closedAt),
    startedAt: timestamp(trip.startedAt),
    generatedAt: timestamp(row.generatedAt),
    expenses,
    totalExpenses,
    amounts,
  };
}
