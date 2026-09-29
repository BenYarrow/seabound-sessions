---
title: Feedback round — destinations filters and charts, map scroll guard, rainfall
tags: [feedback, destinations, charts, maps, weather, rainfall, open-meteo, frontend]
status: in-progress
completed:
commits: [0f47671, 831b524, e280401, 5c7bd6c]
pr: 47
---

# Feedback round: destinations filters and charts, map scroll guard, rainfall

> **Awaiting owner verification.** Everything here is user-visible, so it stays `in-progress` until Ben has
> looked at the real pages. The browser checks below were DOM and measurement checks in the headless
> preview, which doesn't paint after a scroll (see project memory). See the checklist at the end.

Ben's 2026-09-29 feedback list, worked through on one branch, plus two things it raised: rainfall data
and consistent chart headings.

## What shipped

**Small fixes**
- Nav and footer: "About Us" is now "About".
- Footer: removed the comma after "local knowledge". The "Get in touch" text now uses the same size and
  opacity as the brand paragraph (`text-sm`, `text-white/45`).
- Contact page: the intro and the help-topic list are now `text-base` with more contrast.
- Homepage infographic: the five circles share one row from `lg` up and shrink to fit (`lg:flex-nowrap`,
  `lg:flex-1`). On `lg` the label steps down one size so "Restaurants" fits. Measured in one row at both
  1024px and 1440px.
- Related-guides slider: loops when there are 3 or more guides. With exactly 2 it stays linear and the
  end arrow greys out, via `swiper-button-disabled` styling.

**Maps**
- `Components/Map/ClickToInteract`: a transparent overlay stops scroll-wheel and touch gestures reaching
  the map until the visitor clicks it. Leaving the map with the mouse, or tapping outside it, locks it
  again (touch screens never fire `mouseleave`). It is on both the destinations and the spot-guide maps.
- The destinations globe has zoom limits: `minZoom` 1, `maxZoom` 10.
- `Components/Map/mapTheme` holds the shared `light-v11` basemap and the pale-atmosphere fog. The
  spot-guide map moved from `dark-v11` to this light style.

**Destinations page**
- The intro explains the ranking (average windy days per month, 2+ daylight hours at the chosen minimum)
  and what each filter does.
- Reset button in the filter bar: `defaultFilters()` and `hasActiveFilters()` in `destinationFilters.ts`,
  covered by tests. It is disabled when the filters are already at their defaults.
- Section spacing is uniform (`pt/pb-14 lg:16`). A top border separates the card listing from the
  Wind & Weather Data section.
- Charts: a "Compare by Spot / Country / Continent" control, using the `chartGrouping.ts` helper
  (`groupRankedSpots`, `groupClimate`, both tested).
  - **Design call:** grouping sits *downstream* of the page filters. A country's or continent's line is
    the mean of the spots currently in view (after the spot selection and min-temp filters), not of
    every spot we hold.
  - Group colours are seeded from all spots, so a group keeps its colour while filtering.
  - It is page-only state, not in the URL (a follow-up for that is in TODO).

**Rainfall**
- `WeatherFetcher` now requests hourly `precipitation` in the same Open-Meteo archive call.
- `weather_records` gains two nullable columns:
  - `rain_mm`: the whole-day monthly total.
  - `wet_days`: days with at least `WeatherFetcher::WET_DAY_SAILING_MM` (3 mm) falling between 9am and 7pm.
- Null means "not fetched yet", never "dry":
  - `DestinationController` averages only the years that have rain data.
  - The cards leave rain off rather than printing "0 wet days".
  - The charts hide until at least one value exists.
- Shown in three places:
  - Destination cards: "· N wet days".
  - A Wet Days chart on `/destinations`. `AllDestinationsTempChart` was generalised into
    `ClimateLineChart`, which draws both the temperature and wet-days charts.
  - A Wet Days bar chart on the spot-guide statistics.
- Rain never affects the wind ranking, the same rule as temperature.

**Chart headings**
- `Components/Common/ChartHeading` is now the single title and subtitle style for every chart card, on
  both the destinations and spot-guide pages: display-font title, `text-sm` subtitle.
- Subtitles follow one pattern ("…, by spot/country/continent").

## Findings worth keeping

- **Wet-day threshold: 3 mm in sailing hours, chosen from the data.**
  - The first cut used the meteorological 1 mm rain day. Ben pushed back: 1 mm is a passing shower, and
    it made the tropics look permanently wet.
  - Five definitions were compared over 3 years of hourly data for all 7 published spots.
  - The 1 mm rule gave Le Morne about 24 wet days in January and about 15 in its May dry season. That is
    partly reanalysis drizzle.
  - 3 mm between 9am and 7pm gives Le Morne about 14 in January and 2–3 in its dry season, Vassiliki
    about 10 in November, Langebaan about 4 in July, and roughly 0 at the desert spots.
  - It uses the same window as the wind ranking, so overnight rain no longer counts.
  - Tune the constant if it reads wrong in the field.
- **Why wet days rather than dry days.** Ben asked about showing dry days instead. Almost every spot has
  27–30 dry days most months, so a dry-days chart would be seven lines bunched at the top. Counting the
  bad days shows the differences.
- **Le Morne: May vs September.**
  - The wind ranking already favoured September (about 13.3 vs 11.3 sailable days at 20 kts).
  - The monthly-averages chart made May look better because May 2024 was an outlier (13 kts mean
    against 7–9 kts in the other years), and that chart gives each year equal weight.
  - Rain backs September too: about 2 wet days vs about 3 in May.
- **Karpathos's "stormy winter" is wind, not rain.** It has only 1–2 wet days a month in January and
  February. Its gusty storm days are already handled by the wind ranking's sustained-wind floor. Rain
  data can't show storms; a weather-code signal would be a separate follow-up.
- **One fetch failure shows the null path working.** Langebaan's first re-fetch hit an API error. Its
  old rows had no rain, and the card correctly left rain off until a retry succeeded.
- **The new rainfall migration was edited in place.** It was unmerged and had only run on the local DB,
  which was rolled back and re-run. The column was renamed from `rainy_days` to `wet_days` when the
  metric changed.

## Test plan

- PHP (331 tests, all passing):
  - `WeatherFetcherRainfallTest`: requests precipitation; monthly total plus the wet-day count
    (inclusive threshold, overnight rain excluded); null when no precipitation data.
  - Payload tests in `DestinationSailablePayloadTest` (averages known years only, null when none) and
    `SpotGuideControllerTest`.
- JS (Vitest, 50 tests, all passing): `chartGrouping`, `destinationFilters` reset helpers, and
  `climateWetDaysForMonth`.
- `npm run build`: clean.
- Local run on Herd:
  - Re-fetched all 7 published spots from Open-Meteo.
  - Checked in the browser: grouping gives 7 spots → 2 continents / 6 countries; Reset goes back to the
    defaults and disables itself; the map overlay clears on click; the infographic stays in one row at
    1024px and 1440px; the four destinations chart headings measure the same (30.7px title, 14px
    subtitle); wet days appear on the cards and charts.

## Follow-ups

- **Production needs a full `php artisan weather:fetch` on Laravel Cloud** before rain shows. The same
  run also corrects the partial-month climate averages (see `docs/TODO.md`).
- Optional: put the chart grouping in the URL; a storm / weather-code signal.

## Owner verification checklist

- [ ] `/destinations`: intro copy, Reset button, spacing and the section border, Compare-by control,
  Wet Days chart and card wording, map click-to-explore overlay and zoom limits (desktop and a phone).
- [ ] A spot guide (e.g. `/destinations/le-morne`): the map is light and needs a click before it
  scrolls; the Wet Days chart and chart headings; the related-guides slider loops.
- [ ] Homepage infographic is in one row on desktop; footer and contact text sizes read right.
