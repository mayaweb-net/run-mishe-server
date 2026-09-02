# Agent Instructions — run-mishe-server

## Module architecture

Feature code lives under `src/app/modules/`.

### Domain modules (shared services)

Each business domain gets its own module with **services only** (no admin-specific services):

```
src/app/modules/hardware/
  hardware.module.ts
  cpu.service.ts
  gpu.service.ts
  dto/
```

- Services talk to Prisma and contain all business logic.
- The same service is used by **both** public and admin controllers.
- Never create `AdminCpuService` / `AdminGpuService` — that duplicates logic.

### Admin module (controllers only)

```
src/app/modules/admin/
  admin.module.ts
  controllers/
    admin.hardware.controller.ts
```

- Admin module **imports** domain modules and exposes admin-only HTTP routes.
- Controllers delegate to domain services (`CpuService`, `GpuService`, …).
- Later: attach admin auth guard on `AdminModule` controllers, not on services.

### Public controllers (future)

When the client needs the same data, add public controllers inside the domain module:

```
src/app/modules/hardware/controllers/hardware.controller.ts
```

Public routes: `GET /hardware/cpus`, `GET /hardware/gpus`  
Admin routes: `GET /admin/hardware/cpus`, `GET /admin/hardware/gpus`

Both call the same services.

## Pagination convention

List endpoints return:

```json
{
  "items": [],
  "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
}
```

Query params: `page`, `limit`, `q`, plus domain-specific filters.

## Docs

Read `document/README.md` before changing data models or estimation logic.
