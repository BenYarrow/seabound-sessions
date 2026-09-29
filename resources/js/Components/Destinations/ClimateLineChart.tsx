// resources/js/Components/Destinations/ClimateLineChart.tsx
//
// Line chart comparing one typical-year climate metric across the active
// destinations (or countries/continents) — used for temperature and for rainy
// days. No unit or gust control: neither metric has one. Wind has its own
// chart (AllDestinationsWindChart) because of its wind/gust toggle and units.

import { useMemo } from 'react'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts'
import { prepareClimateData, MONTH_NAMES, type ClimateDataset, type ClimateMonth } from '@/Helpers/climate'
import type { SelectOption } from '@/Helpers/selectTypes'

interface Props {
    climate: ClimateDataset
    activeDestinations: SelectOption[]
    colours: Record<string, string>
    selectedMonth: number
    /** What each line represents (spot / country / continent), for the subtitle. */
    seriesLabel?: string
    /** Which climate field to plot. */
    datapoint: keyof ClimateMonth
    title: string
    /** Y-axis label, e.g. "Avg temp (°C)". */
    yAxisLabel: string
    /** Formats one value for the tooltip, e.g. 18 -> "18°C". */
    formatValue: (value: number) => string
    /** Optional footnote under the chart (source / definition). */
    note?: React.ReactNode
}

const AXIS_TICK = { fill: 'rgba(0,0,0,0.6)', fontSize: 11 }
const AXIS_LINE = { stroke: 'rgba(0,0,0,0.15)' }

/**
 * Render a typical-year line chart of one climate metric, one line per series.
 */
const ClimateLineChart = ({
    climate,
    activeDestinations,
    colours,
    selectedMonth,
    seriesLabel = 'spot',
    datapoint,
    title,
    yAxisLabel,
    formatValue,
    note,
}: Props) => {
    // Narrow the full climate dataset down to the currently-active destinations,
    // mirroring the active-destination filtering previously applied via the
    // rendered <Line> list — now applied to the data source too.
    const filteredClimate = useMemo(() => {
        const activeLabels = activeDestinations.map((d) => d.label)
        return Object.fromEntries(
            Object.entries(climate).filter(([title]) => activeLabels.includes(title))
        )
    }, [climate, activeDestinations])

    const chartData = useMemo(
        () => prepareClimateData(filteredClimate, datapoint),
        [filteredClimate, datapoint]
    )

    // The selected-month reference line only renders if that month is actually
    // present among the pivoted rows (typical-year data may not cover every month).
    const selectedMonthLabel = MONTH_NAMES[selectedMonth - 1]
    const hasSelectedMonth = chartData.some((row) => row.month === selectedMonthLabel)

    const CustomTooltip = ({ payload }: any) => {
        if (!payload?.length) return null
        const data = payload[0].payload
        const { month, ...restOfData } = data

        const activeLabels = activeDestinations.map((d) => d.label)
        const orderedData = Object.entries(restOfData)
            .map(([location, value]) => ({ location, value: value as number | null }))
            // Rain can be null for a spot not yet re-fetched — leave it out rather than show "null".
            .filter((d): d is { location: string; value: number } => activeLabels.includes(d.location) && d.value !== null && d.value !== undefined)
            .sort((a, b) => b.value - a.value)

        return (
            <div className="min-w-[10rem] bg-white border border-black/10 p-3 shadow-xl">
                <p className="text-primary text-xs uppercase tracking-wide border-b border-black/10 pb-2 mb-2 flex items-center justify-between gap-x-3">
                    {month}
                </p>
                <ul className="space-y-1.5">
                    {orderedData.map(({ location, value }) => (
                        <li
                            key={location}
                            className="flex items-center justify-between gap-x-4 text-xs"
                            style={{ color: colours[location] }}
                        >
                            <span className="truncate max-w-[8rem]">{location}</span>
                            <span className="font-medium tabular-nums">{formatValue(value)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        )
    }

    // Hide entirely when no series has a value for this metric (e.g. rain before
    // the first re-fetch) — an empty frame of axes reads as "no rain", which is wrong.
    const hasAnyValue = chartData.some((row) =>
        Object.entries(row).some(([key, value]) => key !== 'month' && value !== null && value !== undefined)
    )
    if (!chartData.length || !activeDestinations.length || !hasAnyValue) return null

    return (
        <div className="bg-white border border-black/10 p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div>
                <h3 className="font-display text-secondary tracking-wide"
                    style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
                    {title}
                </h3>
                <p className="text-secondary/50 text-xs mt-1">Typical-year averages by {seriesLabel}</p>
            </div>

            {/* Chart */}
            <div className="h-[22rem]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                        <XAxis
                            dataKey="month"
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            tick={AXIS_TICK}
                            axisLine={AXIS_LINE}
                            tickLine={AXIS_LINE}
                        />
                        <YAxis
                            tick={AXIS_TICK}
                            axisLine={AXIS_LINE}
                            tickLine={AXIS_LINE}
                            label={{
                                value: yAxisLabel,
                                angle: -90,
                                position: 'insideLeft',
                                fill: 'rgba(0,0,0,0.5)',
                                fontSize: 11,
                            }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        {hasSelectedMonth && (
                            <ReferenceLine
                                x={selectedMonthLabel}
                                stroke="hsl(11 61% 58%)"
                                strokeDasharray="4 2"
                            />
                        )}
                        {activeDestinations.map(({ label }) => (
                            <Line
                                key={label}
                                type="monotone"
                                dataKey={label}
                                stroke={colours[label]}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {note && (
                <p className="text-secondary/50 text-xs leading-relaxed border-t border-black/10 pt-4">{note}</p>
            )}
        </div>
    )
}

export default ClimateLineChart
