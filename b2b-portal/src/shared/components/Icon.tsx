export type IconName =
  | "overview"
  | "orders"
  | "trips"
  | "statements"
  | "company"
  | "plus"
  | "arrow"
  | "logout"
  | "menu"
  | "refresh"
  | "check"
  | "clock"
  | "pin"
  | "shield"
  | "close"
  | "chevron";
const paths: Record<IconName, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  orders: "M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4",
  trips:
    "M3 17l2-9h14l2 9 M5 8l2-4h10l2 4 M3 14h18 M5 17v3 M19 17v3 M6 17h.01 M18 17h.01",
  statements: "M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h5",
  company:
    "M4 21V7l8-4 8 4v14 M8 9h.01 M16 9h.01 M8 13h.01 M16 13h.01 M10 21v-4h4v4",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  logout: "M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0112-1l2 3 M4 15l2 3a7 7 0 0012-1",
  check: "M5 12l4 4L19 6",
  clock: "M12 8v5l3 2 M21 12a9 9 0 11-18 0 9 9 0 0118 0",
  pin: "M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1114 0 M14 10a2 2 0 11-4 0 2 2 0 014 0",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  close: "M6 6l12 12 M6 18L18 6",
  chevron: "M9 5l7 7-7 7",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
