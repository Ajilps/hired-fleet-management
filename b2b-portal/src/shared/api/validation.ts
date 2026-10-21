import { ApiError } from "./client";
export function invalid(): never {
  throw new ApiError(
    502,
    "The server returned an unexpected response. Try refreshing.",
  );
}
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}
export function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : invalid();
}
export function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
export function id(value: unknown): string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value.toLowerCase()
    : invalid();
}
export function timestamp(value: unknown): string {
  const result = text(value);
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(result) &&
    Number.isFinite(Date.parse(result))
    ? result
    : invalid();
}
export function money(value: unknown): string {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(value)
    ? value
    : invalid();
}
export function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : invalid();
}
export function scoped(value: unknown, companyId: string) {
  if (id(value) !== companyId) invalid();
  return companyId;
}
export type Page<T> = {
  items: T[];
  pageInfo: { totalCount: number; hasMore: boolean; nextCursor: string | null };
};
export function page<T extends { id: string }>(
  value: unknown,
  parse: (value: unknown) => T,
): Page<T> {
  const data = object(value);
  const info = object(data.pageInfo);
  if (!Array.isArray(data.items) || typeof info.hasMore !== "boolean")
    return invalid();
  const items = data.items.map(parse);
  const totalCount = integer(info.totalCount);
  const nextCursor = nullableText(info.nextCursor);
  if (
    items.length > 25 ||
    totalCount < items.length ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    info.hasMore !== (nextCursor !== null) ||
    (info.hasMore && !items.length)
  )
    return invalid();
  return { items, pageInfo: { totalCount, hasMore: info.hasMore, nextCursor } };
}
