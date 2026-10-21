# BASAP

HireD Phase 1 applications, design and API contracts. The Express/TypeScript backend now implements admin authentication with Prisma/PostgreSQL sessions and persistent browser refresh cookies. The React admin portal integrates that real session lifecycle; company/profile and payout-rate APIs are also implemented with durable command replay and audit. Partner list/provisioning, company-scoped authentication and mandatory first-login password change are implemented. Admin account list/detail/creation/status APIs and the admin first-login password-change screen are now implemented, with last-usable-admin protection and session revocation. Driver onboarding/authentication and opt-in private uploads/scanning are implemented; document attachment/download/initial activation are implemented locally; order/trip/financial APIs and partner portal screens remain pending. See each application's README for actual implementation and verification scope.

## Project structure

The repository contains four independently managed application directories and local Docker configuration. PostgreSQL starts with the apps; unused Redis is optional under the `cache` profile. The backend has its own pinned dependencies, migration history, tests and CI; follow [backend setup](backend/README.md) to run it.

```text
BASAP/
├── admin-portal/          # React admin frontend
│   ├── public/
│   └── src/
├── b2b-portal/            # React business partner frontend
│   ├── public/
│   └── src/
├── driver_app/            # Flutter Android driver app
│   ├── lib/
│   └── test/
├── backend/               # Express + TypeScript + Prisma
│   ├── prisma/
│   ├── src/
│   └── tests/
├── docs/
├── compose.yaml           # Local dependency and application profiles
├── .env.example           # Local Docker configuration template
├── .gitignore
└── README.md
```

Each application owns its dependencies, configuration and startup commands. Add a separate `package.json` and `pnpm-lock.yaml` inside each Node.js application when initializing it; Flutter owns its `pubspec.yaml` and `pubspec.lock`. There is no root Node.js package or pnpm workspace. The API documentation remains a separate existing package in `docs/api/`.

Each web/backend application has a multi-stage `Dockerfile` and `.dockerignore`, with separate development, build and runtime targets. Portal runtimes serve compiled assets through Nginx. The root `compose.yaml` selects development targets and starts the API, both portals and PostgreSQL by default. Follow the [developer Docker guide](docs/docker-setup.md) for commands and initialization requirements. Generate Flutter's Android platform files with the selected Flutter SDK during mobile initialization.

See the application READMEs: [Admin portal](admin-portal/README.md), [Business partner portal](b2b-portal/README.md), [Driver app](driver_app/README.md) and [Backend](backend/README.md).

## Run locally

Start Docker Desktop (or your Docker engine). From this repository directory:

```sh
cp -n .env.example .env
```

Edit `.env`: set `LOCAL_ADMIN_PASSWORD` to your own **15–128-character** password. Optionally change `LOCAL_ADMIN_EMAIL` (default `admin@example.com`) and `LOCAL_ADMIN_NAME`.

```sh
docker compose up --build
```

Open **http://localhost:5173** and sign in with the email/password from `.env`. The business portal starter is at **http://localhost:5174**; API readiness is at **http://localhost:3000/ready**.

Compose installs the pinned dependencies, generates Prisma, applies committed migrations, generates and persists independent local auth/replay keys, and creates the first admin when no admin exists. Portals start after API readiness. Restarts preserve accounts, passwords, keys and database data; changing `.env` does not reset an existing admin. No host Node.js or pnpm installation is required.

For later starts, `docker compose up` is enough. Stop with Ctrl+C, or run `docker compose down` for detached containers. Do not add `--volumes` unless you intend to delete local database data and keys.

Private uploads default to disabled. To enable them, set `PRIVATE_UPLOADS_ENABLED=true` in `.env` and run `docker compose --profile dev up --build`; that also starts SeaweedFS and ClamAV. Flutter runs separately. Orders/trips/financial APIs and some client integrations remain pending.

See the [Docker guide](docs/docker-setup.md) for ports, optional services, host development and troubleshooting.

## Documentation

- [Decision log: selected stack, capacity target and remaining choices](docs/decision-log.md)
- [Technology stack: React/Express/Node, PostgreSQL/Prisma, Flutter and security packages](docs/technology-stack.md)
- [Development readiness: setup, architecture, security, tests and release guides](docs/development-readiness.md)
- [Infrastructure plan: Docker, Redis and managed PostgreSQL](docs/infrastructure-plan.md)
- [Developer Docker guide: setup, services, builds and troubleshooting](docs/docker-setup.md)
- [Travel-time estimation: initial distance heuristic and later routing providers](docs/travel-time-estimation.md)
- [API documentation and Swagger UI](docs/api/README.md)
- [OpenAPI 3.1 specification](docs/api/openapi.yaml)
- [Application workflows and flowcharts](docs/workflows.md)
- [UI/UX specification](docs/ui-ux-specification.md)
- [Frontend design references](docs/design/README.md)
- [Application naming conventions](docs/naming-conventions.md)
- [Git workflow and contribution rules](docs/git-workflow.md)
- [Database design](docs/database/database-design.md)
- [PRD validation of seven database areas](docs/database/prd-validation.md)
- [DBML schema](docs/database/hired.dbml)
- [Trip report snapshot contract](docs/database/trip-report-snapshot.schema.json)
- [Indexing and integrity rules](docs/database/indexing-strategy.md)
- [ERD PDF](docs/database/HireD_Phase_1_Database_ERD.pdf)

Local development object storage uses owner-selected **SeaweedFS Community Edition in Docker**. See [storage setup](docs/local-object-storage.md) for the storage-only profile, credentials and persistence. Private upload/scanning APIs are implemented; production storage remains pending.

Driver onboarding now uses admin-provisioned pending accounts with mandatory first-login password change, real driver authentication/own-profile scope and admin directory/detail/creation. See [driver policy](backend/drivers.md). Uploads/scanning are implemented; document access and initial activation are implemented locally; Flutter backend integration and cleanup/retention remain pending.
