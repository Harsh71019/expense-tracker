# Financial Copilot

## Outcome

Select one evidence-backed next action from safety, cash flow, goals, wealth, and data-quality candidates. Provide an optional weekly review that remains useful when AI is disabled or unavailable.

## Subfeatures

1. Deterministic recommendation candidate and ranking engine
2. Weekly financial review
3. Notifications, dismissals, snoozes, and usefulness feedback

## Existing capabilities to reuse

Dashboard, spending warnings, weekly-review architecture proposal, notifications, scheduled runs, BullMQ, audit, and problem-details errors.

## Priority order

Data correctness and overdue commitments outrank high-cost debt, which outranks missing protection, which outranks emergency runway, which outranks planned near-term goals, which outranks allocation drift and wealth acceleration. Exact ties use stable deterministic rules.

## Product rules

- One primary action is visible; secondary evidence may be inspected.
- Every claim references a verified evidence item.
- AI can narrate but cannot add numbers, products, claims, or actions.
- Dismissal and snooze affect presentation, not underlying financial state.
