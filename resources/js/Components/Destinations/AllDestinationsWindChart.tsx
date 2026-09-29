// resources/js/Components/Destinations/AllDestinationsWindChart.tsx
//
// Line chart comparing typical-year wind speed averages across the active
// destinations. Wind/gust is a chart-local toggle (out of URL scope); the unit
// (kts/mph/kph) is display-only here — the filter bar (Task 8) owns the single
// live unit control so there aren't two controls fighting over one piece of state.

import { useMemo, useState } from 'react'
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
import type { WindUnit } from '@/Helpers/sailableDays'
import type { SelectOption } from '@/Helpers/selectTypes'

interface Props {
    climate: ClimateDataset
    activeDestinations: SelectOption[]
    activeWindUnit: WindUnit
    colours: Record<string, string>
    selectedMonth: number
    /** What each line represents (spot / country / continent), for the subtitle. */
    seriesLabel?: string
}

const AXIS_TICK = { fill: 'rgba(0,0,0,0.6)', fontSize: 11 }
const AXIS_LINE = { stroke: 'rgba(0,0,0,0.15)' }

const AllDestinationsWindChart = ({
    climate,
    activeDestinations,
    activeWindUnit,
    colours,
    selectedMonth,
    seriesLabel = 'spot',
}: Props) => {
    // Wind vs gust is specific to this chart (not part of the shared filter bar
    // state / URL), so it stays as local state rather than a lifted prop.
    const [showAverageGustData, setShowAverageGustData] = useState(false)

    const windDatapoint = showAverageGustData
        ? `${activeWindUnit}Gust`
        : `${activeWindUnit}Wind`

    // Narrow the full climate dataset down to the currently-active destinations,
    // mirroring the same active-destination filtering the chart previously
    // applied via the rendered <Line> list — now applied to the data source too
    // so prepareClimateData only pivots the series actually shown.
    const filteredClimate = useMemo(() => {
        const activeLabels = activeDestinations.map((d) => d.label)
        return Object.fromEntries(
            Object.entries(climate).filter(([title]) => activeLabels.includes(title))
        )
    }, [climate, activeDestinations])

    const chartData = useMemo(
        () => prepareClimateData(filteredClimate, windDatapoint as keyof ClimateMonth),
        [filteredClimate, windDatapoint]
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
            .map(([location, value]) => ({ location, value: value as number }))
            .filter((d) => activeLabels.includes(d.location))
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
                            <span className="font-medium tabular-nums">{value} {activeWindUnit}</span>
                        </li>
                    ))}
                </ul>
            </div>
        )
    }

    if (!chartData.length) return null

    return (
        <div className="bg-white border border-black/10 p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                    <h3 className="font-display text-secondary tracking-wide"
                        style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
                        Wind Speed Averages
                    </h3>
                    <p className="text-secondary/50 text-xs mt-1">Typical-year monthly breakdown by {seriesLabel}</p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                    {/* Wind/Gust toggle */}
                    <label className="inline-flex items-center cursor-pointer gap-2.5">
                        <span className={`text-xs uppercase tracking-wide ${!showAverageGustData ? 'text-secondary' : 'text-secondary/40'}`}>
                            Wind
                        </span>
                        <input
                            type="checkbox"
                            checked={showAverageGustData}
                            onChange={(e) => setShowAverageGustData(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="relative w-10 h-5 bg-secondary/15 border border-secondary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:border-secondary/20 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:border-primary" />
                        <span className={`text-xs uppercase tracking-wide ${showAverageGustData ? 'text-secondary' : 'text-secondary/40'}`}>
                            Gust
                        </span>
                    </label>
                </div>
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
                                value: `Avg ${showAverageGustData ? 'Gust' : 'Wind'} (${activeWindUnit})`,
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

            {/* Disclaimer */}
            <p className="text-secondary/50 text-xs leading-relaxed border-t border-black/10 pt-4">
                <strong className="text-secondary">Note:</strong> Wind data calculated from historical records via the{' '}
                <a href="https://open-meteo.com/" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-primary transition-colors">
                    Open-Meteo API
                </a>
                . Long-term averages — actual conditions may vary.
            </p>
        </div>
    )
}

export default AllDestinationsWindChart
