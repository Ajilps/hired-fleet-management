# Travel-time estimation

**Updated:** 10 October 2026. The owner selected a distance-based rough estimate for the initial build, without a Google Maps or other routing integration. The calculation and data shapes below are draft implementation contracts; no estimator exists yet.

Keep the PRD's maps-based B-04 feature tracked as later P1 work. A heuristic is a temporary approach, not evidence that maps-based estimation has been delivered. See DEC-31/32 in the [decision log](decision-log.md) and [requirements traceability](requirements-traceability.md).

## 1. Initial behavior

1. Partner or admin may supply road distance in kilometres when entering an order. It is optional and manually supplied, not automatically measured.
2. The backend calculates a rough duration using a configured average speed and policy version.
3. An admin can override the duration in minutes. That override always takes precedence.
4. If distance or a valid policy is unavailable, show **Estimate unavailable** unless there is an admin override. Order entry can still succeed.

Do not invent distance from address text or silently use straight-line distance as road kilometres. The initial build needs no map display, address autocomplete, geocoder, routing key or paid maps account. Coordinates remain optional existing inputs; they do not trigger automatic distance calculation.

## 2. Calculation and labels

```text
rough duration in minutes = ceil(road distance in km × 60 / average speed in km/h)
```

Use exact decimal arithmetic and round upward to a whole minute. For example, 20.00 km at an illustrative 30.00 km/h produces 40 minutes. **30 km/h is an example, not an approved default.**

Choose and validate speed assumptions, maximum input/duration limits and policy versions under DEC-32 before implementation acceptance. Missing/invalid server policy must produce unavailable status and an operational alert, not a hard-coded guessed speed. A result outside the supported integer duration range is unavailable, not clipped or wrapped.

| Effective source | Required UI wording |
| --- | --- |
| `distance_heuristic` | Rough estimate — based on supplied road distance, without traffic |
| `admin_override` | Admin estimate |
| `maps` | Provider estimate; distinguish traffic-aware versus basic when a provider is added |
| `null` | Estimate unavailable |

This is duration, not a promise of arrival. If displaying an arrival time, add the effective duration to the scheduled pickup or actual start and label that basis. Do not show a moving live arrival estimate without the needed tracking. Do not use heuristic values for automatic lateness penalties or success classification; DEC-19 must explicitly define any reporting use.

## 3. Input and stored evidence

Use positive fixed-two-decimal strings for distance/speed in JSON. The initial client supplies only `routeDistanceKm`, for example `"20.00"`; it cannot choose the server speed, source, policy version or calculated duration. Missing/null distance means unknown; zero/negative/nondecimal supplied values fail validation.

The draft [OpenAPI contract](api/openapi.yaml) adds optional intake/read distance and a heuristic basis to estimates. Existing admin override endpoints remain unchanged. There is no new public calculator or distance-edit endpoint. In this first design, correct a mistaken duration through the admin override; a separate distance-edit workflow would need its own contract.

| Database field on orders/trips | Meaning |
| --- | --- |
| `route_distance_km` | Manually supplied road kilometres; nullable positive `numeric(10,2)` |
| `estimated_duration_minutes` | Stored automatic duration; now supports heuristic or later maps results |
| `estimated_duration_source` | Automatic source: `distance_heuristic`, `maps` or NULL |
| `estimate_average_speed_kmh` | Speed used for a heuristic, positive `numeric(6,2)`; NULL for maps/unavailable |
| `estimate_policy_version` | Nonblank version of the heuristic configuration; NULL for maps/unavailable |
| `eta_source` | Effective source after applying the existing admin override |
| Existing ETA timestamps/admin fields | Calculation/change time and current override actor |

The separate automatic source preserves the original basis while an admin override is active. Clearing the override returns the stored automatic estimate, or unavailable. An override with no automatic estimate is valid.

The effective estimate includes `heuristic` evidence only when its source is `distance_heuristic`: supplied distance, applied speed and policy version. Other sources omit it or use NULL. The backend, not the caller, creates this evidence.

## 4. Lifecycle and frozen history

Calculate at intake when the inputs/policy are available. Copy distance, automatic estimate/basis, override and timestamps into the trip on acceptance. The accepted trip becomes authoritative. Configuration changes do not silently recalculate existing orders/trips; a future refresh action needs a reviewed contract and must preserve an admin override.

At closure, freeze the effective duration/source and any effective heuristic basis into the report. Do not recalculate historical reports when speed settings or providers change. Estimation never changes trip price, commission, expenses or wallet credits.

The version-1 report schema remains a preimplementation draft. It now allows the new source and its required evidence; old valid maps/admin/unavailable snapshots remain valid. API contract version advances to `0.2.0-draft`. Consumers must handle the expanded source enum; do not assume a strict older generated client is compatible. If version 1 is deployed before later changes, use the agreed report-version migration process rather than rewriting frozen data.

## 5. Add routing providers later

Keep one estimate service with adapters behind it. The initial adapter is the local heuristic. Later, configure a primary routing provider and an approved fallback order:

**Admin override → configured routing provider(s) → heuristic with usable supplied distance → unavailable.**

The interface normalizes duration units, travel mode, departure-time/traffic basis, calculation time and source. Provider switching must not require separate logic in React/Flutter. Do not introduce traffic-aware claims or silently downgrade to a basic result.

Before enabling a provider, agree timeouts, a total request deadline, retryable failures, quota/cost limits, provider metadata and storage/attribution rules under DEC-02/32. Extend the draft schema for any additional provenance fields then. Do not repeatedly call every provider on each screen refresh. Google restricts storage/caching of most routing content; check the [Routes policy](https://developers.google.com/maps/documentation/routes/policies) before persisting or caching its results.

No external provider is enabled or required for the initial build. Redis is optional acceleration for this calculation, not a source of truth; an inexpensive local formula may not need caching at all. Any cached heuristic must include distance and policy version in its key and obey company/access boundaries.

## 6. Acceptance checks

QA-07 in [testing strategy](testing-strategy.md#3-acceptance-cases) covers:

- Positive distance and configured speed produce a correctly rounded rough duration and evidence.
- Missing distance/policy, zero/negative input, overflow and no provider are handled explicitly.
- Client attempts to set speed/source/duration are rejected by intake DTO validation.
- Admin override wins; clearing it restores the stored basis or unavailable.
- Acceptance copies the evidence; closure freezes it; later policy changes leave history unchanged.
- React/Flutter show the correct source label and never claim traffic awareness for a heuristic.
- No maps requests/keys are needed; future provider failures use only approved fallbacks.

These are planned application tests. API/schema/example validation checks the draft documentation, not travel-time accuracy in production.
