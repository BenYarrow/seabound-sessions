import { describe, it, expect } from 'vitest'
import { prepareClimateData, climateTempForMonth, climateWetDaysForMonth, type ClimateDataset } from '@/Helpers/climate'

describe('prepareClimateData', () => {
    const dataset: ClimateDataset = {
        Tarifa: [
            { month: 'July', avgTemp: 26, ktsWind: 18, ktsGust: 22, mphWind: 21, mphGust: 25, kphWind: 33, kphGust: 41 },
            { month: 'August', avgTemp: 28, ktsWind: 21, ktsGust: 26, mphWind: 24, mphGust: 30, kphWind: 39, kphGust: 48 },
        ],
        Dahab: [
            { month: 'August', avgTemp: 33, ktsWind: 15, ktsGust: 19, mphWind: 17, mphGust: 22, kphWind: 28, kphGust: 35 },
        ],
    }

    it('pivots a datapoint to month rows keyed by title', () => {
        const rows = prepareClimateData(dataset, 'ktsWind')
        const august = rows.find((row) => row.month === 'August')
        expect(august).toEqual({ month: 'August', Tarifa: 21, Dahab: 15 })
        const july = rows.find((row) => row.month === 'July')
        expect(july).toEqual({ month: 'July', Tarifa: 18 })
    })
})

describe('climateTempForMonth', () => {
    const dataset: ClimateDataset = {
        Tarifa: [
            { month: 'July', avgTemp: 26, ktsWind: 18, ktsGust: 22, mphWind: 21, mphGust: 25, kphWind: 33, kphGust: 41 },
            { month: 'August', avgTemp: 28, ktsWind: 21, ktsGust: 26, mphWind: 24, mphGust: 30, kphWind: 39, kphGust: 48 },
        ],
        Dahab: [
            { month: 'August', avgTemp: 33, ktsWind: 15, ktsGust: 19, mphWind: 17, mphGust: 22, kphWind: 28, kphGust: 35 },
        ],
    }

    it('returns the typical temp for a spot and month that are present', () => {
        expect(climateTempForMonth(dataset, 'Tarifa', 'August')).toBe(28)
    })

    it('returns null for a month absent from a spot that has other months', () => {
        expect(climateTempForMonth(dataset, 'Dahab', 'July')).toBeNull()
    })

    it('returns null for a spot absent from the dataset entirely', () => {
        expect(climateTempForMonth(dataset, 'Brouwersdam', 'August')).toBeNull()
    })
})

describe('climateWetDaysForMonth', () => {
    const dataset: ClimateDataset = {
        Tarifa: [
            { month: 'January', avgTemp: 14, ktsWind: 12, ktsGust: 18, mphWind: 14, mphGust: 21, kphWind: 22, kphGust: 33, rainMm: 90, wetDays: 7.4 },
            { month: 'February', avgTemp: 15, ktsWind: 12, ktsGust: 18, mphWind: 14, mphGust: 21, kphWind: 22, kphGust: 33, rainMm: null, wetDays: null },
        ],
    }

    it('returns the typical wet-day count for a spot and month', () => {
        expect(climateWetDaysForMonth(dataset, 'Tarifa', 'January')).toBe(7.4)
    })

    it('returns null when rain has not been fetched, the month is absent, or the spot is unknown', () => {
        expect(climateWetDaysForMonth(dataset, 'Tarifa', 'February')).toBeNull()
        expect(climateWetDaysForMonth(dataset, 'Tarifa', 'March')).toBeNull()
        expect(climateWetDaysForMonth(dataset, 'Nowhere', 'January')).toBeNull()
    })
})
