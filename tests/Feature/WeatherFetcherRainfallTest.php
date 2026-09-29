<?php
// tests/Feature/WeatherFetcherRainfallTest.php
//
// Rainfall on the monthly climate layer: WeatherFetcher asks Open-Meteo for
// hourly precipitation alongside wind/temp and rolls it into a month's total
// (`rain_mm`) and its count of rainy days (`rainy_days`, daily total >= 1 mm —
// the WMO "rain day" threshold). Unlike wind, rain counts the WHOLE day, not
// just the 9am-7pm sailing window: a night-time downpour still makes it a wet
// day for someone planning a trip.

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

    public function test_it_stores_the_monthly_rain_total_and_rainy_day_count(): void
    {
        Sleep::fake();
        $month = now()->subMonths(6)->startOfMonth();

        $this->fakeArchive($this->monthReadings($month, [
            // Day 1: 3.0 mm in the sailing window -> rainy.
            1 => [['12:00', 3.0]],
            // Day 2: 0.6 + 0.6 mm = 1.2 mm, one hour outside the window -> still rainy (whole day counts).
            2 => [['03:00', 0.6], ['14:00', 0.6]],
            // Day 3: 0.4 mm -> a trace, below the 1 mm threshold -> not rainy.
            3 => [['12:00', 0.4]],
        ]));

        $spot = SpotGuide::factory()->create(['latitude' => 38.7, 'longitude' => 20.6]);
        app(WeatherFetcher::class)->fetchForSpot($spot);

        $record = $spot->weatherRecords()->where('year', $month->year)->where('month', $month->month)->sole();
        $this->assertSame('4.6', (string) $record->rain_mm);
        $this->assertSame(2, $record->rainy_days);
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
        $this->assertNull($record->rainy_days);
    }
}
