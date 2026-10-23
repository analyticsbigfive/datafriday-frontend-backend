import { t as translate } from '@/i18n/translations'
import { countText, isSingular, noScopeTitleKey, pluralKey, tableHintKey } from '@/utils/costTrackingCopy'

const t = (k) => k

describe('costTrackingCopy', () => {
  it('français : 0 et 1 au singulier, 2 au pluriel', () => {
    expect([0, 1, 2].map((n) => isSingular(n, 'fr'))).toEqual([true, true, false])
  })
  it('anglais : seul 1 au singulier', () => {
    expect([0, 1, 2].map((n) => isSingular(n, 'en'))).toEqual([false, true, false])
  })
  it('pluralKey choisit la bonne clé', () => {
    expect(pluralKey(0, 'fr', 'one', 'many')).toBe('one')
    expect(pluralKey(0, 'en', 'one', 'many')).toBe('many')
  })
  it('countText suit le mode et la langue', () => {
    expect(countText(0, 'supplier', t, 'fr')).toBe('0 ctNounSupplierOne')
    expect(countText(0, 'supplier', t, 'en')).toBe('0 ctNounSupplierMany')
    expect(countText(3, 'category', t, 'fr')).toBe('3 ctNounCategoryMany')
  })
  it('aide du tableau et message vide propres à chaque mode', () => {
    const modes = ['article', 'category', 'type', 'supplier', 'component', 'ingredient']
    expect(new Set(modes.map(tableHintKey)).size).toBe(6)
    expect(new Set(modes.map(noScopeTitleKey)).size).toBe(6)
    expect(noScopeTitleKey('supplier')).toBe('ctNoScopeTitleSupplier')
  })
  it('mode inconnu : retombe sur article', () => {
    expect(tableHintKey('zzz')).toBe('ctTableHint')
  })

  it('libellés de la bascule sans « Par » (FR) ni « By » (EN)', () => {
    for (const k of ['Article', 'Category', 'Type', 'Supplier', 'Component', 'Ingredient']) {
      expect(translate(`ctGroup${k}`, 'fr')).not.toMatch(/^Par /)
      expect(translate(`ctGroup${k}`, 'en')).not.toMatch(/^By /)
    }
  })
  it('toutes les clés de texte par mode existent en FR et EN', () => {
    const modes = ['article', 'category', 'type', 'supplier', 'component', 'ingredient']
    const keys = [...modes.map(tableHintKey), ...modes.map(noScopeTitleKey), 'ctBannerVersionsOne', 'ctBannerVersionsMany']
    for (const locale of ['fr', 'en']) {
      for (const key of keys) expect(translate(key, locale)).not.toBe(key)
    }
  })
})
