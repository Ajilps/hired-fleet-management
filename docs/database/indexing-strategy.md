# HireD indexing strategy

PostgreSQL automatically indexes each primary key and each `UNIQUE` constraint. The following are additional indexes because they match real application screens and reports.

| Index | Query it accelerates | Why it is needed |
|---|---|---|
| `orders(status, created_at)` | Admin order inbox | Filters received orders and displays newest first. |
| `orders(company_id, created_at)` | Partner's order history | Limits results to the logged-in partner's company. |
| `trips(current_driver_id, status)` | Driver mobile trip list | Finds only that driver's active and past trips. |
| `trips(status, scheduled_pickup_at)` | Admin dispatch / live trips | Finds unassigned, assigned, or ongoing trips in operational order. |
| `trips(company_id, closed_at)` | Company reports and statement generation | Retrieves a company's closed trips for a month. |
| `trip_assignments(driver_id, status, assigned_at)` | Availability/conflict checks | Checks a driver's current and previous work. |
| `trip_expenses(trip_id, logged_at)` | Trip close and report | Retrieves a trip's expenses quickly. |
| `wallet_transactions(driver_id, created_at DESC)` | Driver wallet screen | Retrieves newest credits first. |
| `driver_score_events(driver_id, created_at)` | Driver score history | Builds an auditable conduct timeline. |
| `statements(company_id, period_start)` | Partner statement lookup | One statement per company per month. |
| `audit_logs(entity_type, entity_id, created_at DESC)` | Admin audit trail | Finds the full history of any record. |

## Required partial indexes / constraints in PostgreSQL migrations

DBML visualizes the schema, but these PostgreSQL rules must be added in the SQL migration because they are conditional:

```sql
CREATE UNIQUE INDEX uq_one_active_assignment_per_trip
  ON trip_assignments (trip_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX uq_current_driver_document_type
  ON driver_documents (driver_id, document_type)
  WHERE is_current = true;

CREATE UNIQUE INDEX uq_one_trip_credit
  ON wallet_transactions (trip_id)
  WHERE transaction_type = 'trip_credit';
```

Do not index every column. Each index consumes disk space and makes inserts/updates slower. Add an index only for a frequent filter, join, ordering operation, or integrity rule; validate it with `EXPLAIN ANALYZE` once the application has realistic data.
