# Accounts Module — Code Review & Issues

## Architectural & Design Observations

1. **Audit Logs Missing for Account Creation and Archival**:
   - Creating an account does not write an entry to the `audit_log` collection, although it executes within a database transaction session (`withTxn`).
   - Archiving an account does not write an audit log entry either.
   - _Recommendation_: Call `AuditRepository.record` when an account is created or archived to track these operations in the immutable audit log.

2. **Account Archiving Session**:
   - `AccountRepository.archive` does not take a `session` parameter. While archiving is a single-document write and doesn't modify other entities, it is good practice to support passing a `session` for eventual consistency if multiple writes are bundled in the future.
