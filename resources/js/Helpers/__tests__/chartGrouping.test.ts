import { describe, it, expect } from 'vitest'
import { groupRankedSpots, groupClimate } from '@/Helpers/chartGrouping'
import type { RankedSpot } from '@/Helpers/sailableDays'
import type { ClimateDataset, ClimateMonth } from '@/Helpers/climate'

const twelve = (value: number) => Array.from({ length: 12 }, () => value)

const groupOf = (title: string): string | null =>
    ({ Tarifa: 'Spain', Fuerteventura: 'Spain', Dahab: 'Egypt', Nowhere: null } as Record<string, string | null>)[title] ?? null

const climateMonth = (month: string, wind: number, temp: number): ClimateMonth => ({
    month, avgTemp: temp, ktsWind: wind, ktsGust: wind + 5, mphWind: wind, mphGust: wind, kphWind: wind, kphGust: wind,
})

describe('groupRankedSpots', () => {
    it('returns the spots untouched when grouping by spot', () => {
        const ranked: RankedSpot[] = [{ title: 'Tarifa', avgDaysThisMonth: 10, daysPerMonth: twelve(10) }]
        expect(groupRankedSpots(ranked, 'spot', groupOf)).toBe(ranked)
    })

    it('averages member spots per month and ranks groups by the selected month', () => {
        const ranked: RankedSpot[] = [
            { title: 'Dahab', avgDaysThisMonth: 20, daysPerMonth: twelve(20) },
            { title: 'Tarifa', avgDaysThisMonth: 10, daysPerMonth: twelve(10) },
            { title: 'Fuerteventura', avgDaysThisMonth: 40, daysPerMonth: twelve(40) },
        ]
        const grouped = groupRankedSpots(ranked, 'country', groupOf)
        expect(grouped.map((row) => row.title)).toEqual(['Spain', 'Egypt'])
        expect(grouped[0].avgDaysThisMonth).toBe(25)
        expect(grouped[0].daysPerMonth).toEqual(twelve(25))
    })

    it('drops spots with no group (no country assigned)', () => {
        const ranked: RankedSpot[] = [{ title: 'Nowhere', avgDaysThisMonth: 5, daysPerMonth: twelve(5) }]
        expect(groupRankedSpots(ranked, 'country', groupOf)).toEqual([])
    })
})

describe('groupClimate', () => {
    it('averages each month across the group members that hold it, to 1 dp', () => {
        const climate: ClimateDataset = {
            Tarifa: [climateMonth('January', 10, 14), climateMonth('February', 12, 15)],
            Fuerteventura: [climateMonth('January', 15, 19)],
            Dahab: [climateMonth('January', 18, 22)],
        }
        const grouped = groupClimate(climate, ['Tarifa', 'Fuerteventura', 'Dahab'], 'country', groupOf)
        expect(Object.keys(grouped).sort()).toEqual(['Egypt', 'Spain'])
        // No member holds rain data here, so the group's rain is null (unknown), not 0.
        expect(grouped.Spain).toEqual([
            { ...climateMonth('January', 12.5, 16.5), ktsGust: 17.5, rainMm: null, wetDays: null },
            { ...climateMonth('February', 12, 15), rainMm: null, wetDays: null },
        ])
    })

    it('only uses the active titles, and passes through per-spot when grouping by spot', () => {
        const climate: ClimateDataset = {
            Tarifa: [climateMonth('January', 10, 14)],
            Dahab: [climateMonth('January', 18, 22)],
        }
        expect(Object.keys(groupClimate(climate, ['Tarifa'], 'country', groupOf))).toEqual(['Spain'])
        expect(groupClimate(climate, ['Tarifa'], 'spot', groupOf)).toEqual({ Tarifa: climate.Tarifa })
    })

    it('averages rainfall over the members that have it, and leaves it null when none do', () => {
        const climate: ClimateDataset = {
            Tarifa: [{ ...climateMonth('January', 10, 14), rainMm: 80, wetDays: 8 }],
            Fuerteventura: [{ ...climateMonth('January', 10, 14), rainMm: null, wetDays: null }],
            Dahab: [{ ...climateMonth('January', 10, 14), rainMm: null, wetDays: null }],
        }
        const grouped = groupClimate(climate, ['Tarifa', 'Fuerteventura', 'Dahab'], 'country', groupOf)
        expect(grouped.Spain[0].rainMm).toBe(80)
        expect(grouped.Spain[0].wetDays).toBe(8)
        expect(grouped.Egypt[0].rainMm).toBeNull()
        expect(grouped.Egypt[0].wetDays).toBeNull()
    })
})
