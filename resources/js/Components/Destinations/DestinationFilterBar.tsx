// resources/js/Components/Destinations/DestinationFilterBar.tsx
//
// Top-of-page search-style filter bar for the destinations index. Drives the
// card ranking/layout AND the charts below, and is mirrored to the URL. All
// state lives in the parent; this component is presentational (props in,
// onChange out).

import { useState } from 'react'
import Select from 'react-select'
import Icon from '@/Components/Common/Icon'
import { faSlidersH, faChevronDown, faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { MIN_OPTIONS, snapToUnitOption, unitToKts, type WindUnit } from '@/Helpers/sailableDays'
import { TEMP_OPTIONS, type DestinationFilters, type GroupBy } from '@/Helpers/destinationFilters'
import type { SelectOption } from '@/Helpers/selectTypes'

// react-select styling reused from the old FilterDataset (brand teal, square corners).
const selectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'white',
        borderColor: state.isFocused ? 'hsl(192 89% 25%)' : 'rgba(0,0,0,0.15)',
        borderRadius: 0,
        boxShadow: 'none',
        color: 'hsl(0 1% 15%)',
        minHeight: '2.75rem',
        '&:hover': { borderColor: 'rgba(0,0,0,0.35)' },
    }),
    singleValue: (base: any) => ({ ...base, color: 'hsl(0 1% 15%)', fontSize: '0.875rem' }),
    multiValue: (base: any) => ({
        ...base,
        backgroundColor: 'hsl(169 28% 89%)',
        borderRadius: 0,
    }),
    multiValueLabel: (base: any) => ({ ...base, color: 'hsl(192 89% 20%)', fontSize: '0.75rem' }),
    multiValueRemove: (base: any) => ({
        ...base,
        color: 'hsl(192 89% 30%)',
        ':hover': { backgroundColor: 'hsl(185 36% 70%)', color: 'hsl(192 89% 15%)' },
    }),
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
        backgroundColor: state.isSelected
            ? 'hsl(192 89% 25%)'
            : state.isFocused
                ? 'hsl(169 28% 89%)'
                : 'transparent',
        color: state.isSelected ? 'white' : 'hsl(0 1% 15%)',
        fontSize: '0.875rem',
        cursor: 'pointer',
    }),
    input: (base: any) => ({ ...base, color: 'hsl(0 1% 15%)' }),
    dropdownIndicator: (base: any) => ({ ...base, color: 'rgba(0,0,0,0.4)', padding: '0 8px' }),
    clearIndicator: (base: any) => ({ ...base, color: 'rgba(0,0,0,0.4)', padding: '0 8px' }),
    indicatorSeparator: (base: any) => ({ ...base, backgroundColor: 'rgba(0,0,0,0.15)' }),
    valueContainer: (base: any) => ({ ...base, padding: '2px 10px' }),
} as any

interface Props {
    monthOptions: { label: string; value: number }[]
    groupOptions: { label: string; value: GroupBy }[]
    destinationOptions: SelectOption[]
    filters: DestinationFilters
    onChange: (next: DestinationFilters) => void
    /** Return every filter to its fresh-visit default. */
    onReset: () => void
    /** False when the filters are already at their defaults (the reset button is then disabled). */
    canReset: boolean
}

/**
 * Render the destinations filter bar (Month / Group by / Spots / Unit / Minimum / Reset).
 */
const DestinationFilterBar = ({ monthOptions, groupOptions, destinationOptions, filters, onChange, onReset, canReset }: Props) => {
    const unitOptions: { label: string; value: WindUnit }[] = [
        { label: 'kts', value: 'kts' }, { label: 'mph', value: 'mph' }, { label: 'kph', value: 'kph' },
    ]
    const minOptions = MIN_OPTIONS[filters.unit].map((value) => ({ label: `${value} ${filters.unit}`, value }))
    // 0 = "Any" (the opt-in filter is off) — everything above is a °C floor.
    const tempOptions = TEMP_OPTIONS.map((value) => ({ label: value === 0 ? 'Any' : `${value}°C`, value }))

    const isAllSpots = filters.spots.length === 0
    const selectedSpotOptions = destinationOptions.filter((opt) => filters.spots.includes(opt.value))

    /** When the unit changes, preserve the wind strength by snapping the current minimum into the new unit. */
    const handleUnitChange = (unit: WindUnit) => {
        const currentKts = unitToKts(filters.min, filters.unit)
        onChange({ ...filters, unit, min: snapToUnitOption(currentKts, unit) })
    }

    // Mobile-only collapse: on small screens the five stacked controls take up
    // too much of the sticky bar, so they're hidden behind a tap-to-expand
    // header. Desktop (lg+) always shows the inline row, unaffected by this.
    const [isExpanded, setIsExpanded] = useState(false)

    // One-line summary of the active filters, shown in the collapsed mobile
    // header so the current selection is visible without expanding.
    const monthLabel = monthOptions.find((opt) => opt.value === filters.month)?.label ?? ''
    const groupLabel = groupOptions.find((opt) => opt.value === filters.group)?.label ?? ''
    const spotsLabel = isAllSpots
        ? 'All spots'
        : `${filters.spots.length} spot${filters.spots.length === 1 ? '' : 's'}`
    // Temp is opt-in (default 0/Any), so it only joins the summary once set —
    // otherwise every collapsed header would read "· Any" for no reason.
    const tempSummary = filters.minTemp > 0 ? ` · ≥${filters.minTemp}°C` : ''
    const filterSummary = `${monthLabel} · ${filters.min} ${filters.unit} · ${spotsLabel} · ${groupLabel}${tempSummary}`

    return (
        <div className="bg-white border-y border-secondary/10 sticky top-0 z-20">
            <div className="container mx-auto py-4 lg:py-5">
                {/* Mobile-only header: tap to expand/collapse the controls. Hidden on lg+. */}
                <button
                    type="button"
                    onClick={() => setIsExpanded((open) => !open)}
                    aria-expanded={isExpanded}
                    aria-controls="destination-filter-controls"
                    className="flex w-full items-center justify-between gap-3 lg:hidden"
                >
                    <span className="flex items-center gap-2.5 shrink-0">
                        <Icon icon={faSlidersH} customClasses="text-primary" size="size-4" />
                        <span className="text-primary text-xs uppercase tracking-[0.2em] font-medium">Find your spot</span>
                    </span>
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="text-secondary/60 text-xs truncate">{filterSummary}</span>
                        <Icon
                            icon={faChevronDown}
                            size="size-3.5"
                            customClasses={`text-secondary/50 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                    </span>
                </button>

                <div
                    id="destination-filter-controls"
                    className={`${isExpanded ? 'flex' : 'hidden'} lg:flex flex-col gap-4 mt-4 lg:mt-0 lg:flex-row lg:items-end lg:gap-5`}
                >
                    {/* Desktop-only inline label (the mobile header above carries it on small screens). */}
                    <div className="hidden lg:flex items-center gap-2.5 shrink-0 lg:pb-2.5">
                        <Icon icon={faSlidersH} customClasses="text-primary" size="size-4" />
                        <span className="text-primary text-xs uppercase tracking-[0.2em] font-medium">Find your spot</span>
                    </div>

                    <div className="flex flex-col lg:w-36 shrink-0">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-secondary/50 mb-1">Month</label>
                        <Select
                            options={monthOptions}
                            value={monthOptions.find((opt) => opt.value === filters.month)}
                            onChange={(opt: any) => opt && onChange({ ...filters, month: Number(opt.value) })}
                            styles={selectStyles}
                            isSearchable={false}
                        />
                    </div>

                    <div className="flex flex-col lg:w-40 shrink-0">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-secondary/50 mb-1">Group by</label>
                        <Select
                            options={groupOptions}
                            value={groupOptions.find((opt) => opt.value === filters.group)}
                            onChange={(opt: any) => opt && onChange({ ...filters, group: opt.value as GroupBy })}
                            styles={selectStyles}
                            isSearchable={false}
                        />
                    </div>

                    <div className="flex flex-col flex-1 min-w-0">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-secondary/50 mb-1">Destinations</label>
                        <Select
                            isMulti
                            options={destinationOptions}
                            value={isAllSpots ? null : selectedSpotOptions}
                            placeholder="All destinations"
                            onChange={(opts: any) => onChange({ ...filters, spots: (opts ?? []).map((opt: SelectOption) => opt.value) })}
                            styles={selectStyles}
                        />
                    </div>

                    <div className="flex flex-col lg:w-28 shrink-0">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-secondary/50 mb-1">Unit</label>
                        <Select
                            options={unitOptions}
                            value={unitOptions.find((opt) => opt.value === filters.unit)}
                            onChange={(opt: any) => opt && handleUnitChange(opt.value as WindUnit)}
                            styles={selectStyles}
                            isSearchable={false}
                        />
                    </div>

                    <div className="flex flex-col lg:w-36 shrink-0">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-secondary/50 mb-1">Min. wind</label>
                        <Select
                            options={minOptions}
                            value={minOptions.find((opt) => opt.value === filters.min) ?? minOptions[0]}
                            onChange={(opt: any) => opt && onChange({ ...filters, min: Number(opt.value) })}
                            styles={selectStyles}
                            isSearchable={false}
                        />
                    </div>

                    <div className="flex flex-col lg:w-32 shrink-0">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-secondary/50 mb-1">Min. temp</label>
                        <Select
                            options={tempOptions}
                            value={tempOptions.find((opt) => opt.value === filters.minTemp) ?? tempOptions[0]}
                            onChange={(opt: any) => opt && onChange({ ...filters, minTemp: Number(opt.value) })}
                            styles={selectStyles}
                            isSearchable={false}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={onReset}
                        disabled={!canReset}
                        className="flex items-center justify-center gap-2 shrink-0 min-h-[2.75rem] px-4 border border-secondary/15 text-secondary text-xs uppercase tracking-wide transition-colors duration-200 hover:border-primary hover:text-primary disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <Icon icon={faRotateLeft} size="size-3.5" />
                        <span>Reset</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default DestinationFilterBar
