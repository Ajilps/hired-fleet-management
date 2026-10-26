# API endpoint reference

Generated from [openapi.yaml](openapi.yaml). This is a proposed contract, not a list of deployed routes.

## Authentication

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth-sessions/login` | public | P0 | `login` |
| POST | `/api/v1/auth-sessions/refresh` | public | P0 | `refreshSession` |
| POST | `/api/v1/auth-sessions/logout` | admin, partner, driver | P0 | `logout` |
| GET | `/api/v1/auth-sessions` | admin, partner, driver | P0 | `listOwnSessions` |
| DELETE | `/api/v1/auth-sessions/{sessionId}` | admin, partner, driver | P0 | `revokeOwnSession` |

## Accounts

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/users/me/password` | admin, partner | P0 | `changeOwnPassword` |
| GET | `/api/v1/users/me` | admin, partner, driver | P0 | `getCurrentUser` |
| GET | `/api/v1/users` | admin | P0 | `listUsers` |
| POST | `/api/v1/users` | admin | P0 | `createAdminUser` |
| GET | `/api/v1/users/{userId}` | admin | P0 | `getUser` |
| PATCH | `/api/v1/users/{userId}/status` | admin | P0 | `setUserStatus` |

## Companies

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/companies` | admin | P0 | `listCompanies` |
| POST | `/api/v1/companies` | admin | P0 | `createCompany` |
| GET | `/api/v1/companies/{companyId}` | admin, partner | P0 | `getCompany` |
| PATCH | `/api/v1/companies/{companyId}` | admin | P0 | `updateCompany` |
| GET | `/api/v1/companies/{companyId}/payout-rates` | admin | P0 | `listCompanyRates` |
| POST | `/api/v1/companies/{companyId}/payout-rates` | admin | P0 | `createCompanyRate` |
| GET | `/api/v1/companies/{companyId}/partners` | admin | P0 | `listCompanyPartners` |
| POST | `/api/v1/companies/{companyId}/partners` | admin | P0 | `createCompanyPartner` |

## Drivers

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/driver-applications` | public · disabled, always 403 | P0 | `submitDriverApplication` |
| GET | `/api/v1/drivers` | admin | P0 | `listDrivers` |
| POST | `/api/v1/drivers` | admin | P0 | `createDriver` |
| GET | `/api/v1/drivers/me` | driver | P0 | `getOwnDriverProfile` |
| PATCH | `/api/v1/drivers/me` | driver | P2 | `updateOwnDriverProfile` |
| GET | `/api/v1/drivers/{driverId}` | admin | P0 | `getDriver` |
| PATCH | `/api/v1/drivers/{driverId}/status` | admin | P0 | `setDriverStatus` |
| GET | `/api/v1/drivers/me/availability` | driver | P0 | `getOwnAvailability` |
| PUT | `/api/v1/drivers/me/availability` | driver | P0 | `setOwnAvailability` |
| GET | `/api/v1/drivers/me/availability-dates` | driver | P0 | `listOwnAvailabilityDates` |
| PUT | `/api/v1/drivers/me/availability-dates/{availabilityDate}` | driver | P0 | `setOwnAvailabilityDate` |
| GET | `/api/v1/drivers/{driverId}/availability-dates` | admin | P0 | `listDriverAvailabilityDates` |

## Files

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/file-assets` | admin, driver | P0 | `uploadFileAsset` |
| GET | `/api/v1/file-assets/{assetId}` | admin, partner, driver | P0 | `getFileAsset` |
| POST | `/api/v1/file-assets/{assetId}/download-links` | admin, partner, driver | P0 | `createFileDownloadLink` |

## Documents

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/drivers/me/documents` | driver | P0 | `listOwnDriverDocuments` |
| POST | `/api/v1/drivers/me/documents` | driver | P0 | `attachOwnDriverDocument` |
| GET | `/api/v1/drivers/{driverId}/documents` | admin | P0 | `listDriverDocuments` |
| POST | `/api/v1/drivers/me/documents/{documentId}/replacements` | driver | P2 | `replaceOwnDriverDocument` |

## Orders

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/orders` | admin, partner | P0 | `listOrders` |
| POST | `/api/v1/orders` | admin, partner | P0 | `createOrder` |
| GET | `/api/v1/orders/{orderId}` | admin, partner | P0 | `getOrder` |
| POST | `/api/v1/orders/{orderId}/accept` | admin | P0 | `acceptOrder` |
| POST | `/api/v1/orders/{orderId}/reject` | admin | P0 | `rejectOrder` |
| PATCH | `/api/v1/orders/{orderId}/estimate-override` | admin | P1 | `overrideOrderEstimate` |

## Trips

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/trips` | admin, partner, driver | P0 | `listTrips` |
| GET | `/api/v1/trips/{tripId}` | admin, partner, driver | P0 | `getTrip` |
| PATCH | `/api/v1/trips/{tripId}/amount` | admin | P0 | `updateTripAmount` |
| PATCH | `/api/v1/trips/{tripId}/estimate-override` | admin | P1 | `overrideTripEstimate` |
| GET | `/api/v1/trips/{tripId}/assignments` | admin | P0 | `listTripAssignments` |
| POST | `/api/v1/trips/{tripId}/assignments` | admin | P0 | `assignTripDriver` |
| POST | `/api/v1/trips/{tripId}/start` | driver | P0 | `startTrip` |
| POST | `/api/v1/trips/{tripId}/close-code/reveal` | partner | P0 | `revealTripCloseCode` |
| GET | `/api/v1/trips/{tripId}/selfie` | admin, driver | P1 | `getTripSelfie` |
| POST | `/api/v1/trips/{tripId}/selfie` | driver | P1 | `attachTripSelfie` |
| POST | `/api/v1/trips/{tripId}/close` | driver | P0 | `closeTrip` |

## Expenses

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/trips/{tripId}/expenses` | admin, partner, driver | P0 | `listTripExpenses` |
| POST | `/api/v1/trips/{tripId}/expenses` | driver | P0 | `createTripExpense` |
| PATCH | `/api/v1/trips/{tripId}/expenses/{expenseId}` | driver | P0 | `updateTripExpense` |
| DELETE | `/api/v1/trips/{tripId}/expenses/{expenseId}` | driver | P0 | `deleteTripExpense` |
| PUT | `/api/v1/trips/{tripId}/expense-confirmation` | driver | P0 | `confirmTripExpenses` |

## Trip reports

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/trip-reports` | admin, partner, driver | P0 | `listTripReports` |
| GET | `/api/v1/trip-reports/{reportId}` | admin, partner, driver | P0 | `getTripReport` |

## Earnings

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/drivers/me/wallet` | driver | P0 | `getOwnWallet` |
| GET | `/api/v1/drivers/me/wallet-credits` | driver | P0 | `listOwnWalletCredits` |

## Payroll

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/payroll-records` | admin | P0 | `listPayrollRecords` |
| GET | `/api/v1/payroll-records/{payrollRecordId}` | admin | P0 | `getPayrollRecord` |
| PATCH | `/api/v1/payroll-records/{payrollRecordId}/partner-payment-status` | admin | P0 | `recordPartnerPaymentStatus` |

## Statements

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/statements` | admin, partner | P0 | `listStatements` |
| POST | `/api/v1/statements` | admin | P0 | `generateStatement` |
| GET | `/api/v1/statements/{statementId}` | admin, partner | P0 | `getStatement` |
| POST | `/api/v1/statements/{statementId}/regenerate` | admin | P0 | `regenerateStatement` |
| POST | `/api/v1/statements/{statementId}/submit` | admin | P0 | `submitStatement` |
| POST | `/api/v1/statements/{statementId}/approvals` | admin | P0 | `approveStatement` |
| POST | `/api/v1/statements/{statementId}/publish` | admin | P0 | `publishStatement` |

## Admin reports

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/reports/billing-issues` | admin | P1 | `getBillingIssuesReport` |
| GET | `/api/v1/reports/driver-delays` | admin | P1 | `getDriverDelaysReport` |
| GET | `/api/v1/reports/client-volumes` | admin | P1 | `getClientVolumesReport` |
| GET | `/api/v1/reports/driver-payouts` | admin | P1 | `getDriverPayoutsReport` |
| GET | `/api/v1/reports/trips` | admin | P1 | `getTripsReport` |
| GET | `/api/v1/reports/orders` | admin | P1 | `getOrdersReport` |
| GET | `/api/v1/reports/driver-work` | admin | P1 | `getDriverWorkReport` |

## Operations

| Method | Path | Access | Priority | Operation |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/notifications` | admin | P1 | `listNotifications` |
| GET | `/api/v1/notifications/{notificationId}` | admin | P1 | `getNotification` |
| POST | `/api/v1/notifications/{notificationId}/retry` | admin | P1 | `retryFailedNotification` |
| GET | `/api/v1/audit-logs` | admin | P1 | `listAuditLogs` |

