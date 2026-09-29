// resources/js/Helpers/chartGrouping.ts
//
// Roll the per-spot destinations chart data up into country or continent
// series. The input is always the page's already-filtered spot set (spot
// selection + min-temp filter), so a group's line is the mean of only the
// spots currently in view — the page filters drive the charts, and the
// grouping just changes how that same set is summarised.

import type { RankedSpot } from '@/Helpers/sailableDays'
import type { ClimateDataset, ClimateMonth } from '@/Helpers/climate'

/** How the weather charts summarise the filtered spots: one series per spot, country or continent. */
export type ChartGrouping = 'spot' | 'country' | 'continent'

/** Resolves a spot title to its group label for the chosen grouping (null = spot has no country). */
export type GroupLabelFor = (title: string) => string | null

/** Round to one decimal place, matching the precision the charts display. */
const roundToTenth = (value: number): number => Math.round(value * 10) / 10

/** Arithmetic mean of a non-empty list. */
const mean = (values: number[]): number => values.reduce((total, value) => total + value, 0) / values.length

/** Bucket titles by their group label, dropping titles without one. */
const bucketTitles = (titles: string[], groupLabelFor: GroupLabelFor): Record<string, string[]> => {
    const buckets: Record<string, string[]> = {}
    titles.forEach((title) => {
        const label = groupLabelFor(title)
        if (label === null) return
        ;(buckets[label] ??= []).push(title)
    })
    return buckets
}

/**
 * Collapse ranked spots into one row per group, each month the mean of its
 * member spots' typical sailable days. Groups are re-ranked by the selected
 * month (then alphabetically) so the chart legend reads best-first, like the
 * card grid. `spot` grouping returns the input unchanged.
 */
export const groupRankedSpots = (
    ranked: RankedSpot[],
    grouping: ChartGrouping,
    groupLabelFor: GroupLabelFor
): RankedSpot[] => {
    if (grouping === 'spot') return ranked

    const byTitle = Object.fromEntries(ranked.map((row) => [row.title, row]))
    const buckets = bucketTitles(ranked.map((row) => row.title), groupLabelFor)

    return Object.entries(buckets)
        .map(([label, titles]) => {
            const members = titles.map((title) => byTitle[title])
            return {
                title: label,
                avgDaysThisMonth: mean(members.map((row) => row.avgDaysThisMonth)),
                daysPerMonth: Array.from({ length: 12 }, (_unused, index) =>
                    mean(members.map((row) => row.daysPerMonth[index]))
                ),
            }
        })
        .sort((first, second) =>
            second.avgDaysThisMonth - first.avgDaysThisMonth || first.title.localeCompare(second.title)
        )
}

/** Numeric fields of a climate month that get averaged across a group. */
const CLIMATE_FIELDS: Exclude<keyof ClimateMonth, 'month' | 'rainMm' | 'rainyDays'>[] = [
    'avgTemp', 'ktsWind', 'ktsGust', 'mphWind', 'mphGust', 'kphWind', 'kphGust',
]

/** Optional rainfall fields, averaged over only the members that hold them. */
const RAIN_FIELDS: ('rainMm' | 'rainyDays')[] = ['rainMm', 'rainyDays']

/**
 * Build a climate dataset keyed by group label from the active spots, each
 * month the mean of the members that hold data for that month (a member
 * missing a month doesn't drag the average towards zero). With `spot`
 * grouping, just narrows the dataset to the active titles.
 */
export const groupClimate = (
    climate: ClimateDataset,
    activeTitles: string[],
    grouping: ChartGrouping,
    groupLabelFor: GroupLabelFor
): ClimateDataset => {
    const heldTitles = activeTitles.filter((title) => climate[title])
    if (grouping === 'spot') {
        return Object.fromEntries(heldTitles.map((title) => [title, climate[title]]))
    }

    const grouped: ClimateDataset = {}
    Object.entries(bucketTitles(heldTitles, groupLabelFor)).forEach(([label, titles]) => {
        // Month order follows first appearance across members — the server
        // already emits each spot's months in calendar order.
        const monthOrder: string[] = []
        titles.forEach((title) => climate[title].forEach((entry) => {
            if (!monthOrder.includes(entry.month)) monthOrder.push(entry.month)
        }))

        grouped[label] = monthOrder.map((monthName) => {
            const entries = titles
                .map((title) => climate[title].find((entry) => entry.month === monthName))
                .filter((entry): entry is ClimateMonth => entry !== undefined)
            const averaged = { month: monthName } as ClimateMonth
            CLIMATE_FIELDS.forEach((field) => {
                averaged[field] = roundToTenth(mean(entries.map((entry) => entry[field])))
            })
            // Rain is optional per spot (null until re-fetched): average only the
            // members that have it, so an unfetched spot doesn't read as bone dry.
            RAIN_FIELDS.forEach((field) => {
                const known = entries
                    .map((entry) => entry[field])
                    .filter((value): value is number => value !== null && value !== undefined)
                averaged[field] = known.length > 0 ? roundToTenth(mean(known)) : null
            })
            return averaged
        })
    })
    return grouped
}
