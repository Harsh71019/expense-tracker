# Imports Module — Code Review & Issues

## Architectural & Design Observations

1. **Pending Implementation of Key Endpoints**:
   - Only `POST /v1/imports` (upload and queue parsing) is implemented.
   - The endpoints for `GET /imports` (batch history), `GET /imports/:id/preview` (staged rows + dupe flags), `PATCH /imports/:id/rows/:rowId` (toggle include / fix category), `POST /imports/:id/commit` (commit batch to transactions), and `POST /imports/:id/revert` (revert committed import) are currently **missing**.
   - _Observation_: These represent the core of Phase 2 development and must be implemented following the repository rules (specifically: chunked transaction sessions of size <= 200, balance updates, and audit logging).

2. **Deduplication Check in Memory**:
   - During `parseFile` execution, deduplication maps the database transactions via `this.transactions.findExistingDedupeHashes`.
   - The partial unique index on `fileHash` (`status: "committed"`) ensures database-level validation, which correctly supports re-uploading files after they are reverted or failed.
