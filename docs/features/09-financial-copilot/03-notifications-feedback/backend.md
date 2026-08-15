# Copilot Notifications and Feedback — Backend Plan

## Scope

Deliver only high-value action/review notifications through the existing outbox and collect dismiss, snooze, action-started, action-completed, and usefulness feedback without altering financial state.

## Model and API

Add recommendation interaction rows keyed by recommendation and user. Snooze stores an expiry; dismissal applies to the recommendation fingerprint/policy rules. Feedback is a small enum plus optional bounded reason code, not free-form financial data.

- `POST /api/v1/copilot/recommendations/:id/dismiss`
- `POST /api/v1/copilot/recommendations/:id/snooze`
- `POST /api/v1/copilot/recommendations/:id/feedback`

Outbox rows are written only by the triggering evaluation transaction. Deduplicate by recommendation/review fingerprint and channel. Rate-limit notifications per user and urgency class.

## Files to create

- Interaction schemas/repository/service tests
- Notification policy/rate-limit helper

## Files to edit

- Copilot schema/module/controller, notification enum/processor templates, OpenAPI/client

## Tests

Test duplicate outbox prevention, snooze expiry, new evidence after dismissal, ownership, invalid feedback, concurrency, rate limits, and no direct ntfy/Telegram call from services.
