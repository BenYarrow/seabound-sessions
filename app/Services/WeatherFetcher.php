<?php

// Shared Open-Meteo fetch service. Pulls 3 years of hourly archive data for a
// spot guide, reduces it to monthly averages (temperature / wind / gust) over
// the 9am–7pm sailing window plus rainfall (whole-day monthly mm + sailing-hours wet days), and writes WeatherRecord rows for only the
// complete, fully-elapsed calendar months — a spot's climate rows are deleted
// and reinserted wholesale on each fetch (not upserted), which is what lets a
// stale or out-of-window row self-heal on the next run. Single source of
// truth for the weekly weather:fetch command and the FetchSpotWeather /
// FetchAllWeather queued jobs — none of them re-implement the fetch.

namespace App\Services;

use App\Models\SailableDay;
use App\Models\SpotGuide;
use App\Models\WeatherRecord;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

class WeatherFetcher
{
    /**
     * Rain (mm) falling within the 9am–7pm sailing window that makes a day
     * "wet" — enough to spoil it, not a passing shower. Chosen over the 1 mm
     * meteorological rain day, which counted drizzle and the reanalysis's
     * light tropical rain so generously that Le Morne read ~24 wet days in
     * January (3 mm in-window gives ~14, and ~2 in its dry season).
     */
    public const WET_DAY_SAILING_MM = 3.0;

    /**
     * Fetch and aggregate monthly weather averages for one spot, then replace
     * its WeatherRecord rows wholesale (delete all, then insert) inside a
     * transaction. Only a complete, fully-elapsed calendar month becomes a
     * climate row — the /destinations charts average year-rows with equal
     * weight, so a partial month must never be written. Replacing rather
     * than upserting is what makes a stale row (one that has fallen out of
     * the rolling 3-year window and will never be re-fetched) self-heal on
     * the next run instead of voting in the cross-year average forever. The
     * daily sailable-days layer written at the end of this method is
     * deliberately different: it is coverage-normalised and correctly keeps
     * partial months, so it is upserted per day, not replaced.
     *
     * Splits the 3-year range into 3-month windows because a single large
     * request to the archive API intermittently 500s; pauses between windows
     * (via the fakeable Sleep helper) to stay within Open-Meteo rate limits.
     */
    public function fetchForSpot(SpotGuide $spot): void
    {
        $times = [];
        $temps = [];
        $winds = [];
        $gusts = [];
        $precipitation = [];

        // Start on a month boundary so the OLDEST month in range is complete.
        // A mid-month start wrote a stub row (e.g. 4 days of July 2023) which
        // the /destinations charts then weighted equally with a full 31-day
        // month, because the cross-year average in DestinationController is a
        // plain mean over year-rows. Snapping back to the 1st gains data
        // rather than discarding it.
        $startOfRange = now()->subYears(3)->startOfMonth();
        $endOfRange = now();
        $chunkStart = $startOfRange->copy();
        $isFirstChunk = true;

        while ($chunkStart->lt($endOfRange)) {
            $chunkEnd = $chunkStart->copy()->addMonths(3);
            if ($chunkEnd->gt($endOfRange)) {
                $chunkEnd = $endOfRange->copy();
            }

            if (! $isFirstChunk) {
                Sleep::for(1)->second();
            }
            $isFirstChunk = false;

            $response = Http::get('https://archive-api.open-meteo.com/v1/archive', [
                'latitude' => $spot->latitude,
                'longitude' => $spot->longitude,
                'start_date' => $chunkStart->format('Y-m-d'),
                'end_date' => $chunkEnd->format('Y-m-d'),
                'hourly' => 'temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation',
                'wind_speed_unit' => 'kn',
                'timezone' => 'auto',
            ]);

            if (! $response->successful()) {
                throw new \RuntimeException("API error: {$response->status()} for {$chunkStart->format('Y-m-d')} to {$chunkEnd->format('Y-m-d')}");
            }

            $hourlyData = $response->json()['hourly'] ?? [];
            $times = array_merge($times, $hourlyData['time'] ?? []);
            $temps = array_merge($temps, $hourlyData['temperature_2m'] ?? []);
            $winds = array_merge($winds, $hourlyData['wind_speed_10m'] ?? []);
            $gusts = array_merge($gusts, $hourlyData['wind_gusts_10m'] ?? []);
            // Pad to the chunk's time count so a response without precipitation
            // can't shift later chunks' readings onto the wrong timestamps.
            $precipitation = array_merge($precipitation, array_pad($hourlyData['precipitation'] ?? [], count($hourlyData['time'] ?? []), null));

            $chunkStart = $chunkEnd->copy();
        }

        // Daily buckets, restricted to the 9am–7pm sailing window.
        //
        // Chunk seams share a boundary day: $chunkStart re-uses the previous
        // chunk's $chunkEnd, and Open-Meteo's date range is inclusive, so that
        // day's hourly readings come back from BOTH requests and land twice in
        // $times/$winds/etc via array_merge. Monthly averages are invariant to
        // an exact duplicate, but the daily 2nd-highest order-statistic is not
        // (two copies of the max would wrongly outrank the true 2nd-highest) —
        // so de-dup by the exact timestamp string here, keeping the first
        // occurrence, before any bucketing happens.
        $seenTimestamps = [];
        $dailyMap = [];
        $dailyRain = [];
        foreach ($times as $index => $datetime) {
            if (isset($seenTimestamps[$datetime])) {
                continue;
            }
            $seenTimestamps[$datetime] = true;

            $hour = (int) substr($datetime, 11, 2);

            // Rain is bucketed BEFORE the sailing-window filter below, keeping two
            // totals: the whole day (feeds the month's mm, the usual climate
            // figure) and the 9am–7pm window (decides a wet day — overnight rain
            // doesn't spoil a session, rain while you'd be on the water does).
            if (isset($precipitation[$index]) && $precipitation[$index] !== null) {
                $rainDate = substr($datetime, 0, 10);
                $dailyRain[$rainDate] ??= ['total' => 0.0, 'sailing' => 0.0];
                $dailyRain[$rainDate]['total'] += $precipitation[$index];
                if ($hour >= 9 && $hour <= 19) {
                    $dailyRain[$rainDate]['sailing'] += $precipitation[$index];
                }
            }

            if ($hour < 9 || $hour > 19) {
                continue;
            }

            $date = substr($datetime, 0, 10);
            if (! isset($dailyMap[$date])) {
                $dailyMap[$date] = ['temps' => [], 'winds' => [], 'gusts' => []];
            }
            if (isset($temps[$index]) && $temps[$index] !== null) {
                $dailyMap[$date]['temps'][] = $temps[$index];
            }
            if (isset($winds[$index]) && $winds[$index] !== null) {
                $dailyMap[$date]['winds'][] = $winds[$index];
            }
            if (isset($gusts[$index]) && $gusts[$index] !== null) {
                $dailyMap[$date]['gusts'][] = $gusts[$index];
            }
        }

        $average = fn (array $values): float => count($values) > 0 ? array_sum($values) / count($values) : 0.0;

        // Roll daily buckets up into year/month buckets.
        $yearMonthMap = [];
        foreach ($dailyMap as $date => $values) {
            [$year, $monthNumber] = explode('-', $date);
            $key = "{$year}-{$monthNumber}";
            if (! isset($yearMonthMap[$key])) {
                $yearMonthMap[$key] = ['year' => (int) $year, 'month' => (int) $monthNumber, 'days' => 0, 'temps' => [], 'winds' => [], 'gusts' => [], 'rain' => []];
            }
            $yearMonthMap[$key]['days']++;
            if (isset($dailyRain[$date])) {
                $yearMonthMap[$key]['rain'][] = $dailyRain[$date];
            }
            // Only contribute a metric the day actually has readings for.
            // $average returns 0.0 for an empty array, and pushing that would
            // silently drag the month's mean toward zero whenever Open-Meteo
            // returns nulls for one metric but not the others.
            if ($values['temps'] !== []) {
                $yearMonthMap[$key]['temps'][] = $average($values['temps']);
            }
            if ($values['winds'] !== []) {
                $yearMonthMap[$key]['winds'][] = $average($values['winds']);
            }
            if ($values['gusts'] !== []) {
                $yearMonthMap[$key]['gusts'][] = $average($values['gusts']);
            }
        }

        // A climate row must represent a COMPLETE calendar month: the charts
        // average year-rows with equal weight, so a partial month would count
        // as much as a full one — a 4-day stub of July 2023 was inflating
        // Langebaan's typical July by ~8%.
        //
        // Completeness is tested by counting the days we actually received,
        // not by the date range: Open-Meteo's archive lags real time by a few
        // days, so a month can sit inside the window and still be missing its
        // tail. A month that falls short is simply skipped and picked up by a
        // later fetch — for climatology, omitting a month beats averaging a
        // partial one.
        //
        // (The daily sailable layer below deliberately keeps partial months —
        // it is coverage-normalised and handles them correctly.)
        $now = now();
        $currentMonthStart = now()->startOfMonth();

        $climateRows = [];
        foreach ($yearMonthMap as $row) {
            $monthStart = Carbon::create($row['year'], $row['month'], 1);

            // The month must have ELAPSED. Day-count completeness alone is not
            // enough: Open-Meteo forecast-fills the current day, so on the last
            // day of a month every day is present and the month would qualify
            // on forecast values rather than observations.
            if ($monthStart->gte($currentMonthStart)) {
                continue;
            }

            if ($row['days'] < $monthStart->daysInMonth) {
                continue;
            }

            // A metric absent for EVERY day of the month would otherwise be
            // written as $average([]) = 0.0. Because rows are now replaced
            // wholesale, that fabricated zero would become the authoritative
            // value rather than one vote among years. Omitting the month is
            // the same choice made for partial months above: no row beats a
            // wrong row.
            if ($row['temps'] === [] || $row['winds'] === [] || $row['gusts'] === []) {
                continue;
            }

            $ktsWind = round($average($row['winds']), 1);
            $ktsGust = round($average($row['gusts']), 1);

            // Rain is additive: a month with no precipitation readings keeps its
            // wind/temp row and stores null ("not fetched"), never a fabricated
            // 0 mm. A wet day is WET_DAY_SAILING_MM+ within sailing hours.
            $hasRain = $row['rain'] !== [];
            $rainMm = $hasRain ? round(array_sum(array_column($row['rain'], 'total')), 1) : null;
            $wetDays = $hasRain ? count(array_filter($row['rain'], fn (array $day) => $day['sailing'] >= self::WET_DAY_SAILING_MM)) : null;

            $climateRows[] = [
                'spot_guide_id' => $spot->id,
                'year' => $row['year'],
                'month' => $row['month'],
                'avg_temp' => round($average($row['temps']), 1),
                'kts_wind' => $ktsWind,
                'kts_gust' => $ktsGust,
                'mph_wind' => (int) round($ktsWind * 1.15078),
                'mph_gust' => (int) round($ktsGust * 1.15078),
                'kph_wind' => (int) round($ktsWind * 1.852),
                'kph_gust' => (int) round($ktsGust * 1.852),
                'rain_mm' => $rainMm,
                'wet_days' => $wetDays,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        // Replace rather than merge. Rows that have fallen out of the rolling
        // window are never re-fetched, so updateOrCreate can never correct a
        // stale or partial one — it would vote in the cross-year average
        // forever. Replacing makes a single re-fetch self-healing, which is
        // why this needs no data migration. Guarded by the collect-then-write
        // order above: a failed API call throws before we reach here, so a
        // failure can never leave a spot with no climate data.
        if ($climateRows !== []) {
            DB::transaction(function () use ($spot, $climateRows) {
                WeatherRecord::where('spot_guide_id', $spot->id)->delete();
                WeatherRecord::insert($climateRows);
            });
        }

        // Persist the daily sailable-wind layer from the same 9am-7pm buckets.
        // Both qualifying_wind_kts (sustained) and qualifying_gust_kts (gust) are
        // the day's 2nd-highest hour of that metric, because "sailable" means
        // >= 2 hours at/above the user's minimum, i.e. the 2nd hour (when values
        // are sorted high-to-low) already clears it. A day with fewer than 2
        // in-window readings can never be sailable, so it scores 0.
        //
        // The sailable-day RANKING uses qualifying_gust_kts, not sustained wind:
        // real-world validation at meltemi/thermal spots (e.g. Karpathos) showed
        // Open-Meteo's sustained 10m wind under-reads the felt wind there, while
        // gusts track what sailors actually ride. Sustained wind is still stored
        // for a possible future toggle.
        foreach ($dailyMap as $date => $values) {
            $dailyWinds = $values['winds'];
            rsort($dailyWinds); // highest first
            $secondHighestWind = count($dailyWinds) >= 2 ? $dailyWinds[1] : 0.0;

            $dailyGusts = $values['gusts'];
            rsort($dailyGusts); // highest first
            $secondHighestGust = count($dailyGusts) >= 2 ? $dailyGusts[1] : 0.0;

            [$year, $monthNumber] = explode('-', $date);

            SailableDay::updateOrCreate(
                ['spot_guide_id' => $spot->id, 'date' => $date],
                [
                    'year' => (int) $year,
                    'month' => (int) $monthNumber,
                    'qualifying_wind_kts' => round($secondHighestWind, 1),
                    'qualifying_gust_kts' => round($secondHighestGust, 1),
                ]
            );
        }
    }

    /**
     * Fetch weather for many spots, paced in batches of 3 with a 2-second gap
     * between batches (Open-Meteo rate-limit protection). Each spot is fetched
     * inside a try/catch so one failure never aborts the batch. Optionally
     * reports per-spot progress. Returns the number of spots fetched OK.
     *
     * @param  iterable<SpotGuide>  $spots
     * @param  (callable(SpotGuide, bool, ?string): void)|null  $reporter
     */
    public function fetchForSpots(iterable $spots, ?callable $reporter = null): int
    {
        $processed = 0;

        foreach (collect($spots)->chunk(3)->values() as $batchIndex => $batch) {
            if ($batchIndex > 0) {
                Sleep::for(2)->seconds();
            }

            foreach ($batch as $spot) {
                try {
                    $this->fetchForSpot($spot);
                    $processed++;
                    if ($reporter) {
                        $reporter($spot, true, null);
                    }
                } catch (\Throwable $exception) {
                    if ($reporter) {
                        $reporter($spot, false, $exception->getMessage());
                    }
                }
            }
        }

        return $processed;
    }
}
