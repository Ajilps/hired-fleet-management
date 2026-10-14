# Admin portal

Independent React frontend for HireD administrators. It calls the shared backend API.

- `src/`: application source.
- `public/`: public static assets; private driver documents do not belong here.

This directory is a skeleton, not a runnable React application. During initialization, select and pin the compatible toolchain, add this project's own `package.json` and `pnpm-lock.yaml`, and document its actual install, development, build and check commands here. Run this project's commands from this directory; no root workspace is required.

A multi-stage `Dockerfile`, `.dockerignore` and `nginx.conf` are included. Compose uses the development target; the runtime target serves only the built static assets through non-root Nginx on port 8080. Add this project's manifests, lockfile and `dev`/`build` scripts before building; the build must emit `dist/index.html`. See [local Docker setup](../docs/docker-setup.md) for commands, server binding and the public API build argument.

References: [UI specification](../docs/ui-ux-specification.md), [admin designs](../docs/design/admin/README.md), [API contract](../docs/api/openapi.yaml) and [naming conventions](../docs/naming-conventions.md).
