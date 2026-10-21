import { request } from "../../shared/api/client";
import { object, id, text, invalid } from "../../shared/api/validation";
export async function getCompany(
  token: string,
  companyId: string,
  signal: AbortSignal,
) {
  const row = object(
    await request(`/companies/${companyId}`, { token, signal }),
  );
  if (id(row.id) !== companyId || typeof row.isActive !== "boolean")
    return invalid();
  return {
    id: companyId,
    legalName: text(row.legalName),
    displayName: text(row.displayName),
    contactName: text(row.contactName),
    contactEmail: text(row.contactEmail),
    contactPhone: text(row.contactPhone),
    billingAddress: text(row.billingAddress),
    isActive: row.isActive,
  };
}
