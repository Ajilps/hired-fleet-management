# HireD Naming Conventions

**Scope:** PostgreSQL, Prisma ORM, JavaScript/TypeScript (TypeScript selected for the backend), Express, React, Flutter/Dart, JSON, Docker, configuration and tests.

**Status:** mandatory project naming standard, effective 4 October 2026. Every new or modified identifier must follow the applicable rule below. Existing database and JSON contracts are retained through the explicit exceptions in this document. BASAP currently contains design artifacts, examples describe naming requirements for implementation, not already implemented endpoints or infrastructure.

**MUST** means required. **MUST NOT** means prohibited. A documented exception applies only to the named object or tool-defined contract, it does not authorize the same pattern for new objects. Any additional exception must be recorded here with its scope and reason before it is introduced. Names are validated in code review, automated enforcement is described in Section 11 and is not installed by this document.

## 1. Required styles

| Area | Mandatory style | Example |
| --- | --- | --- |
| Database tables | Plural `snake_case` | `trip_reports` |
| Database columns and enum types | `snake_case` | `driver_id`, `trip_status` |
| Stored status/event values | Lowercase `snake_case` | `pending_verification` |
| JSON properties and API query parameters | `camelCase` | `companyIds`, `generatedAt` |
| API resource segments | Plural lowercase `kebab-case` | `/trip-reports` |
| JS/TS variables, parameters and functions | `camelCase` | `tripId`, `closeTrip()` |
| JS/TS classes, interfaces, type aliases and enum types | `PascalCase` | `TripReport`, `TripStatus` |
| Fixed global JS/TS primitive constants | `UPPER_SNAKE_CASE` | `DEFAULT_PAGE_SIZE` |
| React components and component files | `PascalCase` | `TripDetailsPage.tsx` |
| React hook functions | `use` followed by a PascalCase concept | `useAssignedTrips()` |
| Non-component JS/TS source files | `kebab-case` | `trip-service.ts`, `use-assigned-trips.ts` |
| Dart classes, enums and widgets | `PascalCase` | `DriverWalletScreen` |
| Dart variables, methods, constants and enum members | `camelCase` | `tripId`, `defaultPageSize` |
| Dart files, packages and directories | `snake_case` | `trip_details_screen.dart` |
| Application-owned Docker resource names | Lowercase `kebab-case` | `notification-worker`, `postgres-data` |
| Environment variables | `UPPER_SNAKE_CASE` | `DATABASE_URL` |
| Documentation and ordinary JSON files | `kebab-case` | `naming-conventions.md`, `trip-report-example.json` |

Casing is specific to each layer. Developers MUST map between layers explicitly and MUST NOT change external JSON names to match database names. Tool-defined filenames, external provider fields and generated identifiers use their exact required spelling, as specified in Section 10.

## 2. Shared vocabulary

All layers MUST use the same business terms.

| Term | Meaning | Required naming examples |
| --- | --- | --- |
| Company | B2B business receiving the service | `company_id`, `companyId` |
| Partner | User accessing the B2B portal | `partner`, `PartnerOrderPage` |
| Driver | Person executing a trip | `driver_id`, `driverId` |
| Order | Request before acceptance or rejection | `orders`, `acceptOrder()` |
| Trip | Execution created from an accepted order | `trips`, `startTrip()` |
| Trip report | Immutable report generated at closure | `trip_reports`, `TripReport` |
| Payroll record | Applied split and calculated shares for a closed trip | `trip_payroll_records`, `TripPayrollRecord` |
| Statement | Monthly company statement/invoice | `statements`, `publishStatement()` |
| Notification | Durable intent and email attempt tracking | `notifications`, `processNotification()` |

The internal billing entity MUST be named `statement`. UI text may say “Invoice”, developers MUST NOT create an `invoices` entity merely as a synonym. Company share, driver share and partner payment MUST remain distinct concepts.

Names MUST describe their meaning. Single objects use singular names (`trip`), collections use plural names (`trips`). Functions use action verbs (`calculateDriverShare`, `closeTrip`), vague business names such as `processData`, `dataList` and `doAction` are prohibited. Standard library names such as `data` are allowed only where imposed by an external interface, or when their meaning is clear within a generic utility.

For JS/TS and external JSON, abbreviations MUST read as words: `tripId`, `otpHash`, `etaSource`, `apiClient`, `OtpInput`, `ApiClient`. New mixed forms such as `tripID` and `OTPInput` are prohibited. Dart follows Effective Dart's acronym rules: two-letter uppercase acronyms stay uppercase in type names (`UI`, `ID`), while longer acronyms read as words (`Otp`, `Api`). Lower camelCase variables remain `tripId`, `otpHash` and `apiClient`.

## 3. Strict PostgreSQL rules

### 3.1 Identifier spelling

Application-owned PostgreSQL identifiers MUST match `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$` and MUST contain at most **63 ASCII characters/bytes**, including prefixes. This applies to schemas, tables, columns, views, functions, triggers, indexes, constraints and enum types.

Names MUST NOT contain uppercase letters, spaces, hyphens, consecutive underscores, trailing underscores or type prefixes such as `tbl_` and `col_`. Reserved SQL keywords MUST NOT be used as object names. Application SQL MUST use names that do not require quoted mixed-case identifiers. PostgreSQL folds unquoted identifiers to lowercase and defaults to a 63-byte limit. [PostgreSQL identifier rules](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS)

### 3.2 Tables, keys and relationships

| Object | Mandatory rule | Valid example | Invalid example |
| --- | --- | --- | --- |
| Entity table | Plural business noun in snake_case | `drivers`, `trip_reports` | `Driver`, `tbl_trip_report` |
| Column | Singular descriptive snake_case, except actual collections | `company_id` | `companyId`, `company_ids` for one ID |
| Entity primary-key column | `id` | `trips.id` | `trips.trip_id` |
| Foreign-key column | Singular referenced entity plus `_id` | `trip_id`, `file_asset_id` | `trip`, `fileAssetId` |
| Role-specific foreign key | Role plus referenced entity and `_id` | `current_driver_id`, `created_by_user_id` | `current_id`, `created_by` |
| Relationship table | Existing domain vocabulary and plural table name | `company_users` | `companyUserMapping` |
| Enum type | Singular concept describing the field | `trip_status`, `document_type` | `TripStatuses` |
| Enum value | Lowercase snake_case business value | `pending_verification` | `PendingVerification` |

Composite-key relationship tables MUST retain their meaningful foreign-key columns, developers MUST NOT add an artificial `id` merely to satisfy this naming rule. Shared-primary-key tables retain their referenced key (`wallet_accounts.driver_id`, `driver_performance_summaries.driver_id`). Existing [hired.dbml](database/hired.dbml) is the authoritative table/column/enum inventory.

### 3.3 Field meaning and suffixes

| Meaning | Mandatory rule for new columns | Example |
| --- | --- | --- |
| Timestamp/instant | End in `_at` | `created_at`, `closed_at` |
| Calendar date | Noun dates end in `_date`, event dates end in `_on` | `availability_date`, `expires_on` |
| Calendar-date range | End in `_start_date` / `_end_date` | `billing_start_date`, `billing_end_date` |
| Duration | Include explicit unit `_seconds`, `_minutes` or `_hours` | `estimated_duration_minutes` |
| Byte quantity | End in `_bytes` | `upload_size_bytes` |
| Money | End in `_amount`, use the currency contract | `driver_share_amount` |
| Percentage | End in `_percent` | `applied_driver_percent` |
| Boolean | Start with `is_` or `has_` | `is_active`, `has_receipt` |
| Count | End in `_count` | `attempt_count`, `completed_trip_count` |
| Lifecycle field | `status`, or `<concept>_status` when multiple lifecycles coexist | `status`, `payout_status` |
| Hash | End in `_hash`, or explicit algorithm name where already established | `password_hash`, `checksum_sha256` |
| Encrypted value | End in `_encrypted_value` | `otp_encrypted_value` |

A duration MUST NOT be named as a timestamp. `admin_eta_minutes` remains a duration override. A boolean MUST NOT be introduced as `<concept>_status`, lifecycle statuses and yes/no flags are different fields.

The following existing column spellings are exact compatibility exceptions: `company_payout_rates.effective_from`, `company_payout_rates.effective_to`, `drivers.date_of_birth`, `drivers.online_status`, `file_assets.byte_size`, `trips.otp_failed_attempts`, `wallet_accounts.balance`, `statements.period_start`, `statements.period_end`, `statements.total_driver_share` and `statements.total_company_share`. Their current names, types and meanings MUST remain intact. New columns MUST follow the rules above rather than copying an exceptional name. Existing enum value `aadhar` MUST remain unchanged unless its contract is explicitly migrated.

### 3.4 Indexes, constraints and other database objects

New migration-defined objects MUST use these patterns. `<columns>` lists columns in declared order, separated by underscores. `<rule>` and `<purpose>` describe the actual constraint or predicate.

| Object | Required pattern | Example |
| --- | --- | --- |
| Primary-key constraint | `pk_<table>` | `pk_trips` |
| Foreign-key constraint | `fk_<table>_<columns>` | `fk_trips_company_id` |
| Ordinary index | `ix_<table>_<columns_or_purpose>` | `ix_trips_status_scheduled_pickup_at` |
| Unique constraint/index | `uq_<table>_<columns_or_rule>` | `uq_trips_order_id` |
| CHECK constraint | `ck_<table>_<rule>` | `ck_trip_expenses_amount_positive` |
| View | `vw_<plural_business_name>` | `vw_driver_payouts` |
| Materialized view | `mv_<plural_business_name>` | `mv_monthly_company_totals` |
| Database function | `<verb>_<business_concept>` | `calculate_driver_share` |
| Trigger | `trg_<table>_<purpose>` | `trg_trip_reports_prevent_update` |

Use `ix_`, matching the existing SQL examples, `idx_` MUST NOT be mixed into new index names. A semantic purpose/rule MUST be used when a full column list would exceed 63 bytes, silent PostgreSQL truncation is prohibited. New explicit sequences, if needed, MUST use `seq_<table>_<column>`, internal names generated by PostgreSQL itself are exempt.

Existing names explicitly declared in [indexing-strategy.md](database/indexing-strategy.md), including `ix_expired_notification_claim`, `uq_one_active_assignment_per_trip` and `ck_expense_positive`, are retained compatibility exceptions to the table-qualified pattern. This exception applies to the current declarations, not future additions. Newly implemented unnamed DBML indexes and constraints MUST receive compliant explicit names in migrations. A `uq_` prefix does not create uniqueness: the declaration MUST also use `UNIQUE` and the correct predicate.

### 3.5 Prisma models and migrations

TypeScript and Prisma ORM are selected for the backend (DEC-33/34). Prisma model/type names MUST be singular PascalCase; application field/relation names MUST be camelCase. Explicit `@@map`/`@map` mappings MUST preserve table/column names, including existing exceptions: `TripReport` → `trip_reports`, `companyId` → `company_id`, `WalletAccount.balance` → `wallet_accounts.balance`. Model naming MUST NOT rename the stored schema or external JSON contract. Use the pinned release's supported mapping for enum types/values and named constraints/indexes; preserve values such as `pending_verification` and `aadhar`, native types and composite/shared keys. Where unsupported, retain reviewed SQL rather than relying on generated defaults.

Prisma-generated API names, enum members and metadata are tool-contract exceptions to application naming; application DTOs/adapters MUST still expose HireD's existing names. TypeScript interfaces/enums authored by the team retain Section 6 rules.

Use one Prisma migration naming scheme for the pinned release: tool-generated ordering/timestamps and required files/directories MUST remain intact; application-authored migration descriptions MUST use descriptive snake_case (for example `add_trip_credit_guard`). Prisma configuration/model filenames and generated artifacts MUST retain the selected tool's required spelling. `prisma.config.ts`, `schema.prisma` or `contract.prisma`, and version-required migration files are explicit tool exceptions only when used by that release; this guide does not select a file layout or version. See [official migration workflow](https://www.prisma.io/docs/orm/migrations/how-migrations-work).

Mapped database object names and custom SQL MUST follow Sections 3.1–3.4 and their exact compatibility exceptions. Do not add the illustrative `001_...sql` scheme beside Prisma's ordered history or hand-edit generated client/types. Follow [schema ownership](database/database-design.md#prisma-models-and-schema-ownership).

## 4. JSON and API naming

Fixed application JSON property names and query parameters MUST use camelCase. One identifier uses `tripId`, an array uses `tripIds`. Fixed JSON boolean property names MUST begin with `is`, `has` or `can`, followed by a capitalized concept. Names containing measurements MUST retain units, such as `durationMinutes`, `actualDurationSeconds` and `sizeBytes`. Dynamic dictionary keys that represent data, such as UUIDs, are values used as keys and MUST retain their original spelling, they are not fixed property names subject to casing conversion.

Stored enum/event values MUST remain lowercase snake_case even inside camelCase JSON: `{"eventType":"order_accepted"}`. User-facing labels MUST NOT be serialized in place of agreed enum values. Existing report properties and values in [trip-report-snapshot.schema.json](database/trip-report-snapshot.schema.json) MUST be preserved exactly.

### Required mapping at boundaries

| Database value | Existing report JSON path | Meaning |
| --- | --- | --- |
| `trip_reports.id` | `reportId` | Report identity |
| `trip_reports.snapshot_version` | `snapshotVersion` | Contract version |
| `trip_reports.generated_at` | `generatedAt` | Generation timestamp |
| `trips.company_id` | `trip.companyId` | Owning company |
| `trip_expenses.expense_type` | `expenses[].category` | Category mapping |
| Effective trip duration | `trip.estimate.durationMinutes` | Override/maps precedence result |
| Payout status at closure | `payroll.payoutStatusAtClosure` | Frozen closure state |

Serializers/DTOs MUST map these meanings explicitly, automatic snake_case-to-camelCase conversion alone is insufficient. Snapshot money MUST remain an exact decimal string and timestamps MUST include a timezone offset, following the schema. Standard JSON Schema keywords (`$schema`, `$id`, `$defs`, `$ref`, `additionalProperties`) and external tool/provider keys MUST retain their required spellings.

## 5. Express and HTTP routes

Versioned business API routes MUST begin with `/api/v1` for the initial API. Resource segments MUST be plural lowercase kebab-case. Express parameter names MUST be singular camelCase and MUST include the identifier role: `:tripId`, `:reportId`, `:statementId`. HTTP methods describe reads/writes, lifecycle commands use a clear lowercase action suffix.

| Purpose | Required naming example |
| --- | --- |
| List trips | `GET /api/v1/trips` |
| Read a trip | `GET /api/v1/trips/:tripId` |
| Add an expense | `POST /api/v1/trips/:tripId/expenses` |
| Start a trip | `POST /api/v1/trips/:tripId/start` |
| Close a trip | `POST /api/v1/trips/:tripId/close` |
| Read a report | `GET /api/v1/trip-reports/:reportId` |
| Publish a statement | `POST /api/v1/statements/:statementId/publish` |

These are naming templates, not a complete endpoint specification. Paths such as `/getAllTrips`, `/TripReports` and `/:trip_id` are prohibited. Infrastructure probes such as `/health` and `/ready` are explicit exceptions to business resource naming. Standard HTTP headers retain their established names, for example `Content-Type` and `Authorization`.

Express router variables MUST be `<singularConcept>Router`, such as `tripRouter`. Module files MUST use `<singular-concept>-routes`, `-controller`, `-service`, `-repository` or `-validator` according to their responsibility: `trip-routes.ts`, `trip-controller.ts`, `trip-service.ts`. Middleware functions MUST describe their action, such as `authenticateUser`, `requireAdmin` and `validateCloseTripRequest`. Avoid generic names such as `middleware1`. These route/parameter forms follow [Express routing syntax](https://expressjs.com/en/guide/routing/), the resource naming policy is HireD's choice.

## 6. JavaScript and TypeScript

The Express backend uses TypeScript; its authored modules use `.ts`. Existing JavaScript documentation tooling remains valid, and React language/tooling details remain DEC-01 choices.

Variables, object properties, parameters and functions MUST use camelCase. Classes, interfaces, type aliases and enum types MUST use PascalCase. Interfaces MUST NOT use `I` prefixes and type aliases MUST NOT use `T` prefixes: use `TripRepository`, not `ITripRepository`.

Fixed global primitive constants MUST use UPPER_SNAKE_CASE, such as `DEFAULT_PAGE_SIZE`. Local `const` bindings, mutable/configuration objects and function bindings remain camelCase, declaring a variable with `const` does not require uppercase naming. Boolean variables/properties MUST start with `is`, `has` or `can` (`isActive`, `hasExpenses`, `canPublishStatement`). Collection names MUST be plural.

JS/TS enum member names MUST use PascalCase, while explicit serialized values retain the contract spelling, for example `PendingVerification = 'pending_verification'`. Services, repositories and request/response types MUST have role-based names, such as `TripService`, `TripRepository`, `CloseTripRequest` and `PublishStatementResponse`, only when they have those responsibilities.

Non-component source files MUST use kebab-case with their actual language extension (`trip-service.js`, `trip-service.ts`). JS/TS feature directories MUST use lowercase kebab-case (`trips`, `trip-reports`). Private visibility MUST use the language's access mechanism, JS/TS MUST NOT add underscore prefixes merely to indicate private members. The casing follows the [Google TypeScript style guide](https://google.github.io/styleguide/tsguide.html#identifiers), file spelling and constant scope are project rules.

## 7. React frontend

React component functions and their files MUST use matching PascalCase names: `TripDetailsPage` in `TripDetailsPage.tsx` or `TripDetailsPage.jsx`. TypeScript components use `.tsx`, JavaScript components containing JSX use `.jsx`. A `.ts` or `.js` module without JSX follows the non-component kebab-case file rule. Fixed entry files such as `index.tsx` are exceptions listed in Section 10.

Page-level components MUST end in `Page` (`StatementDetailsPage`). Reusable components MUST describe their purpose (`TripStatusBadge`, `OtpInput`). Component prop types MUST be `<ComponentName>Props` (`TripStatusBadgeProps`). Prop names use camelCase, callback props MUST begin with `on` (`onCloseTrip`), and local UI event handlers MUST begin with `handle` (`handleCloseTrip`).

Custom hook functions MUST start with `use` and a capitalized concept (`useAssignedTrips`). Hook module filenames MUST be kebab-case (`use-assigned-trips.ts`). Ordinary functions MUST NOT use the hook prefix. CSS class names and ordinary stylesheet filenames MUST use kebab-case (`trip-status-badge`, `trip-details.css`), CSS Modules use `TripStatusBadge.module.css` to match their component, with explicit mapping where class names contain hyphens. Framework/generated class names are exempt.

React requires capitalized component names, the remaining file and suffix choices are project rules. [React component naming](https://react.dev/learn/your-first-component)

## 8. Flutter and Dart mobile app

Classes, enum types, widgets and extensions MUST use PascalCase. Variables, fields, methods, constants and enum members MUST use camelCase. Private Dart library members MUST use the language's leading underscore (`_tripId`, `_loadTrips`), this is the explicit exception to ordinary camelCase spelling. Public members MUST NOT have that prefix.

Dart source files, packages and directories MUST use lowercase snake_case (`trip_details_screen.dart`, `trip_reports`). Screen widgets MUST end in `Screen` (`TripDetailsScreen`, `DriverWalletScreen`). Reusable widgets MUST describe their function (`TripStatusBadge`, `OtpInput`). The source filename MUST express the main public type in snake_case: `DriverWalletScreen` belongs in `driver_wallet_screen.dart`.

Dart MUST use `defaultPageSize` for constants, not `DEFAULT_PAGE_SIZE`. Enum members may be camelCase internally (`pendingVerification`), but serialization MUST emit the agreed JSON/DB value (`pending_verification`). Generated files such as `.g.dart` and `.freezed.dart` MUST keep their generator-defined names. These language conventions follow [Effective Dart](https://dart.dev/effective-dart/style).

## 9. Docker, files and configuration

### Docker names

| Item | Mandatory convention | Example |
| --- | --- | --- |
| Single-image build file in a service directory | Exact `Dockerfile` | `api/Dockerfile` |
| Multiple build files in one directory | `Dockerfile.<service>` with kebab-case service | `Dockerfile.notification-worker` |
| Main Compose file | Exact `compose.yaml` | `compose.yaml` |
| Environment-specific Compose file | `compose.<environment>.yaml` | `compose.dev.yaml`, `compose.prod.yaml` |
| Compose service key | Lowercase kebab-case, stable across environments | `api`, `notification-worker`, `admin-portal` |
| Application image repository basename | `hired-<service>` in lowercase kebab-case | `hired-api`, `hired-admin-portal` |
| Release image tag | `v<major>.<minor>.<patch>` | `v1.0.0` |
| Commit image tag | `sha-<lowercase-git-hash>` with 7–40 hex digits | `sha-7a74ee0` |
| Application-defined volume/network key | Lowercase kebab-case plus purpose suffix | `postgres-data`, `app-network` |
| Build stage alias | Lowercase kebab-case | `build`, `runtime`, `test` |

These examples are naming templates, not a mandate to deploy every listed service. Third-party images retain upstream repository/tag names. Application services MUST use Compose-generated container names, new `container_name` overrides are prohibited so names stay project-scoped and support replicas. Actual Compose-generated resource names may contain underscores and MUST NOT be rewritten to match application key casing.

Dockerfile instructions MUST use their conventional uppercase spelling (`FROM`, `WORKDIR`, `COPY`), stage aliases stay lowercase. Compose YAML keys MUST retain Docker's prescribed names (`depends_on`, `env_file`, `healthcheck`), not application camelCase. This policy uses the supported formats in the [Dockerfile reference](https://docs.docker.com/reference/dockerfile/) and [Compose service reference](https://docs.docker.com/reference/compose-file/services/).

### Files, tests and configuration

| Item | Required name format | Example |
| --- | --- | --- |
| New Markdown document | Kebab-case `.md` | `order-to-trip-workflow.md` |
| JSON Schema | Kebab-case `.schema.json` | `trip-report-snapshot.schema.json` |
| JS/TS unit test | Source basename plus `.test` | `trip-service.test.ts`, `TripStatusBadge.test.tsx` |
| JS/TS integration test | Source/purpose basename plus `.integration.test` | `trip-closure.integration.test.ts` |
| Dart test | Snake_case basename plus `_test.dart` | `trip_service_test.dart` |
| Environment file | `.env` or `.env.<environment>` | `.env.dev`, `.env.test`, `.env.prod` |
| Environment template | Exact `.env.example` | `.env.example` |
| Environment variable | UPPER_SNAKE_CASE | `DATABASE_URL`, `MAPS_API_KEY` |
| App configuration property | CamelCase in JS/TS and Dart | `emailRetryLimit` |
| Ordered SQL migration, if accepted by the selected tool | Zero-padded sequence plus snake_case purpose | `001_create_trips.sql` |

For new project-authored environment filename suffixes, use only `dev`, `test`, `staging` or `prod`. Provider-defined variables such as `NODE_ENV` retain their standard values and MUST NOT be abbreviated to fit this file rule. Prisma's pinned migration naming scheme (Section 3.5) overrides the illustrative numbered SQL format, developers MUST NOT mix schemes within a migration directory.

Node.js projects MUST use pnpm (DEC-36). A `packageManager` pin uses the tool-defined exact spelling and version form. `pnpm-lock.yaml` MUST be the sole package-manager lockfile for its chosen install boundary; workspace boundaries remain undecided. A migration from a legacy npm/Yarn lockfile removes it after validation rather than maintaining competing files. Flutter/Dart manifests and lockfiles retain their own tooling rules. See [pnpm setup policy](developer-setup.md#pnpm-policy-and-bootstrap).

## 10. Existing and external contract exceptions

The following MUST retain their established spellings:

- Database names and enum values in the current DBML, including the exact field exceptions in Section 3.3 and existing index/constraint declarations in Section 3.4. New database objects still follow the strict rules.
- Current camelCase report JSON keys and snapshot schema version. A new JSON property must follow the JSON rule and be introduced through a deliberate contract change.
- Existing `HireD_Phase_1_Database_ERD.pdf`, `hired.dbml`, existing linked document filenames, and the supplied `README.md`.
- Tool-defined files and entry points: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` only when a workspace is selected, `pubspec.yaml`, `analysis_options.yaml`, `main.dart`, `.gitignore`, `.dockerignore`, `Dockerfile`, and `index.js`/`index.ts`/`index.jsx`/`index.tsx` when required as entry points. Framework configuration names such as `tsconfig.json` retain the tool's spelling.
- Prisma configuration/model/migration files, generated API/enum/metadata names and database mappings as scoped in Section 3.5. These exceptions do not permit renaming existing database/API identifiers.
- Generator outputs, dependency APIs, provider JSON keys, JSON Schema keywords and standard HTTP headers. Adapters MUST expose the project convention when translating these into an application-owned contract.
- Wallet idempotency key format `close-trip:<trip_id>` and notification deduplication structure `event:resource:user:channel`. Placeholder values use stable identifiers, retries reuse the same key. These key formats MUST NOT be silently renamed.

New serialized business events and audit actions MUST use lowercase snake_case (`trip_closed`). Existing notification values remain `order_accepted`, `order_rejected`, `statement_published`, examples do not add values to the enum. Job classes MUST describe their responsibility (`ProcessNotificationJob`, `GenerateStatementJob`). `sent_at` keeps its existing meaning of provider acceptance, not confirmed mailbox delivery.

## 11. Required review and enforcement

Every change MUST be checked for the applicable naming rules. Reviewers MUST request correction of new violations before merging. New exceptions MUST be added to this guide with their exact scope and justification, “the framework allows it” does not by itself create an exception.

The implementation MUST include naming validation in its normal checks:

| Area | Required check when implementation is introduced |
| --- | --- |
| Database/DBML/migrations | Validate identifier syntax, 63-byte limit, object prefixes and semantic suffixes, verify declared exceptions |
| JS/TS and Express | ESLint naming checks plus source-file naming checks, review route segments and parameter names |
| React | Component/prop/hook naming checks, use React Hooks lint rules for hook usage |
| Flutter/Dart | Dart analyzer naming rules, review screen and test filename conventions |
| JSON | JSON Schema validation plus naming review for new properties and serialized values |
| Docker | Dockerfile/Compose validation plus project resource and file naming checks |

Formatters, schema validators and `docker compose config` do not enforce every project naming rule. Rules not covered by those tools MUST be checked by a dedicated naming check or code review. This documentation update does not claim those tools, checks or pipelines already exist.

A rename to an existing database or external contract MUST include a migration or API compatibility plan, and matching updates to serializers, clients, tests and documentation. Historical report snapshots MUST NOT be rewritten solely for naming consistency. Editing code around an unchanged documented exception does not require renaming that exception.
