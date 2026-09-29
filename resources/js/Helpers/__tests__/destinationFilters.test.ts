import { describe, it, expect } from 'vitest'
import { parseFilters, filtersToQuery, defaultFilters, hasActiveFilters, type DestinationFilters } from '@/Helpers/destinationFilters'

describe('destination filters URL sync', () => {
    it('falls back to defaults on an empty query', () => {
        const filters = parseFilters('', { month: 7 })
        expect(filters).toEqual({ month: 7, min: 20, unit: 'kts', group: 'continent', spots: [], minTemp: 0 })
    })

    it('parses a full query string', () => {
        const filters = parseFilters('?month=8&min=25&unit=mph&group=global&spots=vassiliki,tarifa&temp=20', { month: 7 })
        expect(filters).toEqual({ month: 8, min: 25, unit: 'mph', group: 'global', spots: ['vassiliki', 'tarifa'], minTemp: 20 })
    })

    it('round-trips filters through query and back', () => {
        const original: DestinationFilters = { month: 3, min: 30, unit: 'kph', group: 'country', spots: ['dahab'], minTemp: 15 }
        const restored = parseFilters('?' + new URLSearchParams(filtersToQuery(original)).toString(), { month: 7 })
        expect(restored).toEqual(original)
    })

    it('ignores invalid values and clamps to defaults', () => {
        const filters = parseFilters('?month=99&unit=furlongs&group=nonsense', { month: 7 })
        expect(filters.month).toBe(7)
        expect(filters.unit).toBe('kts')
        expect(filters.group).toBe('continent')
    })

    it('rejects an off-grid min for the resolved unit, falling back to the default', () => {
        expect(parseFilters('?min=17&unit=kts', { month: 7 }).min).toBe(20)
        expect(parseFilters('?min=999&unit=mph', { month: 7 }).min).toBe(20)
    })

    it('still accepts a valid on-grid, non-default min', () => {
        expect(parseFilters('?min=35&unit=kts', { month: 7 }).min).toBe(35)
    })

    // why: minTemp is an opt-in filter (default 0 = off) so cold-water spots
    // aren't penalised unless the user explicitly asks for a warmer minimum —
    // an off-grid value (not one of TEMP_OPTIONS) must fall back to "Any", not
    // to some nearest-neighbour guess that could silently apply a filter.
    it('accepts an on-grid minTemp and rejects an off-grid one, falling back to Any (0)', () => {
        expect(parseFilters('?temp=20', { month: 7 }).minTemp).toBe(20)
        expect(parseFilters('?temp=17', { month: 7 }).minTemp).toBe(0)
    })

    it('omits temp from the query when minTemp is 0 (Any), includes it otherwise', () => {
        const withoutTemp = filtersToQuery({ month: 7, min: 20, unit: 'kts', group: 'continent', spots: [], minTemp: 0 })
        expect(withoutTemp.temp).toBeUndefined()

        const withTemp = filtersToQuery({ month: 7, min: 20, unit: 'kts', group: 'continent', spots: [], minTemp: 20 })
        expect(withTemp.temp).toBe('20')
    })
})

describe('destination filters reset', () => {
    it('builds the default filter state for a month', () => {
        expect(defaultFilters(4)).toEqual({ month: 4, min: 20, unit: 'kts', group: 'continent', spots: [], minTemp: 0 })
    })

    it('treats untouched filters as default and any change as active', () => {
        expect(hasActiveFilters(defaultFilters(4), 4)).toBe(false)
        expect(hasActiveFilters({ ...defaultFilters(4), month: 5 }, 4)).toBe(true)
        expect(hasActiveFilters({ ...defaultFilters(4), spots: ['tarifa'] }, 4)).toBe(true)
        expect(hasActiveFilters({ ...defaultFilters(4), minTemp: 15 }, 4)).toBe(true)
        expect(hasActiveFilters({ ...defaultFilters(4), group: 'global' }, 4)).toBe(true)
    })
})
