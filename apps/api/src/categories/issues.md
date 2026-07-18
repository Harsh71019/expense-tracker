# Categories Module — Code Review & Issues

## Architectural & Design Observations

1. **Category Creation Session & Audit**:
   - `CategoryRepository.create` does not take a `session` argument.
   - Creating or archiving a category does not record an entry in the immutable `audit_log`.
   - _Recommendation_: Consider adding audit logs for metadata collection changes (categories/accounts) and support database sessions in the create methods.
