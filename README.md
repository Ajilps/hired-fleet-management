# BASAP

HireD Phase 1 applications, design and API contracts. The Express/TypeScript backend now implements admin authentication with Prisma/PostgreSQL sessions and persistent browser refresh cookies. The React admin portal integrates that real session lifecycle; company/profile and payout-rate APIs are also implemented with durable command replay and audit. Partner list/provisioning, company-scoped authentication and mandatory first-login password change are implemented. Admin account list/detail/creation/status APIs and the admin first-login password-change screen are now implemented, with last-usable-admin protection and session revocation. Order/trip/financial APIs, driver authentication and partner portal screens remain pending. See each application's README for actual implementation and verification scope.

## Project structure

The repository contains four independently managed application directories and local Docker configuration. PostgreSQL and Redis have a separate local development profile. The backend has its own pinned dependencies, migration history, tests and CI; follow [backend setup](backend/README.md) to run it.

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

Each web/backend application has a multi-stage `Dockerfile` and `.dockerignore`, with separate development, build and runtime targets. Portal runtimes serve compiled assets through Nginx. The root `compose.yaml` selects development targets and can start PostgreSQL and Redis now; application containers require their own manifests, lockfiles and scripts first. Follow the [developer Docker guide](docs/docker-setup.md) for commands and initialization requirements. Generate Flutter's Android platform files with the selected Flutter SDK during mobile initialization.

See the application READMEs: [Admin portal](admin-portal/README.md), [Business partner portal](b2b-portal/README.md), [Driver app](driver_app/README.md) and [Backend](backend/README.md).

## Docker quick start

Start your Docker engine, then run these commands from the repository root to start local PostgreSQL and Redis:

```sh
cp -n .env.example .env
docker compose --profile dev config --quiet
docker compose --profile dev up -d --wait
```

Application containers require initialization first. The [developer Docker guide](docs/docker-setup.md) covers individual services, full-stack startup, independent image builds/runs, everyday commands and troubleshooting.

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
