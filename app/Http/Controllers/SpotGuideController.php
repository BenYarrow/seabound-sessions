<?php

// Public spot-guide (destination) detail page:
//   GET /destinations/{slug} — spot-guides.show
// Assembles the full destination payload for the Inertia page: conditions,
// gallery, stay/eat recommendations, windsurfing locations, weather history,
// and the related-guides slider (other guides in the same country, or the same
// continent as a fallback). All images resolve from the centralised media
// library and null-coalesce.

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesContentBlockMedia;
use App\Models\MediaLibrary;
use App\Models\SpotGuide;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class SpotGuideController extends Controller
{
    use ResolvesContentBlockMedia;

    /**
     * Render a single spot guide by slug (404 on unknown slug). Published guides
     * are public; unpublished guides are visible only to the owner or the
     * guide's own author, so the Filament "Preview" action works pre-publish.
     * Eager-loads every relation the page needs in one pass, then reshapes:
     * recommendations are split by type (stay/eat), gallery images are ordered
     * to match the stored id list, and weather records are grouped by year and
     * sorted by month for the charts.
     *
     * @param  string  $slug  the guide's URL slug
     */
    public function show(string $slug): Response
    {
        $spotGuide = SpotGuide::where('slug', $slug)
            ->with([
                'country',
                'author.profileImageMedia',
                'recommendations.thumbnailMedia',
                'windsurfingLocations.thumbnailMedia',
                'weatherRecords',
                'thumbnailMedia',
                'staticMastheadMedia',
                'ogImageMedia',
                'windConditionsBgMedia',
                'waterConditionsBgMedia',
                'travellingToBgMedia',
                'lessonsAndHireBgMedia',
            ])
            ->firstOrFail();

        // Unpublished guides are visible only to the owner (any guide) or the
        // guide's author (their own) — everyone else gets the usual 404.
        if (! $spotGuide->is_published) {
            $viewer = auth()->user();
            abort_unless(
                $viewer && ($viewer->isOwner() || $spotGuide->user_id === $viewer->id),
                404,
            );
        }

        // Fetch gallery images in one whereIn query, keyed by id, then map back
        // over the stored id list so the gallery keeps its authored order.
        $galleryIds = $spotGuide->gallery_media_ids ?? [];
        $galleryItems = ! empty($galleryIds)
            ? MediaLibrary::whereIn('id', $galleryIds)->get()->keyBy('id')
            : collect();

        // Each gallery item becomes a full imagePayload object so CoverImage can
        // use its focal point; lightbox still reads .url from the same object.
        $gallery = collect($galleryIds)
            ->map(fn ($id) => $galleryItems->get($id))
            ->filter()
            ->map(fn ($m) => $m->imagePayload())
            ->values()
            ->toArray();

        // Related guides: other published guides in the SAME COUNTRY, falling
        // back to the same CONTINENT, then hidden. Featured leads (single-featured
        // invariant → at most one), remainder ranked gustiest-this-month.
        $relation = null;
        $label = null;
        $related = collect();

        if ($spotGuide->country_id !== null) {
            $countrySiblings = SpotGuide::published()
                ->where('country_id', $spotGuide->country_id)
                ->where('id', '!=', $spotGuide->id)
                ->with(['thumbnailMedia', 'weatherRecords'])
                ->get();

            if ($countrySiblings->isNotEmpty()) {
                $related = $countrySiblings;
                $relation = 'country';
                $label = $spotGuide->country?->name;
            } elseif ($spotGuide->country?->continent) {
                $continent = $spotGuide->country->continent;
                $continentGuides = SpotGuide::published()
                    ->where('id', '!=', $spotGuide->id)
                    ->whereHas('country', fn ($query) => $query->where('continent', $continent))
                    ->with(['country', 'thumbnailMedia', 'weatherRecords'])
                    ->get();

                if ($continentGuides->isNotEmpty()) {
                    $related = $continentGuides;
                    $relation = 'continent';
                    // Humanise the enum slug for display: north-america → North America.
                    $label = ucwords(str_replace('-', ' ', $continent));
                }
            }
        }

        // Featured first (stable sort preserves gust order among the rest), then
        // gustiest this month.
        $related = SpotGuide::sortByGustiestThisMonth($related)
            ->sortByDesc('is_featured')
            ->values();

        $relatedGuides = $related->map(fn (SpotGuide $guide) => [
            'id' => $guide->id,
            'title' => $guide->title,
            'slug' => $guide->slug,
            'thumbnail' => $guide->thumbnailMedia?->imagePayload(),
            'intro_snippet' => Str::limit(strip_tags($guide->introduction_text ?? ''), 140),
            'overview' => [
                'wind_conditions' => $guide->spot_overview['wind_conditions'] ?? null,
                'best_direction' => $guide->spot_overview['best_direction'] ?? null,
            ],
        ])->values()->toArray();

        return Inertia::render('SpotGuide/Show', [
            'spotGuide' => [
                'id' => $spotGuide->id,
                'title' => $spotGuide->title,
                'slug' => $spotGuide->slug,
                // Who wrote it — house vs a named contributor (shown only when showProvenance).
                'author' => $spotGuide->authorPayload(),
                'country' => $spotGuide->country ? [
                    'name' => $spotGuide->country->name,
                    'slug' => $spotGuide->country->slug,
                    'continent' => $spotGuide->country->continent,
                ] : null,
                'latitude' => $spotGuide->latitude,
                'longitude' => $spotGuide->longitude,
                'introduction_text' => $spotGuide->introduction_text,
                'spot_overview' => $spotGuide->spot_overview,
                'water_conditions' => $spotGuide->water_conditions,
                'wind_conditions' => $spotGuide->wind_conditions,
                'when_to_go' => $spotGuide->when_to_go,
                'where_to_stay_intro' => $spotGuide->where_to_stay_intro,
                'where_to_eat_intro' => $spotGuide->where_to_eat_intro,
                'travelling_to' => $spotGuide->travelling_to,
                'lessons_and_hire' => $spotGuide->lessons_and_hire,
                'content_blocks' => $this->resolveContentBlockMedia($spotGuide->content_blocks ?? []),
                // Display images as focal-bearing objects; og_image stays a plain
                // URL string because it feeds <meta> tags, not <CoverImage>.
                'thumbnail' => $spotGuide->thumbnailMedia?->imagePayload(),
                'static_masthead' => $spotGuide->staticMastheadMedia?->imagePayload(),
                'gallery' => $gallery,
                'water_conditions_bg' => $spotGuide->waterConditionsBgMedia?->imagePayload(),
                'wind_conditions_bg' => $spotGuide->windConditionsBgMedia?->imagePayload(),
                'travelling_to_bg' => $spotGuide->travellingToBgMedia?->imagePayload(),
                'lessons_and_hire_bg' => $spotGuide->lessonsAndHireBgMedia?->imagePayload(),
                'stay_recommendations' => $spotGuide->recommendations->where('type', 'stay')->values()->map(fn ($r) => [
                    'id' => $r->id,
                    'name' => $r->name,
                    'description' => $r->description,
                    'url' => $r->url,
                    'latitude' => $r->latitude,
                    'longitude' => $r->longitude,
                    'thumbnail' => $r->thumbnailMedia?->imagePayload(),
                ])->toArray(),
                'eat_recommendations' => $spotGuide->recommendations->where('type', 'eat')->values()->map(fn ($r) => [
                    'id' => $r->id,
                    'name' => $r->name,
                    'description' => $r->description,
                    'url' => $r->url,
                    'latitude' => $r->latitude,
                    'longitude' => $r->longitude,
                    'thumbnail' => $r->thumbnailMedia?->imagePayload(),
                ])->toArray(),
                'windsurfing_locations' => $spotGuide->windsurfingLocations->map(fn ($l) => [
                    'id' => $l->id,
                    'name' => $l->name,
                    'description' => $l->description,
                    'latitude' => $l->latitude,
                    'longitude' => $l->longitude,
                    'thumbnail' => $l->thumbnailMedia?->imagePayload(),
                ])->toArray(),
                'weather_records' => $spotGuide->weatherRecords
                    ->groupBy('year')
                    ->map(fn ($yearRecords) => $yearRecords->sortBy('month')->values()->map(fn ($r) => [
                        'month' => $r->month_name,
                        'avg_temp' => $r->avg_temp,
                        'kts_wind' => $r->kts_wind,
                        'kts_gust' => $r->kts_gust,
                        'mph_wind' => $r->mph_wind,
                        'mph_gust' => $r->mph_gust,
                        'kph_wind' => $r->kph_wind,
                        'kph_gust' => $r->kph_gust,
                        'rain_mm' => $r->rain_mm,
                        'rainy_days' => $r->rainy_days,
                    ])->toArray())
                    ->toArray(),
            ],
            'meta' => [
                'title' => $spotGuide->seo_title ?? $spotGuide->title,
                'description' => $spotGuide->seo_description ?? '',
                'keywords' => $spotGuide->seo_keywords ?? [],
                'og_image' => $spotGuide->ogImageMedia?->getUrl() ?: ($spotGuide->thumbnailMedia?->getUrl() ?? ''),
            ],
            'related_spot_guides' => [
                'relation' => $relation,
                'label' => $label,
                'guides' => $relatedGuides,
            ],
            'is_preview' => ! $spotGuide->is_published,
            // Show provenance byline only once a published contributor guide exists.
            'showProvenance' => SpotGuide::contributorGuidesExist(),
        ]);
    }
}
