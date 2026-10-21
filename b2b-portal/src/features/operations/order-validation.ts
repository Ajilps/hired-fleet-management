import type { OrderInput } from "./operation-service";
export type OrderFields = {
  pickup: string;
  drop: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  vehicle: string;
  notes: string;
  distance: string;
};
export function validateOrder(fields: OrderFields): {
  errors: Partial<Record<keyof OrderFields, string>>;
  input?: OrderInput;
} {
  const errors: Partial<Record<keyof OrderFields, string>> = {};
  for (const name of ["pickup", "drop", "name", "phone"] as const)
    if (!fields[name].trim()) errors[name] = "This field is required.";
  if (fields.pickup.length > 2000)
    errors.pickup = "Use up to 2,000 characters.";
  if (fields.drop.length > 2000) errors.drop = "Use up to 2,000 characters.";
  if (fields.name.length > 150) errors.name = "Use up to 150 characters.";
  if (fields.phone.length > 30) errors.phone = "Use up to 30 characters.";
  if (fields.vehicle.length > 2000 || fields.notes.length > 2000)
    errors.notes = "Use up to 2,000 characters for notes.";
  if (
    fields.distance &&
    (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(fields.distance) ||
      Number(fields.distance) <= 0)
  )
    errors.distance =
      "Enter road distance above 0 with up to two decimal places.";
  const date = new Date(`${fields.date}T${fields.time}:00+05:30`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.date) ||
    !Number.isFinite(date.getTime()) ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) !== fields.date
  )
    errors.date = "Choose a valid pickup date.";
  if (!/^\d{2}:\d{2}$/.test(fields.time) || !Number.isFinite(date.getTime()))
    errors.time = "Choose a valid pickup time.";
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: {
      pickup: { address: fields.pickup.trim() },
      drop: { address: fields.drop.trim() },
      requestedPickupAt: date.toISOString(),
      contact: { name: fields.name.trim(), phone: fields.phone.trim() },
      vehicleNotes: fields.vehicle.trim() || null,
      serviceNotes: fields.notes.trim() || null,
      ...(fields.distance
        ? {
            routeDistanceKm: `${fields.distance.split(".")[0]}.${(fields.distance.split(".")[1] ?? "").padEnd(2, "0")}`,
          }
        : {}),
    },
  };
}
