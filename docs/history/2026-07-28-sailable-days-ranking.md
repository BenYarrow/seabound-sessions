---
title: Sailable-days ranking on /destinations
tags: [destinations, weather, ranking, frontend]
status: stable
completed: 2026-07-28
commits: [f291f7d, 2f5f0ba, 806848f, fc1a797, bbd7578, b5dd8b3, edeed66, cf0591d, 6763538, f923f2f, 13ae14b, 47a8dc1, 1b1d987, 76847e9, 4883ec3, 9c34e29]
pr: 39
---

# Sailable-days ranking on /destinations

`/destinations` no longer ranks spots by a monthly average — it now ranks them by the **typical number of "sailable days"** a spot gets in a chosen month, for a user-set minimum wind speed. A "sailable day" = at least 2 hours within the 9am–7pm sailing window blowing at or above the minimum, which is exactly equivalent to "the day's 2nd-highest hour ≥ minimum" — so one stored number per day answers the sailable test for *any* minimum, with no recomputation.

## What shipped

- **New daily data layer:** `spot_sailable_days` (one row per spot per day, `App\Models\SailableDay`, `SpotGuide::sailableDays()` hasMany), populated by `WeatherFetcher` in the same pass as the existing monthly `weather_records` — no new fetch path, no new operational job. Backfills the next time `weather:fetch` / the auto-create job / the admin "Fetch all" widget runs.
- **`DestinationController@index`** now ships `sailableDays` (pooled daily qualifying values, keyed by title then month, no per-year split) and `climate` (a cross-year-averaged "typical year" of 12 months, keyed by title) — replacing the old per-year `weatherData` prop. The dead server-side `sortByGustiestThisMonth` re-order call was removed from the controller (the method itself is kept — `SpotGuideController` still uses it for the related-guides slider).
- **Client-side ranking helpers** (`resources/js/Helpers/sailableDays.ts`): unit conversion (kts/mph/kph) with unit-switch snapping to the nearest 5-step option, `sailableDaysInMonth()` (the coverage-normalised rate), and `rankSpots()` (month-desc, peak-month tie-break, then alphabetical — deterministic so shared links reproduce an identical order).
- **URL-synced filter state** (`resources/js/Helpers/destinationFilters.ts`): Month / Group-by (continent·country·global) / Spots / Unit / Min all live in the query string, mirrored via `window.history.replaceState` (no Inertia round-trip — all ranking data is already in the browser). Spots are serialised as **slugs**, not titles (titles contain commas/spaces).
- **New filter bar** (`DestinationFilterBar.tsx`) and a reworked `Pages/Destinations/Index.tsx` with three layouts (continent-grouped, country-grouped, flat global), each rank-sorted, groups ordered by their best spot. **Dataless spots stay visible** at rank 0 (zero-day spots and spots with no fetched weather at all both sink to the bottom rather than disappearing) — the ranking universe is every published spot, not just those with weather data.
- **New "sailable days per month" chart** (`SailableDaysChart.tsx`, grouped bar) plus the retained wind/temperature line charts, now redrawn from the typical-year `climate` shape (`climate.ts` helper) instead of per-year `weatherData`. The charts' own unit radios were removed — the filter bar is now the single unit control; the wind chart's gust/wind toggle became local chart state. `SelectOption` moved out of the deleted `FilterDataset.tsx` into `resources/js/Helpers/selectTypes.ts`.

## Key design decisions

- **2nd-highest-hour encoding:** storing only the day's 2nd-highest sailing-window hour (rather than all 11 hourly readings) is sufficient to answer "≥2 hours ≥ X" for any X, and keeps the payload small.
- **Coverage-normalised typical-days formula:** `typicalDays = (qualifyingCount ÷ heldDayCount) × daysInMonth`. The fetch window is rolling (~3 years), so a month's boundary years are only partially covered — and the current month (the default selection) is *always* a partial boundary. Dividing by a year count would undercount by nearly half; normalising by held days instead gives a climatological estimate that's robust to partial boundary months. February is fixed at 28 days — the sub-day leap-year error is immaterial here.
- **Client-side compute:** all threshold counting and ranking happens in the browser so dragging the minimum reorders the page instantly, with the server shipping pooled data once per load.
- **URL slugs + `history.replaceState`:** spots serialise as slugs (not titles) for safe comma-joining; every filter change is mirrored to the URL without a server round-trip, so a shared link reproduces an identical ranked view.
- **Dataless-visible:** a spot with no `spot_sailable_days` rows (never fetched) ranks 0 and stays in the grid, per the same "zero-day spots stay visible" rule applied to spots that simply don't qualify at the chosen minimum.
- **Gust-vs-sustained correction (post-build, owner feedback):** the spec originally chose **sustained** wind for the sailable test (`docs/superpowers/specs/2026-07-28-sailable-days-ranking-design.md`, since annotated). After building, Karpathos's June reading showed only ~1 sailable day at 20kts sustained — implausible, since the Aegean meltemi blows there almost daily in summer. Open-Meteo's sustained 10m wind under-reads thermal/venturi spots (~14kt logged) while gusts (~28kt) tracked what a windsurfer actually feels. The ranking metric was switched to **gust-based** (`qualifying_gust_kts`, added via a follow-up migration + `WeatherFetcher` change); the sustained column (`qualifying_wind_kts`) is retained for a possible future sustained/gust UI toggle. The client ranking code is metric-agnostic — no front-end change was needed for the switch.

## The chunk-boundary dedup gotcha

`WeatherFetcher` fetches Open-Meteo's archive in multi-month chunks. Task 2 found that chunk-seam days were being `array_merge`d twice, double-counting their hourly readings (monthly averages happened to be invariant to this, but the daily 2nd-highest-hour calculation was not — a regression test went from a wrongly-computed 25.0 to the correct 15.0 once fixed). Fix: dedup hourly readings by exact timestamp at the bucketing step. A theoretical residual edge case was noted and accepted: the dedup keeps the *first* occurrence of a duplicated timestamp, so if a real boundary hour were null in the first chunk and valued in the second, the null would win — no evidence this occurs in practice.

## Test plan

PHP 253 pass (PHPUnit, in-memory SQLite, all external HTTP mocked), JS 28 pass (Vitest, Node 22), `npm run build` clean. Migrations run and `php artisan weather:fetch` re-run on the real Postgres dev DB, backfilling **8,776** `spot_sailable_days` rows across 8 spots; `/destinations` verified HTTP 200 on Postgres with the new `sailableDays` + `climate` props present and `weatherData` gone, clean log. Whole-branch review (Opus): ready to merge, no Critical/Important findings; two minors were fixed post-review (all-stale-slug shared link now falls back to all spots instead of a blank page; off-grid `min` in the URL now clamps to the default instead of drifting from the dropdown).

## Deferred to the owner

A live-browser visual/interaction pass (light + dark theme, mobile/tablet/desktop, live drag-the-minimum reordering, sticky filter-bar behaviour) is still owed — the local `.test` Herd host blocks automated browser control in this environment, so only DOM/build/test verification was done during the build.

## Prod follow-up

`spot_sailable_days` ships **empty** — it only fills in on the next weather fetch. After deploy, run `php artisan weather:fetch` (or the admin "Fetch all weather" button) once to backfill history for existing spots, same as any other `WeatherFetcher` change.

## Accepted follow-up minors (non-blocking, from per-task review)

- `climate` map's mph/kph/gust fields are untested (existing brief gap); `test_index_keeps_alphabetical_order_regardless_of_which_year_has_data` is tautological and can't distinguish old vs new ordering.
- `allTitles`/`destinationOptions` in `Index.tsx` aren't memoised (so the `colours` memo never actually hits); `peak()` is recomputed inside the rank sort comparator (O(n) × O(n log n), immaterial at current scale); `WindUnit` type lacks JSDoc; `statFor()` does an O(n²) linear find per card at scale.
- The chart x-axis month set is now derived from the *active* spots' coverage only (was all-destinations before) — by design, but means months can drop off the axis if the active selection lacks them.
- T2 dedup-first-occurrence theoretical edge case (see above) — no evidence it occurs.
