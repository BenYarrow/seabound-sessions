// resources/js/Pages/Destinations/Index.tsx
//
// Destinations index page. Ranks every published spot by its typical number of
// sailable days for the chosen month + minimum wind, laid out global/continent/
// country, with the ranking + charts driven entirely client-side from props the
// controller already shipped. Filter state is mirrored to the URL (no Inertia
// visit) so a filtered view is shareable.

import { useMemo, useState } from 'react'
import { groupBy } from 'lodash'

import Layout from '@/Layouts/Layout'
import DestinationCard from '@/Components/Common/DestinationCard'
import FeaturedHero from '@/Components/Common/FeaturedHero'
import StaticMasthead from '@/Components/Masthead/StaticMasthead'
import DestinationsMap from '@/Components/Map/DestinationsMap'
import DestinationFilterBar from '@/Components/Destinations/DestinationFilterBar'
import SailableDaysChart from '@/Components/Destinations/SailableDaysChart'
import AllDestinationsWindChart from '@/Components/Destinations/AllDestinationsWindChart'
import ClimateLineChart from '@/Components/Destinations/ClimateLineChart'
import AnimateInView from '@/Components/Common/AnimateInView'
import { getSpotGuideColours } from '@/Helpers/colours'
import { rankSpots, unitToKts, type SailableDataset } from '@/Helpers/sailableDays'
import { parseFilters, filtersToQuery, defaultFilters, hasActiveFilters, type DestinationFilters, type GroupBy } from '@/Helpers/destinationFilters'
import { groupClimate, groupRankedSpots, type ChartGrouping } from '@/Helpers/chartGrouping'
import { MONTH_NAMES, climateTempForMonth, climateWetDaysForMonth, type ClimateDataset } from '@/Helpers/climate'
import type { SelectOption } from '@/Helpers/selectTypes'
import type { FocalImage } from '@/types/media'

/** Author attribution: 'house' (us) shows the brand; 'contributor' shows the name (and links to their profile). */
interface Author { kind: 'house' | 'contributor'; name: string | null; slug: string | null }

interface SpotGuide {
    id: number
    title: string
    slug: string
    latitude: number | null
    longitude: number | null
    country: { name: string; slug: string; continent: string } | null
    thumbnail: FocalImage | null
    author: Author
}

interface Props {
    spotGuides: SpotGuide[]
    sailableDays: SailableDataset
    climate: ClimateDataset
    showProvenance: boolean
    static_masthead: FocalImage | null
    featuredSpotGuide: { id: number; title: string; slug: string; country: string | null; thumbnail: FocalImage | null } | null
    meta: { title: string; description: string; keywords?: string[]; og_image?: string }
}

const CONTINENT_LABELS: Record<string, string> = {
    africa: 'Africa', asia: 'Asia', europe: 'Europe',
    'north-america': 'North America', 'south-america': 'South America', oceania: 'Oceania',
}

/**
 * Destinations index: rank spots by typical sailable days for the chosen month +
 * minimum wind, grouped by continent/country/global, with URL-synced filters and
 * the sailable-days / wind / temperature charts below.
 */
const Index = ({ spotGuides, sailableDays, climate, showProvenance, static_masthead, featuredSpotGuide, meta }: Props) => {
    // The ranking universe is EVERY published spot — not only those with weather
    // data. A spot missing from `sailableDays` ranks 0 and sinks to the bottom
    // (per the spec's "zero-day spots stay visible" rule), so it never vanishes.
    const allTitles = spotGuides.map((guide) => guide.title)
    // Colours are keyed by title and built from the full set so a spot's colour is
    // stable regardless of which spots are selected. `climate` (chart series only)
    // must NOT seed the ranking — that is what silently dropped dataless spots.
    const colours = useMemo(() => getSpotGuideColours(allTitles), [allTitles])

    // Multiselect options carry the title as label and the SLUG as value — slugs
    // are what we serialise to the URL (titles contain spaces/commas that would
    // break the comma-join).
    const destinationOptions: SelectOption[] = spotGuides.map((guide) => ({ label: guide.title, value: guide.slug }))
    // Resolve URL slugs back to titles (ranking + charts are keyed by title).
    const slugToTitle = useMemo(() => {
        const lookup: Record<string, string> = {}
        spotGuides.forEach((guide) => { lookup[guide.slug] = guide.title })
        return lookup
    }, [spotGuides])

    const currentMonth = new Date().getMonth() + 1
    // Lazy initialiser: parse the URL exactly once on mount. SSR is not enabled in
    // this project, so `window` is always defined here.
    const [filters, setFilters] = useState<DestinationFilters>(
        () => parseFilters(window.location.search, { month: currentMonth })
    )

    /** Apply a filter change: update local state and mirror it to the URL. */
    const updateFilters = (next: DestinationFilters) => {
        setFilters(next)
        const query = new URLSearchParams(filtersToQuery(next)).toString()
        // Mirror to the URL without an Inertia visit — no server round-trip, and
        // Inertia's history state object is preserved (passed straight back).
        window.history.replaceState(window.history.state, '', `/destinations?${query}`)
    }

    /** Return every filter to its fresh-visit default (current month, 20 kts, all spots…). */
    const resetFilters = () => updateFilters(defaultFilters(currentMonth))

    const monthOptions = MONTH_NAMES.map((name, index) => ({ label: name, value: index + 1 }))
    const groupOptions: { label: string; value: GroupBy }[] = [
        { label: 'By continent', value: 'continent' },
        { label: 'By country', value: 'country' },
        { label: 'Global ranking', value: 'global' },
    ]

    const minKts = unitToKts(filters.min, filters.unit)
    // Selected slugs → titles (dropping any unknown/stale slug from a shared link);
    // empty selection = the whole published set.
    const resolvedTitles = filters.spots.map((slug) => slugToTitle[slug]).filter(Boolean)
    // why: a shared link whose slugs are ALL stale (spot renamed/deleted) must not
    // resolve to an empty list — that would render the page and every chart blank.
    // Falling back to allTitles shows everything instead of nothing.
    const activeTitles = resolvedTitles.length > 0 ? resolvedTitles : allTitles
    const ranked = useMemo(
        () => rankSpots(sailableDays, activeTitles, filters.month, minKts),
        [sailableDays, activeTitles, filters.month, minKts]
    )

    // Full name of the selected month, for looking up climate temps below —
    // computed once so every consumer (filter, statFor) shares the same value.
    const monthName = MONTH_NAMES[filters.month - 1]

    // Opt-in temperature filter (default 0 = off, so cold-water spots like
    // Brouwersdam are NOT penalised by default). When a minimum is set, drop
    // spots whose typical temp that month is below it (or unknown) — the wind
    // ranking itself never considers temperature, so this is a separate,
    // user-chosen narrowing of the view, not a change to how spots are ranked.
    const visibleRanked = useMemo(() => {
        if (filters.minTemp <= 0) return ranked
        return ranked.filter((row) => {
            const temp = climateTempForMonth(climate, row.title, monthName)
            return temp !== null && temp >= filters.minTemp
        })
    }, [ranked, climate, monthName, filters.minTemp])

    // Rank order as a lookup so card grids can sort by it.
    const rankIndex = useMemo(() => {
        const lookup: Record<string, number> = {}
        visibleRanked.forEach((row, index) => { lookup[row.title] = index })
        return lookup
    }, [visibleRanked])

    const spotByTitle = useMemo(() => {
        const lookup: Record<string, SpotGuide> = {}
        spotGuides.forEach((guide) => { lookup[guide.title] = guide })
        return lookup
    }, [spotGuides])

    /** "≈ N windy days · T°C · W wet days" stat for a card, from the ranked row + that month's typical climate. */
    const statFor = (title: string): string => {
        const row = visibleRanked.find((entry) => entry.title === title)
        const days = row ? Math.round(row.avgDaysThisMonth) : 0
        const temp = climateTempForMonth(climate, title, monthName)
        const tempPart = temp !== null ? ` · ${Math.round(temp)}°C` : ''
        // Omitted (not "0 wet days") until the spot has been re-fetched with rain data.
        const wetDays = climateWetDaysForMonth(climate, title, monthName)
        const wetRounded = wetDays !== null ? Math.round(wetDays) : null
        const rainPart = wetRounded !== null ? ` · ${wetRounded} wet ${wetRounded === 1 ? 'day' : 'days'}` : ''
        return `≈ ${days} windy ${days === 1 ? 'day' : 'days'}${tempPart}${rainPart}`
    }

    // `visibleRanked` covers every active title minus any dropped by the opt-in
    // temperature filter, so the card grid always matches what's charted below.
    const rankedGuides = visibleRanked.map((row) => spotByTitle[row.title]).filter(Boolean) as SpotGuide[]
    // The temperature filter can legitimately empty the set (e.g. Brouwersdam
    // in January at a 25°C minimum) — unlike the stale-slug fallback (which
    // always guarantees a non-empty set), this is a real "nothing matches"
    // state and needs its own friendly message rather than blank sections.
    const isTemperatureFilterEmpty = filters.minTemp > 0 && visibleRanked.length === 0

    // Chart-only summarising: one series per spot, country or continent. It
    // deliberately sits downstream of the page filters — groups are built from
    // `visibleRanked` (spot selection + min-temp), so a continent's line is the
    // mean of the spots currently in view, not of every spot we hold. Kept out
    // of the URL: it changes how the charts read, not which spots match.
    const [chartGrouping, setChartGrouping] = useState<ChartGrouping>('spot')
    const chartGroupingOptions: { label: string; value: ChartGrouping }[] = [
        { label: 'Spot', value: 'spot' },
        { label: 'Country', value: 'country' },
        { label: 'Continent', value: 'continent' },
    ]

    /** Group label for a spot under the current chart grouping (null = no country, so it can't be grouped). */
    const groupLabelFor = (title: string): string | null => {
        const country = spotByTitle[title]?.country
        if (!country) return null
        return chartGrouping === 'continent' ? (CONTINENT_LABELS[country.continent] ?? country.continent) : country.name
    }

    const chartRanked = groupRankedSpots(visibleRanked, chartGrouping, groupLabelFor)
    const chartClimate = groupClimate(climate, visibleRanked.map((row) => row.title), chartGrouping, groupLabelFor)
    const chartSeries = chartRanked.map((row) => ({ label: row.title, value: row.title }))

    // Colours per grouping, seeded from EVERY spot (not just the filtered set) so
    // a country/continent keeps its colour as filters change — same rule as the
    // per-spot colours above.
    const groupColours = useMemo(() => {
        const labelsFor = (pick: (guide: SpotGuide) => string) =>
            [...new Set(spotGuides.filter((guide) => guide.country).map(pick))]
        return {
            country: getSpotGuideColours(labelsFor((guide) => guide.country!.name)),
            continent: getSpotGuideColours(labelsFor((guide) => CONTINENT_LABELS[guide.country!.continent] ?? guide.country!.continent)),
        }
    }, [spotGuides])
    const chartColours = chartGrouping === 'spot' ? colours : groupColours[chartGrouping]

    const mastheadImage = static_masthead ?? spotGuides.find((s) => s.thumbnail)?.thumbnail ?? null
    const minLabel = `${filters.min} ${filters.unit}`

    /** Build the grouped sections for continent/country grouping, each rank-sorted, groups ordered by their best spot. */
    const buildGroups = (key: 'continent' | 'country') => {
        const grouped = groupBy(
            rankedGuides.filter((guide) => guide.country),
            (guide) => key === 'continent' ? guide.country!.continent : guide.country!.slug
        )
        const entries = Object.entries(grouped)
        // Order groups by their best-ranked member (lowest rankIndex) — the region
        // holding your #1 spot leads. CONTINENT_LABELS is used only for labels now.
        entries.sort(([, first], [, second]) =>
            Math.min(...first.map((guide) => rankIndex[guide.title])) -
            Math.min(...second.map((guide) => rankIndex[guide.title]))
        )
        return entries
    }

    return (
        <Layout title={meta.title} description={meta.description} keywords={meta.keywords} ogImage={meta.og_image}>
            <StaticMasthead imageUrl={mastheadImage} title="Destinations" eyebrow="Windsurfing around the world" />

            {/* Filter bar — drives ranking + charts, synced to the URL */}
            <DestinationFilterBar
                monthOptions={monthOptions}
                groupOptions={groupOptions}
                destinationOptions={destinationOptions}
                filters={filters}
                onChange={updateFilters}
                onReset={resetFilters}
                canReset={hasActiveFilters(filters, currentMonth)}
            />

            {/* Intro */}
            <section className="bg-cream">
                <div className="container mx-auto py-12 lg:py-16">
                    <span className="block w-8 h-0.5 bg-orange mb-5" />
                    <h2 className="font-display text-secondary leading-none tracking-wide" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>
                        Where's Windy in {MONTH_NAMES[filters.month - 1]}?
                    </h2>
                    <div className="text-gray-500 text-base lg:text-lg leading-relaxed mt-4 max-w-3xl space-y-3">
                        <p>
                            Spots are ranked by their <strong className="text-secondary font-medium">average number of windy days per month</strong> —
                            how many days in a typical {monthName} the wind reaches {filters.min} {filters.unit} or more for at
                            least two hours of daylight, averaged over the last few years of hourly weather records.
                        </p>
                        <p>
                            Use the filters above to pick your travel month and the minimum wind you want to sail in (lower for
                            foiling and light-wind freeride, higher for wave and bump &amp; jump). You can narrow the list to
                            particular destinations, set a minimum air temperature to hide spots that are too cold that month,
                            and group the results by continent, country or one global ranking. The charts further down follow
                            the same filters.
                        </p>
                    </div>
                </div>
            </section>

            {featuredSpotGuide && (
                <section className="bg-white">
                    <div className="container mx-auto py-14 lg:py-16">
                        <FeaturedHero image={featuredSpotGuide.thumbnail} eyebrow="Featured Destination" title={featuredSpotGuide.title} metaLabel={featuredSpotGuide.country} href={`/destinations/${featuredSpotGuide.slug}`} ctaLabel="Explore guide" />
                    </div>
                </section>
            )}

            <DestinationsMap spotGuides={spotGuides} />

            {/* Card layouts */}
            {isTemperatureFilterEmpty ? (
                // Real "nothing matches" state — the temperature filter is opt-in,
                // so this only shows once the user has actively raised the minimum
                // above "Any" and every spot's typical temp falls short.
                <section className="bg-white">
                    <div className="container mx-auto py-16 text-center">
                        <p className="text-secondary/60 text-base lg:text-lg">
                            No destinations reach {filters.minTemp}°C in {monthName} — lower the minimum temperature.
                        </p>
                    </div>
                </section>
            ) : filters.group === 'global' ? (
                <section className="bg-white">
                    <div className="container mx-auto pt-14 lg:pt-16">
                        <SectionHeading label={`Best for ${MONTH_NAMES[filters.month - 1]}`} count={rankedGuides.length} />
                    </div>
                    <CardGrid guides={rankedGuides} showProvenance={showProvenance} statFor={statFor} withContinent />
                    <div className="pb-14 lg:pb-16" />
                </section>
            ) : (
                buildGroups(filters.group).map(([groupKey, guides], sectionIndex) => (
                    <section key={groupKey} className={sectionIndex % 2 === 0 ? 'bg-white' : 'bg-cream'}>
                        <div className="container mx-auto pt-14 lg:pt-16">
                            <SectionHeading
                                label={filters.group === 'continent' ? (CONTINENT_LABELS[groupKey] || groupKey) : (guides[0]?.country?.name || groupKey)}
                                count={guides.length}
                            />
                        </div>
                        <CardGrid guides={guides} showProvenance={showProvenance} statFor={statFor} />
                        <div className="pb-14 lg:pb-16" />
                    </section>
                ))
            )}

            {/* Charts */}
            {/* why: when the temp filter yields no spots, the cards show the empty-state
                message and this whole section is hidden — otherwise SailableDaysChart
                (unlike its wind/temp siblings) has no self-hide guard and would render
                a blank chart frame. */}
            {allTitles.length > 0 && !isTemperatureFilterEmpty && (
                // why: border-t marks the switch from the card listing to the data — the
                // listing's last section can be cream, which sits close to this tint.
                <section className="bg-primary-lightest border-t border-secondary/10">
                    <div className="container mx-auto pt-14 lg:pt-16 pb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                        <div className="flex items-start gap-4">
                            <div className="mt-2 w-1 h-12 bg-orange rounded-full shrink-0" />
                            <div>
                                <h2 className="font-display text-secondary leading-none tracking-wide" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>Wind & Weather Data</h2>
                                <p className="text-secondary/50 text-sm mt-2">
                                    Typical-year averages for the destinations in your filters · {monthName} highlighted
                                    {chartGrouping !== 'spot' && ` · each ${chartGrouping} is the average of its spots`}
                                </p>
                            </div>
                        </div>

                        {/* Series grouping — chart-only, applied on top of the page filters. */}
                        <div role="group" aria-label="Compare by" className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-secondary/50">Compare by</span>
                            <div className="flex border border-secondary/15 bg-white">
                                {chartGroupingOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setChartGrouping(option.value)}
                                        aria-pressed={chartGrouping === option.value}
                                        className={`px-3.5 py-2 text-xs uppercase tracking-wide transition-colors duration-200 ${chartGrouping === option.value ? 'bg-primary text-white' : 'text-secondary/60 hover:text-primary'}`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="container mx-auto pb-14 lg:pb-16 space-y-8">
                        <SailableDaysChart ranked={chartRanked} colours={chartColours} selectedMonth={filters.month} minLabel={minLabel} seriesLabel={chartGrouping} />
                        <AllDestinationsWindChart
                            climate={chartClimate}
                            activeDestinations={chartSeries}
                            activeWindUnit={filters.unit}
                            colours={chartColours}
                            selectedMonth={filters.month}
                            seriesLabel={chartGrouping}
                        />
                        <ClimateLineChart
                            climate={chartClimate}
                            activeDestinations={chartSeries}
                            colours={chartColours}
                            selectedMonth={filters.month}
                            seriesLabel={chartGrouping}
                            datapoint="avgTemp"
                            title="Temperature Trends"
                            yAxisLabel="Avg temp (°C)"
                            formatValue={(value) => `${value}°C`}
                        />
                        <ClimateLineChart
                            climate={chartClimate}
                            activeDestinations={chartSeries}
                            colours={chartColours}
                            selectedMonth={filters.month}
                            seriesLabel={chartGrouping}
                            datapoint="wetDays"
                            title="Wet Days"
                            subtitle="Typical days with 3 mm+ of rain between 9am and 7pm"
                            yAxisLabel="Wet days / month"
                            formatValue={(value) => `${value} ${value === 1 ? 'day' : 'days'}`}
                            note={<><strong className="text-secondary">Note:</strong> A wet day has 3 mm or more of rain between 9am and 7pm — enough to spoil a session, not a passing shower. Rain doesn't affect the wind ranking; use it to spot wet or stormy seasons.</>}
                        />
                    </div>
                </section>
            )}
        </Layout>
    )
}

/** Continent/country/global section heading. */
const SectionHeading = ({ label, count }: { label: string; count: number }) => (
    <div className="flex items-center gap-5 mb-10 lg:mb-12">
        <div className="flex items-start gap-4">
            <div className="mt-2 w-1 h-10 bg-orange rounded-full shrink-0" />
            <h2 className="font-display text-secondary leading-none tracking-wide" style={{ fontSize: 'clamp(2.2rem, 5vw, 4.5rem)' }}>{label}</h2>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-secondary/15 to-transparent hidden md:block" />
        <span className="text-secondary/30 text-sm font-medium tabular-nums hidden md:block">{count} {count === 1 ? 'spot' : 'spots'}</span>
    </div>
)

/** Rank-ordered card grid. */
const CardGrid = ({ guides, showProvenance, statFor, withContinent = false }: {
    guides: SpotGuide[]; showProvenance: boolean; statFor: (title: string) => string; withContinent?: boolean
}) => (
    <AnimateInView tag="ul" animateChildren classes="container mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
            <li key={guide.id} className="aspect-square">
                <DestinationCard
                    title={guide.title}
                    slug={guide.slug}
                    thumbnail={guide.thumbnail}
                    countryName={guide.country?.name}
                    continentLabel={withContinent ? (CONTINENT_LABELS[guide.country?.continent ?? ''] ?? null) : null}
                    stat={statFor(guide.title)}
                    byline={showProvenance ? (guide.author.kind === 'contributor' && guide.author.name ? `By ${guide.author.name}` : 'Seabound Sessions') : null}
                />
            </li>
        ))}
    </AnimateInView>
)

export default Index
