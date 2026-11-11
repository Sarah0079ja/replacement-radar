# HVAC Replacement Radar — Scoring Review

**Run date:** November 2, 2026  
**Scope:** deterministic rerun against the aligned 5,000-property City of Dallas sample, with the 307 highest-ranked supported rows exported to the founder-testable app fixture.

## Quality-gate verdict

**CONDITIONAL PASS.** The revised ranking is materially more useful than the old ranking because explicit dated HVAC replacement/install evidence now drives the ranking and no-match properties no longer receive an artificial “likely old system” boost. The top 20 are all backed by historical HVAC-specific permit evidence.

This is not a conversion-lift proof. The strongest remaining limitation is permit-history depth: the sample’s latest old HVAC events are mostly 2018–2020, so the product can identify “last known event is aging” but cannot yet show many 15–20-year-old events. Contractor interviews and a larger historical permit source should validate whether this prioritization is commercially actionable before infrastructure work expands.

## Audit of the previous model

The previous score was additive:

| Factor | Weight | Source | Evidence type | Why it caused ties |
|---|---:|---|---|---|
| Property built before 2000 | +25 | DCAD `RESYRBLT` | Verified parcel field; used as an inference about property age | Most sampled homes were old, so this saturated quickly |
| Property built 2000–2009 | +15 | DCAD | Verified field / inference | Same broad bucket |
| Property built 2010–2015 | +7 | DCAD | Verified field / inference | Low differentiation |
| Single-family class | +10 | City parcel/DCAD class | Verified classification | Nearly every supported row had this |
| Older strong HVAC permit | +5/+15/+25 | Dallas OpenData description/date | Verified permit; event age is an inference | Too small relative to the property-age base |
| Recent HVAC permit | −20 | Dallas OpenData description/date | Verified permit | Only separated a subset |
| Ambiguous mechanical permit | +8 | Dallas OpenData description/date | Proxy | Could outrank some genuinely useful event records |
| No relevant permit found | +8 | Supported coverage + no address match | Absence-of-record inference, not proof | Made thousands of unknowns look like qualified prospects |
| Ownership duration | +0 | Unavailable | Unknown | No effect |
| Owner occupancy | +0 | Unavailable | Unknown | No effect |

The founder fixture showed the result directly: 126 of 307 rows scored 43 and 80 scored 40. The full sample was similarly compressed because old property age, single-family classification, and no-match points were common.

## Revised model

The revised model separates `evidence_confidence` from `opportunity_strength`.

| Component | Revised weight | Source | Type |
|---|---:|---|---|
| Explicit HVAC replacement event staleness | `15 + 3 × years since event`, capped at +66; −18 if under 5 years | Dated Dallas OpenData description classified as replacement | Verified event plus inferred staleness |
| HVAC installation event staleness | `12 + 2 × years since event`, capped at +54; −15 if under 5 years | Dated Dallas OpenData description classified as installation | Verified event plus inferred staleness |
| No newer HVAC replacement/install event after a 10+ year-old event | +8 | Supported permit history | Absence-of-newer-event inference only |
| Property age | +18 before 1970; +15 1970s; +12 1980s; +9 1990s; +6 2000s; +3 2010–2015 | DCAD `RESYRBLT` | Verified field used as an inference |
| Single-family residential | +5 | City parcel/DCAD class | Verified classification |
| HVAC event under 5 years old | −18 replacement / −15 installation | Dallas OpenData date | Verified recent event, negative opportunity signal |
| No HVAC event found | +0 | Supported coverage plus no event match | Unknown; explicitly not treated as “never replaced” |

Opportunity strength is deterministic: `STRONG` at 60+, `MEDIUM` at 35–59, and `WEAK` below 35. Evidence confidence is `HIGH` for an exact normalized address match with a dated HVAC event, `MEDIUM` for supported parcel/year data without a dated event, and `LOW` when key source fields are missing.

## Permit classification

The classifier now distinguishes:

- `HVAC REPLACEMENT`: replace, replacing, replacement, change-out, remove-and-replace language with HVAC terms.
- `HVAC INSTALLATION`: install/new HVAC/full-system language with HVAC terms.
- `HVAC REPAIR`: repair/service/troubleshoot/maintenance language with HVAC terms.
- `AMBIGUOUS HVAC SIGNAL`: HVAC terms without clear replacement/install language.
- `AMBIGUOUS MECHANICAL SIGNAL`: duct, ventilation, MEP, gas-test, or related terms without a clear HVAC event.
- `NON-HVAC MECHANICAL`: mechanical/refrigeration records without HVAC event language.
- `UNKNOWN`: missing or unclassifiable description.

The latest dated replacement/install event becomes `last_known_hvac_event_year` and `estimated_years_since_last_known_hvac_event`. This is historical permit evidence, not verified current equipment age.

## Full aligned sample results

- **Properties scored:** 5,000
- **Historical HVAC replacement/install evidence:** 623 (12.46%)
- **HVAC replacement:** 513
- **HVAC installation:** 110
- **Ambiguous HVAC:** 32
- **Ambiguous mechanical:** 14
- **Non-HVAC mechanical:** 108
- **No relevant HVAC event found:** 4,223
- **Opportunity strength:** 18 Strong, 399 Medium, 4,583 Weak
- **Evidence confidence:** 623 High, 4,362 Medium, 15 Low
- **Score range:** 0–62
- **Most common scores:** 23 (992), 20 (2,570), 17 (625), 62 (18), 59 (83), 56 (101), 53 (89)

The no-event population is now mainly 20–23 rather than 40+, which makes it visibly weaker than event-backed records. This is intentional: missing permit history remains unknown.

## 307-row app fixture

The app fixture is the first 307 rows of the sorted scored output, not the entire 5,000-property universe. It contains 307 event-backed rows by construction because it is the ranked founder-test slice:

- 18 Strong, 289 Medium, 0 Weak
- 307 High evidence-confidence rows
- 302 HVAC replacement and 5 HVAC installation records
- Scores: 62 (18), 59 (83), 56 (101), 53 (89), 51 (7), 50 (9)

## Top 20

All top 20 have actual historical HVAC-specific evidence and exact normalized address joins.

1. **7232 OAKBLUFF DR** — 62, Strong, High; replacement permit in 2018; 8 years since known event; built 1963.
2. **6546 MEADOWCREEK DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1968.
3. **7653 INDIAN SPRINGS RD** — 62, Strong, High; replacement permit in 2018; 8 years; built 1964.
4. **7647 ROLLING ACRES DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1964.
5. **7911 WOODSTONE LN** — 62, Strong, High; replacement permit in 2018; 8 years; built 1965.
6. **7430 TANGLEGLEN CIR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
7. **7414 CHATTINGTON DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1967.
8. **6932 QUARTERWAY DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
9. **15741 REGAL HILL CIR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
10. **15725 HAVENROCK CIR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
11. **7447 HEATHERMORE DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
12. **7706 LA VERDURA DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1968.
13. **7720 EL PASTEL DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1968.
14. **7637 LA SOBRINA DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
15. **7823 LA MANGA DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1968.
16. **7850 LA CABEZA DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
17. **7835 QUERIDA LN** — 62, Strong, High; replacement permit in 2018; 8 years; built 1969.
18. **7888 ALTO CARO DR** — 62, Strong, High; replacement permit in 2018; 8 years; built 1967.
19. **523 LACEWOOD DR** — 59, Medium, High; replacement permit in 2019; 7 years; built 1950.
20. **953 RYAN CIR** — 59, Medium, High; replacement permit in 2019; 7 years; built 1953.

## Interpretation and next test

The revised top 20 is materially more commercially understandable than random residential targeting because every top opportunity has a dated, address-matched HVAC replacement record plus an older-property context. However, the top 20 still contains many ties because the public permit history has a narrow observed event-year range and the parcel sample is residentially homogeneous.

The next validation should be contractor review of these event-backed records and a comparison against a random sample. Infrastructure should not proceed on the assumption that the ranking has proven conversion lift.
