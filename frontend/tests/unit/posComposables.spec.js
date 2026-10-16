/**
 * Logique pure de l'outil POS : filtres des PdV, choix de l'évènement, sélection des moyens de
 * paiement, URL de la caisse, fiche PIN imprimable (échappement).
 */
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }))

import { matchesPdvSearch, countBy, usePosPdvFilters } from '@/composables/usePosPdvFilters'
import { pickPosEventId } from '@/composables/usePosPage'
import { nextPaymentSelection, buildSettingsPayload } from '@/composables/usePosSettings'
import { posCashierUrl } from '@/composables/usePosPdvActions'
import { buildPinSheetHtml, printablePdvs } from '@/composables/usePosPinSheet'
import { pdvSourceCodes } from '@/composables/usePosFormat'

const pdvs = [
  { elementId: 'a', name: 'Buvette Nord', type: 'Buvette', spaceMenuLabel: 'Standard', zoneLabel: 'Nord', status: 'selling', pin: '111111', qrSlug: 'qa' },
  { elementId: 'b', name: 'Kiosque Parvis', type: 'Kiosque', spaceMenuLabel: 'Snacking', zoneLabel: 'Parvis', status: 'inactive', pin: '222222', qrSlug: 'qb' },
  { elementId: 'c', name: 'Buvette Sud', type: 'Buvette', spaceMenuLabel: 'Standard', zoneLabel: 'Sud', status: 'ready', pin: null, qrSlug: 'qc' },
]

describe('filtres des PdV', () => {
  it('recherche sur le nom, le Space Menu et la zone', () => {
    expect(matchesPdvSearch(pdvs[1], 'snack')).toBe(true)
    expect(matchesPdvSearch(pdvs[1], 'nord')).toBe(false)
    expect(matchesPdvSearch(pdvs[0], '')).toBe(true)
  })

  it('options déduites des PdV avec leur effectif', () => {
    expect(countBy(pdvs, 'type')).toEqual([{ value: 'Buvette', count: 2 }, { value: 'Kiosque', count: 1 }])
  })

  it('combine type, statut et compteurs actives / inactives', () => {
    const f = usePosPdvFilters(pdvs)
    f.toggleType('Buvette')
    expect(f.shown.value.map((p) => p.elementId)).toEqual(['a', 'c'])
    expect(f.activeCount.value).toBe(2)
    expect(f.inactiveCount.value).toBe(0)
    f.toggleType('Kiosque')
    f.toggleStatus('inactive')
    expect(f.shown.value.map((p) => p.elementId)).toEqual(['b'])
    f.reset()
    expect(f.shown.value).toHaveLength(3)
  })
})

describe('évènement sélectionné', () => {
  const events = [{ id: 'e1', status: 'upcoming' }, { id: 'e2', status: 'live' }]
  it('privilégie l URL, sinon l évènement en cours, sinon le premier', () => {
    expect(pickPosEventId(events, 'e1')).toBe('e1')
    expect(pickPosEventId(events, 'inconnu')).toBe('e2')
    expect(pickPosEventId([events[0]], null)).toBe('e1')
    expect(pickPosEventId([], 'e1')).toBeNull()
  })
})

describe('réglages de caisse', () => {
  it('liste vide = tous les moyens actifs ; décocher un moyen restreint la liste', () => {
    expect(nextPaymentSelection([], ['m1', 'm2', 'm3'], 'm2')).toEqual(['m1', 'm3'])
    expect(nextPaymentSelection(['m1', 'm3'], ['m1', 'm2', 'm3'], 'm2')).toEqual([])
  })

  it('refuse de décocher le dernier moyen', () => {
    expect(nextPaymentSelection(['m1'], ['m1', 'm2'], 'm1')).toBeNull()
  })

  it('le corps envoyé est complet, borné, avec les valeurs par défaut', () => {
    expect(buildSettingsPayload(null, { tipsEnabled: true, lowStockUnits: 99999 })).toEqual({
      paymentMethodIds: [], promosEnabled: true, cancelEnabled: true, lowStockUnits: 9999, tipsEnabled: true,
    })
  })
})

describe('caisse et fiches PIN', () => {
  it('construit l URL de connexion invité du PdV', () => {
    expect(posCashierUrl('abc', 'https://app.test')).toBe('https://app.test/login/pin/abc')
  })

  it('sources : la caisse démarrée s ajoute aux autres', () => {
    expect(pdvSourceCodes({ status: 'selling', otherSources: ['WEEZEVENT'] })).toEqual(['POS', 'WEEZEVENT'])
    expect(pdvSourceCodes({ status: 'inactive', otherSources: ['DIGIFOOD'] })).toEqual(['DIGIFOOD'])
    expect(pdvSourceCodes({ status: 'inactive' })).toEqual([])
  })

  it('imprime les caisses démarrées avec PIN, ou tous les PdV avec PIN', () => {
    expect(printablePdvs(pdvs).map((p) => p.elementId)).toEqual(['a'])
    expect(printablePdvs(pdvs, { startedOnly: false }).map((p) => p.elementId)).toEqual(['a', 'b'])
  })

  it('échappe le HTML de la fiche', () => {
    const html = buildPinSheetHtml({
      title: 'Fiches <b>', pinLabel: 'PIN',
      cards: [{ name: '<script>x</script>', pin: '123456', url: 'https://x/y?a=1&b=2', qr: 'data:image/png;base64,AAA' }],
    })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a=1&amp;b=2')
    expect(html).toContain('123456')
  })
})
