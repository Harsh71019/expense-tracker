# ADR-0004: Bound the initial product as education and planning

## Status

Proposed; legal review required before a commercial launch

## Context

The product uses personal income, expenses, assets, liabilities, goals, and risk-related inputs. Prescriptive recommendations concerning securities or investment products may enter India’s regulated investment-advice boundary.

## Decision

The initial product provides transparent calculations, safety sequencing, generic instrument categories, user-configured allocation targets, and illustrative scenarios. It does not select named schemes or securities, issue buy/sell instructions, claim guaranteed returns, or execute investments. All assumptions and uncertainty are visible. Legal review is required before monetizing personalized investment recommendations.

## Consequences

### Positive

- The initial feature set remains valuable for budgeting, safety, and education.
- Product copy is less likely to misrepresent projections as outcomes.
- Instrument risk, liquidity, and horizon remain visible.

### Negative

- Users must choose actual products independently or with a qualified professional.
- Some originally proposed named-fund and “unlock aggressive mode” language is excluded.

## Alternatives considered

- Provide scheme-specific rankings: deferred pending regulatory, suitability, data, conflict, and operational design.
- Use a disclaimer while keeping prescriptive recommendations: rejected; a disclaimer does not change the function performed.

## References

- [SEBI Investment Advisers Regulations, last amended February 10, 2025](https://www.sebi.gov.in/legal/regulations/feb-2025/securities-and-exchange-board-of-india-investment-advisers-regulations-2013-last-amended-on-february-10-2025-_92319.html)
- [SEBI investor education: Riskometer](https://investor.sebi.gov.in/riskometer.html)
