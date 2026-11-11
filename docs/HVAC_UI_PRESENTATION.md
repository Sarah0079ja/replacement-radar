# HVAC Replacement Radar — Contractor UI Presentation

**Milestone:** Contractor prospecting workspace presentation refactor  
**Date:** November 3, 2026

## Product presentation

The contractor-facing application presents a ranked prospecting workspace. Internal opportunity scores, scoring components, evidence confidence, and ranking calculations remain in the data model and continue to control ordering, but numeric scoring is not shown in the normal list or property drawer.

Backend priority mapping:

- `STRONG` → `HIGH PRIORITY`
- `MEDIUM` → `MEDIUM PRIORITY`
- `WEAK` → `LOW PRIORITY`

## Dashboard metrics

The summary strip uses only available data:

- **Homes to target:** count of `STRONG` or `MEDIUM` opportunities whose workspace lead status is not `WON` or `NOT INTERESTED`.
- **High priority:** count of opportunities with `opportunity_strength = STRONG`.
- **Owner occupied:** count of opportunities with `owner_occupancy = LIKELY_OWNER_OCCUPIED`; this is an inferred proxy, not verified occupancy.
- **New prospects:** count of workspace lead records currently in `NEW` status, defaulting to `NEW` when no activity exists.
- **Appointments:** count of workspace lead records currently in `APPOINTMENT` status.

No sale, sale-price, job-value, homeowner-contact, equipment-age, drive-time, or unsupported geography metric is displayed.

## Contractor-facing list

The primary list is organized as:

`PROPERTY | PRIORITY | LAST HVAC RECORD | HOME | OWNER / OCCUPANCY | LOCAL SIGNAL | STATUS`

The list keeps backend ranking order and exposes compact contractor-language context. Numeric scores, score components, and evidence confidence are not primary list columns.

## Property drawer

The drawer order is:

1. Property header and priority
2. Why this home stands out
3. Last HVAC record
4. Home and ownership
5. Lead status
6. Source evidence
7. HVAC event timeline
8. Nearby HVAC activity
9. Private notes

The “Why this home stands out” sentence is deterministic and generated only from existing fields. It does not use an LLM or expose point contributions.

Detailed `VERIFIED DATA`, `INFERENCE`, and `UNKNOWN` labels remain in the lower Source evidence section. Owner occupancy is shown naturally in the working view with a small `Inferred` label.

Owner names and mailing addresses are enabled for the founder-test MVP through `NEXT_PUBLIC_SHOW_OWNER_DETAILS=true` (the default). Setting it to `false` hides those fields from the working UI and CSV export without changing the enrichment data. DCAD placeholder values containing withheld markers render as `Withheld by DCAD` and are excluded from occupancy inference/counts; no withheld value is reconstructed.

## Scope exclusions

This milestone does not add maps, routing, service-area rules, sale data, outreach, calling, SMS, email, postcards, sequences, CRM integrations, or scoring changes.
