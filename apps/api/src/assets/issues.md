# Assets Module — Code Review & Issues

## Architectural & Design Observations

1. **Valuation Listing Lacks Pagination Implementation**:
   - `AssetService.listValuations` returns a `ValuationPage` shape with pagination metadata, but it retrieves all valuations in a single call to `this.valuations.listByAsset`.
   - _Observation_: While okay for personal use due to low volume, for strict compliance with the cursor pagination standard (`BACKEND.md` §5/§7), it should eventually utilize real cursor pagination.

2. **In-Memory Net Worth Aggregation**:
   - `NetWorthService.get` lists all accounts and assets in memory to compute the totals.
   - _Observation_: For large scales this would cause high memory pressure. Given the current single-user scope, it is appropriate, but should be documented as a potential scalability point.
