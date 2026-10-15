# Backend

Independent Express modular monolith in TypeScript with Prisma ORM and PostgreSQL. The admin portal, business partner portal and driver app use this shared API.

- `src/`: API and worker source, organized into business modules during implementation.
- `prisma/`: Prisma models, generated migration history and seed source when implemented.
- `tests/`: backend integration and workflow tests.

This directory is a skeleton, not a runnable backend. During initialization, select and pin the compatible toolchain, add this project's own `package.json` and `pnpm-lock.yaml`, and document actual install, generation, migration, seed, development, build and test commands here. Run this project's commands from this directory; no root workspace is required.

A multi-stage `Dockerfile` and `.dockerignore` are included. Development, build, production-dependency and runtime stages separate tooling from the deployed API. The root `compose.yaml` uses the development target and provides local PostgreSQL and Redis independently of application initialization. Add the manifests, lockfile and `dev`, `generate` and `build` scripts before building. The runtime expects `dist/index.js`; generated Prisma/runtime assets must be in the copied output or production dependencies. See [local Docker setup](../docs/docker-setup.md) for commands and the complete initialization contract.

References: [architecture](../docs/system-architecture.md), [database design](../docs/database/database-design.md), [DBML](../docs/database/hired.dbml), [API contract](../docs/api/openapi.yaml) and [security design](../docs/security-design.md).
