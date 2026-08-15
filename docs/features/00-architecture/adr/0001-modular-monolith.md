# ADR-0001: Extend the modular monolith

## Status

Proposed

## Context

TreasuryOps already runs a NestJS API, Next.js web application, PostgreSQL, Redis/BullMQ, and shared Zod contracts. The new capabilities add domain complexity but do not need independent deployment, databases, teams, or scaling characteristics.

## Decision

Add bounded NestJS modules and feature-sliced frontend directories inside the existing applications. Use BullMQ for asynchronous work and PostgreSQL for durable state. Do not create microservices or a second application runtime.

## Consequences

### Positive

- Existing tenancy, transactions, audit, auth, observability, and deployment rails are reused.
- Cross-feature financial calculations avoid network calls and distributed consistency.
- Local development and home-LXC operations remain understandable.

### Negative

- Module boundaries require discipline because the compiler cannot enforce every domain rule.
- All capabilities deploy together.

## Alternatives considered

- Separate “planning service”: rejected because it adds distributed consistency and operations without a scaling requirement.
- Serverless calculators: rejected because jobs, database access, and existing deployment rails already solve the workload.
