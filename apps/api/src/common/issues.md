# Common Utilities — Code Review & Issues

## Architectural & Design Observations

1. **Transaction Timing / Telemetry**:
   - `withTxn` in `common/mongo-txn.ts` tracks attempts and latency using `performance.now()`.
   - _Observation_: This is a robust implementation. Ensure that the transaction observer does not introduce blocking microtasks or overhead in high-throughput database operations.

2. **Date Parsing Integrity**:
   - `parseExplicitDate` in `common/time/parse-date.ts` enforces explicit formats and guards against date rollover (like February 30th) by round-tripping verification through UTC date methods. This perfectly prevents common date conversion bugs.
