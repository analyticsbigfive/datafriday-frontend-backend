import { oklchToRgb, replaceOklch } from '@/utils/oklchFallback'

// Valeurs de référence : tokens Tailwind v4 tels qu'ils figurent dans
// src/index.css, comparés à leur rendu sRGB officiel.
describe('oklchToRgb', () => {
  it('convertit les tokens Tailwind v4 exactement', () => {
    expect(oklchToRgb(0.637, 0.237, 25.331)).toBe('rgb(251, 44, 54)') // red-500
    expect(oklchToRgb(0.551, 0.027, 264.364)).toBe('rgb(106, 114, 130)') // gray-500
  })

  it('borne les extrêmes sans déborder de 0..255', () => {
    expect(oklchToRgb(1, 0, 0)).toBe('rgb(255, 255, 255)')
    expect(oklchToRgb(0, 0, 0)).toBe('rgb(0, 0, 0)')
  })

  it('rend rgba() dès que alpha < 1', () => {
    expect(oklchToRgb(0.637, 0.237, 25.331, 0.5)).toBe('rgba(251, 44, 54, 0.5)')
  })
})

describe('replaceOklch', () => {
  it('remplace une couleur simple', () => {
    expect(replaceOklch('oklch(.637 .237 25.331)')).toBe('rgb(251, 44, 54)')
  })

  it('accepte la luminance en pourcentage', () => {
    expect(replaceOklch('oklch(63.7% .237 25.331)')).toBe('rgb(251, 44, 54)')
  })

  it('lit l’alpha derrière le slash', () => {
    expect(replaceOklch('oklch(.637 .237 25.331 / 0.5)')).toBe('rgba(251, 44, 54, 0.5)')
  })

  it('traite toutes les occurrences d’un dégradé', () => {
    const out = replaceOklch(
      'linear-gradient(180deg, oklch(1 0 0) 0%, oklch(0 0 0) 100%)',
    )
    expect(out).toBe('linear-gradient(180deg, rgb(255, 255, 255) 0%, rgb(0, 0, 0) 100%)')
  })

  it('laisse intactes les valeurs sans oklch', () => {
    expect(replaceOklch('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
    expect(replaceOklch('#ff3131')).toBe('#ff3131')
  })
})
