<?php

// Feature tests for App\Http\Controllers\SpotGuideController — the public
// /destinations/{slug} detail route. Covers rendering, published-only access,
// the stay/eat recommendation split, locations, and the weather-by-year shape.

namespace Tests\Feature;

use App\Models\Country;
use App\Models\MediaLibrary;
use App\Models\Recommendation;
use App\Models\SpotGuide;
use App\Models\WeatherRecord;
use App\Models\WindsurfingLocation;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class SpotGuideControllerTest extends TestCase
{
    public function test_show_renders_a_published_spot_guide_with_its_country(): void
    {
        $guide = SpotGuide::factory()->create();

        $response = $this->get(route('spot-guides.show', $guide->slug));

        $response->assertOk();
        $response->assertInertia(
            fn (Assert $page) => $page
                ->component('SpotGuide/Show')
                ->where('spotGuide.slug', $guide->slug)
                ->where('spotGuide.country.name', $guide->country->name)
        );
    }

    public function test_show_returns_404_for_an_unpublished_guide(): void
    {
        $guide = SpotGuide::factory()->unpublished()->create();

        $this->get(route('spot-guides.show', $guide->slug))->assertNotFound();
    }

    public function test_show_returns_404_for_an_unknown_slug(): void
    {
        $this->get(route('spot-guides.show', 'nowhere'))->assertNotFound();
    }

    public function test_show_splits_recommendations_into_stay_and_eat(): void
    {
        $guide = SpotGuide::factory()->create();
        Recommendation::factory()->count(2)->for($guide)->create();          // stay (default)
        Recommendation::factory()->eat()->count(3)->for($guide)->create();

        $response = $this->get(route('spot-guides.show', $guide->slug));

        $response->assertInertia(
            fn (Assert $page) => $page
                ->has('spotGuide.stay_recommendations', 2)
                ->has('spotGuide.eat_recommendations', 3)
        );
    }

    public function test_show_includes_windsurfing_locations(): void
    {
        $guide = SpotGuide::factory()->create();
        WindsurfingLocation::factory()->count(2)->for($guide)->create();

        $response = $this->get(route('spot-guides.show', $guide->slug));

        $response->assertInertia(
            fn (Assert $page) => $page->has('spotGuide.windsurfing_locations', 2)
        );
    }

    public function test_show_groups_weather_records_by_year_with_month_names(): void
    {
        $guide = SpotGuide::factory()->create();
        // Insert out of order to prove the controller sorts by month within a year.
        WeatherRecord::factory()->for($guide)->create(['year' => 2023, 'month' => 3]);
        WeatherRecord::factory()->for($guide)->create(['year' => 2023, 'month' => 1]);

        $response = $this->get(route('spot-guides.show', $guide->slug));

        $response->assertInertia(
            fn (Assert $page) => $page
                ->has('spotGuide.weather_records.2023', 2)
                ->where('spotGuide.weather_records.2023.0.month', 'January')
                ->where('spotGuide.weather_records.2023.1.month', 'March')
        );
    }

    public function test_show_includes_rainfall_on_weather_records(): void
    {
        $guide = SpotGuide::factory()->create();
        WeatherRecord::factory()->for($guide)->create(['year' => 2023, 'month' => 1, 'rain_mm' => 55.5, 'wet_days' => 7]);

        $response = $this->get(route('spot-guides.show', $guide->slug));

        $response->assertInertia(
            fn (Assert $page) => $page
                ->where('spotGuide.weather_records.2023.0.rain_mm', '55.5')
                ->where('spotGuide.weather_records.2023.0.wet_days', 7)
        );
    }

    /**
     * When a guide has a MediaLibrary thumbnail with non-default focal values,
     * the controller must emit them as spotGuide.thumbnail.focal_x / focal_y
     * rather than a plain URL string.
     */
    public function test_show_exposes_thumbnail_with_focal_point(): void
    {
        $media = MediaLibrary::create(['name' => 'Hero', 'focal_x' => 20, 'focal_y' => 80]);
        $guide = SpotGuide::factory()->create(['thumbnail_media_id' => $media->id]);

        $this->get(route('spot-guides.show', $guide->slug))
            ->assertInertia(fn (Assert $page) => $page
                ->where('spotGuide.thumbnail.focal_x', 20)
                ->where('spotGuide.thumbnail.focal_y', 80)
            );
    }

    public function test_show_includes_other_published_guides_from_the_same_country(): void
    {
        $country = Country::factory()->create(['name' => 'Greece']);
        $guide = SpotGuide::factory()->for($country)->create();
        $sibling = SpotGuide::factory()->for($country)->create();

        $this->get(route('spot-guides.show', $guide->slug))
            ->assertInertia(fn (Assert $page) => $page
                ->where('related_spot_guides.relation', 'country')
                ->where('related_spot_guides.label', 'Greece')
                ->has('related_spot_guides.guides', 1)
                ->where('related_spot_guides.guides.0.slug', $sibling->slug)
            );
    }

    public function test_show_excludes_the_current_guide_and_drafts_from_related(): void
    {
        $country = Country::factory()->create();
        $guide = SpotGuide::factory()->for($country)->create();
        SpotGuide::factory()->for($country)->unpublished()->create(); // draft sibling

        $this->get(route('spot-guides.show', $guide->slug))
            ->assertInertia(fn (Assert $page) => $page
                ->where('related_spot_guides.relation', null)
                ->has('related_spot_guides.guides', 0)
            );
    }

    public function test_show_falls_back_to_continent_when_country_has_no_siblings(): void
    {
        $europeA = Country::factory()->create(['continent' => 'europe', 'name' => 'Greece']);
        $europeB = Country::factory()->create(['continent' => 'europe', 'name' => 'Spain']);
        $guide = SpotGuide::factory()->for($europeA)->create();
        $continentSibling = SpotGuide::factory()->for($europeB)->create();

        $this->get(route('spot-guides.show', $guide->slug))
            ->assertInertia(fn (Assert $page) => $page
                ->where('related_spot_guides.relation', 'continent')
                ->where('related_spot_guides.label', 'Europe')
                ->has('related_spot_guides.guides', 1)
                ->where('related_spot_guides.guides.0.slug', $continentSibling->slug)
            );
    }

    public function test_show_returns_no_related_when_neither_country_nor_continent_has_others(): void
    {
        $country = Country::factory()->create(['continent' => 'oceania']);
        $guide = SpotGuide::factory()->for($country)->create();

        $this->get(route('spot-guides.show', $guide->slug))
            ->assertInertia(fn (Assert $page) => $page
                ->where('related_spot_guides.relation', null)
                ->where('related_spot_guides.label', null)
                ->has('related_spot_guides.guides', 0)
            );
    }

    public function test_show_orders_related_featured_first_then_gustiest(): void
    {
        $country = Country::factory()->create();
        $guide = SpotGuide::factory()->for($country)->create();
        $featured = SpotGuide::factory()->for($country)->create(['title' => 'Featured Cove', 'is_featured' => true]);
        $windy = SpotGuide::factory()->for($country)->create(['title' => 'Windy Point']);
        $calm = SpotGuide::factory()->for($country)->create(['title' => 'Calm Bay']);
        WeatherRecord::factory()->for($featured)->create(['year' => now()->year, 'month' => now()->month, 'kts_gust' => 5]);
        WeatherRecord::factory()->for($windy)->create(['year' => now()->year, 'month' => now()->month, 'kts_gust' => 30]);
        WeatherRecord::factory()->for($calm)->create(['year' => now()->year, 'month' => now()->month, 'kts_gust' => 10]);

        $this->get(route('spot-guides.show', $guide->slug))
            ->assertInertia(fn (Assert $page) => $page
                ->where('related_spot_guides.guides.0.title', 'Featured Cove') // featured leads despite low gust
                ->where('related_spot_guides.guides.1.title', 'Windy Point')   // then gustiest
                ->where('related_spot_guides.guides.2.title', 'Calm Bay')
            );
    }

    public function test_show_related_card_carries_snippet_and_overview(): void
    {
        $country = Country::factory()->create();
        $guide = SpotGuide::factory()->for($country)->create();
        SpotGuide::factory()->for($country)->create([
            'introduction_text' => '<p>A <strong>windy</strong> paradise.</p>',
            'spot_overview' => ['wind_conditions' => 'Thermal', 'best_direction' => 'NW'],
        ]);

        $this->get(route('spot-guides.show', $guide->slug))
            ->assertInertia(fn (Assert $page) => $page
                ->where('related_spot_guides.guides.0.intro_snippet', 'A windy paradise.')
                ->where('related_spot_guides.guides.0.overview.wind_conditions', 'Thermal')
                ->where('related_spot_guides.guides.0.overview.best_direction', 'NW')
            );
    }
}
