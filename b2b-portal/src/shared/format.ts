export function formatMoney(value: string): string {
  if (!/^(?:0|[1-9]\d*)\.\d{2}$/.test(value)) return "Unavailable";
  const [whole, fraction] = value.split(".");
  return `₹${new Intl.NumberFormat("en-IN").format(BigInt(whole!))}.${fraction}`;
}
export function formatDate(
  value: string | null | undefined,
  dateOnly = false,
): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(!dateOnly ? ({ hour: "numeric", minute: "2-digit" } as const) : {}),
    }).format(new Date(value)) + (dateOnly ? "" : " IST")
  );
}
export function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}
export function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00+05:30`));
}
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function dateBoundary(value: string, end = false) {
  if (!isCalendarDate(value)) throw new Error("Invalid date");
  const time =
    new Date(`${value}T00:00:00+05:30`).getTime() + (end ? 86_400_000 : 0);
  if (!Number.isFinite(time)) throw new Error("Invalid date");
  return new Date(time).toISOString();
}
