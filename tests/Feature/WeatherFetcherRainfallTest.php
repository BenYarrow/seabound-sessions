<?php
// tests/Feature/WeatherFetcherRainfallTest.php
//
// Rainfall on the monthly climate layer: WeatherFetcher asks Open-Meteo for
// hourly precipitation alongside wind/temp and rolls it into a month's total
// (`rain_mm`, whole day) and its count of WET days (`wet_days`: at least 3 mm
// falling within the 9am-7pm sailing window). The wet-day rule deliberately
// ignores the 1 mm meteorological "rain day": that counts passing showers and
// the reanalysis's tropical drizzle, which made spots like Le Morne look wet
// on ~24 days of January. A wet day is one the rain would actually spoil.

namespace Tests\Feature;

use App\Models\SpotGuide;
use App\Services\WeatherFetcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

class WeatherFetcherRainfallTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Fake an archive whose first chunk carries the given hourly readings
     * ([time, temp, wind, gust, precipitation]) and whose other chunks are empty.
     *
     * @param  array<int, array{0: string, 1: float, 2: float, 3: float, 4: float|null}>  $readings
     */
    private function fakeArchive(array $readings): void
    {
        $empty = ['hourly' => ['time' => [], 'temperature_2m' => [], 'wind_speed_10m' => [], 'wind_gusts_10m' => [], 'precipitation' => []]];

        Http::fake([
            'archive-api.open-meteo.com/*' => Http::sequence()
                ->push(['hourly' => [
                    'time' => array_column($readings, 0),
                    'temperature_2m' => array_column($readings, 1),
                    'wind_speed_10m' => array_column($readings, 2),
                    'wind_gusts_10m' => array_column($readings, 3),
                    'precipitation' => array_map(fn ($reading) => $reading[4], $readings),
                ]])
                ->whenEmpty(Http::response($empty)),
        ]);
    }

    /**
     * A complete month with in-window readings every day. `$rainByDay` maps a
     * day number to [hour, mm] pairs of extra readings carrying rain; every
     * other reading is dry (0.0), or null when `$precipitation` is null.
     *
     * @param  array<int, array<int, array{0: string, 1: float}>>  $rainByDay
     */
    private function monthReadings(Carbon $month, array $rainByDay = [], ?float $precipitation = 0.0): array
    {
        $readings = [];
        $day = $month->copy()->startOfMonth();

        for ($dayNumber = 1; $dayNumber <= $month->daysInMonth; $dayNumber++) {
            $date = $day->format('Y-m-d');
            $readings[] = [$date.'T09:00', 20.0, 10.0, 15.0, $precipitation];
            $readings[] = [$date.'T10:00', 20.0, 10.0, 15.0, $precipitation];
            foreach ($rainByDay[$dayNumber] ?? [] as [$hour, $millimetres]) {
                $readings[] = ["{$date}T{$hour}", 20.0, 10.0, 15.0, $millimetres];
            }
            $day->addDay();
        }

        return $readings;
    }

    public function test_it_requests_hourly_precipitation(): void
    {
        Sleep::fake();
        $this->fakeArchive([]);

        app(WeatherFetcher::class)->fetchForSpot(SpotGuide::factory()->create(['latitude' => 38.7, 'longitude' => 20.6]));

        Http::assertSent(fn (Request $request) => str_contains($request['hourly'], 'precipitation'));
    }

    public function test_it_stores_the_monthly_rain_total_and_wet_day_count(): void
    {
        Sleep::fake();
        $month = now()->subMonths(6)->startOfMonth();

        $this->fakeArchive($this->monthReadings($month, [
            // Day 1: 4.0 mm at midday -> wet (>= 3 mm in the sailing window).
            1 => [['12:00', 4.0]],
            // Day 2: 1.5 + 1.5 mm, both in the window -> 3.0 mm -> wet (threshold is inclusive).
            2 => [['11:00', 1.5], ['15:00', 1.5]],
            // Day 3: a 2.0 mm shower -> not wet; a passing shower doesn't spoil a day.
            3 => [['12:00', 2.0]],
            // Day 4: 10 mm overnight, dry sailing hours -> not wet, but it still counts in the month's total.
            4 => [['03:00', 10.0]],
        ]));

        $spot = SpotGuide::factory()->create(['latitude' => 38.7, 'longitude' => 20.6]);
        app(WeatherFetcher::class)->fetchForSpot($spot);

        $record = $spot->weatherRecords()->where('year', $month->year)->where('month', $month->month)->sole();
        $this->assertSame('19.0', (string) $record->rain_mm);
        $this->assertSame(2, $record->wet_days);
    }

    public function test_rain_is_left_null_when_the_archive_returns_no_precipitation(): void
    {
        Sleep::fake();
        $month = now()->subMonths(6)->startOfMonth();
        $this->fakeArchive($this->monthReadings($month, [], null));

        $spot = SpotGuide::factory()->create(['latitude' => 38.7, 'longitude' => 20.6]);
        app(WeatherFetcher::class)->fetchForSpot($spot);

        // The wind/temp row is still written — rain is additive, never a reason to drop a month.
        $record = $spot->weatherRecords()->where('year', $month->year)->where('month', $month->month)->sole();
        $this->assertNull($record->rain_mm);
        $this->assertNull($record->wet_days);
    }
}
