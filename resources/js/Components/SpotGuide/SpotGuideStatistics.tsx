import { useMemo, useState } from 'react'
import Select from 'react-select'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import Icon from '@/Components/Common/Icon'
import ChartHeading from '@/Components/Common/ChartHeading'
import { faSlidersH, faRotateLeft } from '@fortawesome/free-solid-svg-icons'

interface WeatherMonth {
    month: string
    avg_temp: number
    kts_wind: number
    kts_gust: number
    mph_wind: number
    mph_gust: number
    kph_wind: number
    kph_gust: number
    /** Monthly rainfall (mm, whole day) and wet-day count (3 mm+ in sailing hours); null until the spot is re-fetched with rain data. */
    rain_mm?: number | string | null
    wet_days?: number | null
}

interface SelectOption<T = string | number> {
    label: T
    value: T
}

interface Props {
    weatherRecords: Record<string, WeatherMonth[]>
}

const unitOptions: SelectOption<string>[] = [
    { label: 'Knots', value: 'kts' },
    { label: 'Mph', value: 'mph' },
    { label: 'Kph', value: 'kph' },
]

// Bar colours — reused for the tooltip rows so each figure matches its bar.
const GUST_COLOUR = 'hsl(192, 89%, 15%)'
const WIND_COLOUR = 'hsl(192, 89%, 35%)'
const TEMP_COLOUR = 'hsl(11, 61%, 58%)'
const RAIN_COLOUR = 'hsl(185, 36%, 55%)'

// Dark-on-light chart chrome — mirrors the destinations weather charts.
const AXIS_TICK = { fill: 'rgba(0,0,0,0.6)', fontSize: 11 }
const AXIS_LINE = { stroke: 'rgba(0,0,0,0.15)' }

const selectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'white',
        borderColor: state.isFocused ? 'hsl(192 89% 25%)' : 'rgba(0,0,0,0.15)',
        borderRadius: 0,
        boxShadow: 'none',
        color: 'hsl(0 1% 15%)',
        minHeight: '2.5rem',
        '&:hover': { borderColor: 'rgba(0,0,0,0.35)' },
    }),
    singleValue: (base: any) => ({ ...base, color: 'hsl(0 1% 15%)', fontSize: '0.875rem' }),
    placeholder: (base: any) => ({ ...base, color: 'rgba(0,0,0,0.4)', fontSize: '0.875rem' }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'white',
        borderRadius: 0,
        border: '1px solid rgba(0,0,0,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected ? 'hsl(192 89% 25%)' : state.isFocused ? 'hsl(169 28% 89%)' : 'transparent',
        color: state.isSelected ? 'white' : 'hsl(0 1% 15%)',
        fontSize: '0.875rem',
        cursor: 'pointer',
    }),
    input: (base: any) => ({ ...base, color: 'hsl(0 1% 15%)' }),
    dropdownIndicator: (base: any) => ({ ...base, color: 'rgba(0,0,0,0.4)', padding: '0 8px' }),
    indicatorSeparator: (base: any) => ({ ...base, backgroundColor: 'rgba(0,0,0,0.15)' }),
}

const SpotGuideStatistics = ({ weatherRecords }: Props) => {
    const years = Object.keys(weatherRecords).map(Number).sort((a, b) => b - a)
    const currentYear = new Date().getFullYear()

    const [activeYear, setActiveYear] = useState<number>(
        years.includes(currentYear) ? currentYear : years[0]
    )
    const [activeWindUnit, setActiveWindUnit] = useState<string>('kts')

    const yearOptions: SelectOption<number>[] = years.map((y) => ({ label: y, value: y }))

    const chartData = useMemo(() => {
        const raw = weatherRecords[activeYear] ?? []
        return raw.map((r) => ({
            month: r.month,
            avgTemp: Number(r.avg_temp),
            ktsWind: Number(r.kts_wind),
            ktsGust: Number(r.kts_gust),
            mphWind: Number(r.mph_wind),
            mphGust: Number(r.mph_gust),
            kphWind: Number(r.kph_wind),
            kphGust: Number(r.kph_gust),
            // Kept null (not Number(null) = 0) so an unfetched month reads as "no data", not "dry".
            wetDays: r.wet_days ?? null,
            rainMm: r.rain_mm !== null && r.rain_mm !== undefined ? Number(r.rain_mm) : null,
        }))
    }, [weatherRecords, activeYear])

    if (!chartData.length) return null

    const handleReset = () => {
        setActiveYear(years.includes(currentYear) ? currentYear : years[0])
        setActiveWindUnit('kts')
    }

    const WindTooltip = ({ payload }: any) => {
        if (!payload?.length) return null
        const d = payload[0].payload
        return (
            <div className="bg-white border border-black/10 p-3 shadow-xl min-w-[9rem]">
                <p className="text-secondary text-xs uppercase tracking-wide border-b border-black/10 pb-2 mb-2">
                    {d.month}
                </p>
                <ul className="space-y-1.5 text-xs">
                    <li className="flex justify-between gap-4" style={{ color: GUST_COLOUR }}>
                        Gusts <span className="font-medium tabular-nums">{d[`${activeWindUnit}Gust`]} {activeWindUnit}</span>
                    </li>
                    <li className="flex justify-between gap-4" style={{ color: WIND_COLOUR }}>
                        Wind <span className="font-medium tabular-nums">{d[`${activeWindUnit}Wind`]} {activeWindUnit}</span>
                    </li>
                </ul>
            </div>
        )
    }

    const TempTooltip = ({ payload }: any) => {
        if (!payload?.length) return null
        const d = payload[0].payload
        return (
            <div className="bg-white border border-black/10 p-3 shadow-xl min-w-[9rem]">
                <p className="text-secondary text-xs uppercase tracking-wide border-b border-black/10 pb-2 mb-2">
                    {d.month}
                </p>
                <p className="flex justify-between gap-4 text-xs" style={{ color: TEMP_COLOUR }}>
                    Avg Temp <span className="font-medium tabular-nums">{d.avgTemp}°C</span>
                </p>
            </div>
        )
    }

    // Rain arrived after the first weather fetches, so older years may have none —
    // only show the rain chart for a year that actually carries it.
    const hasRain = chartData.some((row) => row.wetDays !== null)

    const RainTooltip = ({ payload }: any) => {
        if (!payload?.length) return null
        const d = payload[0].payload
        if (d.wetDays === null) return null
        return (
            <div className="bg-white border border-black/10 p-3 shadow-xl min-w-[9rem]">
                <p className="text-secondary text-xs uppercase tracking-wide border-b border-black/10 pb-2 mb-2">
                    {d.month}
                </p>
                <p className="flex justify-between gap-4 text-xs text-secondary">
                    Wet days <span className="font-medium tabular-nums">{d.wetDays}</span>
                </p>
                {d.rainMm !== null && (
                    <p className="flex justify-between gap-4 text-xs text-secondary/60 mt-1">
                        Total rain <span className="font-medium tabular-nums">{d.rainMm} mm</span>
                    </p>
                )}
            </div>
        )
    }

    return (
        <section className="bg-primary-lightest">
            {/* Section header */}
            <div className="container mx-auto pt-16 lg:pt-20 pb-10 lg:pb-12">
                <div className="flex items-start gap-4">
                    <div className="mt-2 w-1 h-12 bg-orange rounded-full shrink-0" />
                    <div>
                        <h2
                            className="font-display text-secondary leading-none tracking-wide"
                            style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}
                        >
                            Weather Statistics
                        </h2>
                        <p className="text-secondary/50 text-sm mt-2">Historical monthly averages</p>
                    </div>
                </div>
            </div>

            {/* Filter bar */}
            <div className="bg-white border-y border-secondary/10">
                <div className="container mx-auto py-4 lg:py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
                        <div className="flex items-center gap-2.5 shrink-0">
                            <Icon icon={faSlidersH} customClasses="text-primary" size="size-4" />
                            <span className="text-primary text-xs uppercase tracking-[0.2em] font-medium">Filter</span>
                        </div>
                        <div className="hidden lg:block w-px h-6 bg-secondary/15 shrink-0" />
                        <div className="lg:w-44 shrink-0">
                            <Select
                                options={yearOptions}
                                onChange={(option: any) => option && setActiveYear(Number(option.value))}
                                value={yearOptions.find((opt) => opt.value === activeYear)}
                                styles={selectStyles}
                                isSearchable={false}
                            />
                        </div>
                        <div className="lg:w-44 shrink-0">
                            <Select
                                options={unitOptions}
                                onChange={(option: any) => option && setActiveWindUnit(option.value)}
                                value={unitOptions.find(({ value }) => value === activeWindUnit)}
                                styles={selectStyles}
                                isSearchable={false}
                            />
                        </div>
                        <button
                            className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 border border-secondary/25 text-secondary/70 hover:text-secondary hover:border-secondary/50 text-xs uppercase tracking-wide transition-all duration-200"
                            onClick={handleReset}
                        >
                            <Icon icon={faRotateLeft} size="size-3.5" />
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="container mx-auto py-10 lg:py-14 space-y-8">
                {/* Wind chart */}
                <div className="bg-white border border-black/10 p-6 lg:p-8 space-y-6">
                    <ChartHeading title="Average Wind Statistics" subtitle={`Monthly wind & gust averages · ${activeYear}`} />
                    <div className="h-[22rem]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                                <XAxis dataKey="month" interval={0} angle={-45} textAnchor="end" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
                                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE}
                                    label={{ value: activeWindUnit.charAt(0).toUpperCase() + activeWindUnit.slice(1), angle: -90, position: 'insideLeft', fill: 'rgba(0,0,0,0.5)', fontSize: 11 }}
                                />
                                <Tooltip content={<WindTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                                <Bar dataKey={`${activeWindUnit}Gust`} name="Gusts" fill={GUST_COLOUR} radius={[2, 2, 0, 0]} />
                                <Bar dataKey={`${activeWindUnit}Wind`} name="Wind" fill={WIND_COLOUR} radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-secondary/50 text-xs leading-relaxed border-t border-black/10 pt-4">
                        <strong className="text-secondary">Note:</strong> Wind data from nearby weather stations via the{' '}
                        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-primary transition-colors">
                            Open-Meteo API
                        </a>. Long-term averages — actual conditions may vary.
                    </p>
                </div>

                {/* Temperature chart */}
                <div className="bg-white border border-black/10 p-6 lg:p-8 space-y-6">
                    <ChartHeading title="Average Temperature" subtitle={`Monthly temperature averages · ${activeYear}`} />
                    <div className="h-[22rem]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                                <XAxis dataKey="month" interval={0} angle={-45} textAnchor="end" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
                                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE}
                                    label={{ value: '°C', angle: -90, position: 'insideLeft', fill: 'rgba(0,0,0,0.5)', fontSize: 11 }}
                                />
                                <Tooltip content={<TempTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                                <Bar dataKey="avgTemp" fill={TEMP_COLOUR} radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Rainfall chart */}
                {hasRain && (
                    <div className="bg-white border border-black/10 p-6 lg:p-8 space-y-6">
                        <ChartHeading title="Wet Days" subtitle={`Days with 3 mm+ of rain between 9am and 7pm · ${activeYear}`} />
                        <div className="h-[22rem]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 50 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                                    <XAxis dataKey="month" interval={0} angle={-45} textAnchor="end" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
                                    <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE}
                                        label={{ value: 'Days', angle: -90, position: 'insideLeft', fill: 'rgba(0,0,0,0.5)', fontSize: 11 }}
                                    />
                                    <Tooltip content={<RainTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                                    <Bar dataKey="wetDays" fill={RAIN_COLOUR} radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

export default SpotGuideStatistics
