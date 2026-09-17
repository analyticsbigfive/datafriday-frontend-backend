import { staffSliderBounds } from '@/utils/staffScheduleBounds'

const toMin = (v) => Number(v)

describe('staffSliderBounds', () => {
  it('fenêtre suggérée seule quand toutes les lignes sont dedans', () => {
    const elements = [{ lines: [{ startTime: 800, endTime: 1300 }] }]
    expect(staffSliderBounds({ min: 795, max: 1370 }, elements, toMin)).toEqual({ min: 795, max: 1370 })
  })

  it("s'élargit à une ligne qui déborde (modifiée à la main avant le changement d'heures)", () => {
    const elements = [
      { lines: [{ startTime: 0, endTime: 1550 }] },
      { lines: [{ startTime: 900, endTime: 1200 }, { startTime: null, endTime: null }] },
    ]
    expect(staffSliderBounds({ min: 795, max: 1370 }, elements, toMin)).toEqual({ min: 0, max: 1550 })
  })

  it('sans éléments : la base', () => {
    expect(staffSliderBounds({ min: 10, max: 20 }, null, toMin)).toEqual({ min: 10, max: 20 })
  })
})
