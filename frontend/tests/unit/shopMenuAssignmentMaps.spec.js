/**
 * BUG-387-02 — cocher un article ou ouvrir un PDV dans Event Predict ne doit plus
 * relire le menu de TOUS les PdV de la config (1 + N requêtes, 3 en vol, 53 éléments
 * PdV sur Stade Jean Bouin). Le delta est connu : seul le PdV touché est reconstruit,
 * en mémoire, par la MÊME dérivation que le chargement complet.
 *
 * Ce qui est verrouillé ici :
 *  - la dérivation des 4 index (auto-sélectionnables, liste affichée, appartenance,
 *    indisponibilité), y compris ses deux gardes anti-backend-legacy ;
 *  - le patch d'UN shop qui ne touche pas les autres, et qui SUPPRIME la clé quand
 *    le PdV n'a plus d'article activé (un Set vide se lirait comme « chargé, vide ») ;
 *  - le repli : un article hors roster (cas du remap) n'est PAS patchable, l'appelant
 *    doit refetcher.
 */
import {
  applyEnabledChanges,
  deriveShopMenuEntry,
  patchShopMenuMaps,
} from '@/utils/shopMenuAssignmentMaps'

// Extrait réel du tiroir Space Menu : Coca OK, Cookie sans recette (indisponible),
// Café sans fournisseur (indisponible), Frites assignée mais désactivée.
const items = () => [
  { id: 'mi-coca', name: 'Coca-Cola', enabled: true, assigned: true, available: true, basePrice: 3 },
  { id: 'mi-cookie', name: 'Cookie', enabled: true, assigned: true, available: false, hasRecipe: false, missingIngredients: [] },
  {
    id: 'mi-cafe', name: 'Café', enabled: false, assigned: true, available: false, hasRecipe: true,
    missingIngredients: [{ kind: 'ingredient', name: 'Café grains', reason: 'NO_SUPPLIER' }],
  },
  { id: 'mi-frites', name: 'Frites', enabled: false, assigned: true, available: true },
]

describe('deriveShopMenuEntry', () => {
  it('auto-sélectionnables = activés ET disponibles', () => {
    const e = deriveShopMenuEntry(items())
    expect([...e.enabledIds]).toEqual(['mi-coca'])
  })

  it('liste affichée = activés + assignés-désactivés-improduisibles', () => {
    const e = deriveShopMenuEntry(items())
    // Café est désactivé mais improduisible : il doit rester visible avec sa raison,
    // et non basculer en « Non attachés » avec le flux réactiver.
    expect(e.displayItems.map((i) => i.id).sort()).toEqual(['mi-cafe', 'mi-coca', 'mi-cookie'])
    expect(e.displayItems.find((i) => i.id === 'mi-cafe').missingIngredients).toEqual(['Café grains'])
  })

  it('appartenance = TOUT le menu du shop, activé ou non', () => {
    const e = deriveShopMenuEntry(items())
    expect(e.membership.ids.size).toBe(4)
    expect(e.unavailable.ids.has('mi-cafe')).toBe(true)
    expect(e.unavailable.ids.has('mi-coca')).toBe(false)
  })

  it('garde anti-backend-legacy : `available` absent ne vaut pas indisponible', () => {
    const e = deriveShopMenuEntry([{ id: 'mi-legacy', name: 'Legacy', enabled: true, assigned: true }])
    expect([...e.enabledIds]).toEqual(['mi-legacy'])
    expect(e.unavailable).toBeNull()
  })

  it('aucun article activé : pas d\'entrée ids/items, mais appartenance conservée', () => {
    const rows = items().map((it) => ({ ...it, enabled: false }))
    const e = deriveShopMenuEntry(rows)
    expect(e.enabledIds).toBeNull()
    expect(e.displayItems).toBeNull()
    expect(e.membership.ids.size).toBe(4)
  })

  it('aucune ligne : tout à null', () => {
    expect(deriveShopMenuEntry([])).toEqual({
      enabledIds: null, displayItems: null, membership: null, unavailable: null,
    })
  })
})

describe('applyEnabledChanges', () => {
  it('ne touche QUE `enabled` : `assigned` et `available` sont des vérités serveur', () => {
    const { rows, applied } = applyEnabledChanges(items(), { 'mi-frites': true })
    expect(applied).toBe(true)
    const frites = rows.find((r) => r.id === 'mi-frites')
    expect(frites.enabled).toBe(true)
    expect(frites.assigned).toBe(true)
    expect(frites.available).toBe(true)
    // Entrée d'origine NON mutée (les lignes sont partagées avec le store).
    expect(items().find((r) => r.id === 'mi-frites').enabled).toBe(false)
  })

  it('article hors roster : `applied` false → l\'appelant doit refetcher', () => {
    const { applied } = applyEnabledChanges(items(), { 'mi-inconnu': true })
    expect(applied).toBe(false)
  })
})

describe('patchShopMenuMaps', () => {
  const baseMaps = () => ({
    ids: new Map([['bar a', new Set(['mi-coca'])], ['kiosque b', new Set(['mi-biere'])]]),
    items: new Map([['bar a', [{ id: 'mi-coca' }]], ['kiosque b', [{ id: 'mi-biere' }]]]),
    membership: new Map([['bar a', { ids: new Set(), names: new Set() }]]),
    unavailable: new Map(),
  })

  it('ne touche pas les autres PdV', () => {
    const next = patchShopMenuMaps(baseMaps(), 'Bar A', deriveShopMenuEntry(
      applyEnabledChanges(items(), { 'mi-frites': true }).rows,
    ))
    expect([...next.ids.get('bar a')].sort()).toEqual(['mi-coca', 'mi-frites'])
    expect([...next.ids.get('kiosque b')]).toEqual(['mi-biere'])
  })

  it('dernier article décoché : la clé est SUPPRIMÉE, pas mise à un Set vide', () => {
    const rows = items().map((it) => ({ ...it, enabled: false }))
    const next = patchShopMenuMaps(baseMaps(), 'Bar A', deriveShopMenuEntry(rows))
    expect(next.ids.has('bar a')).toBe(false)
    expect(next.items.has('bar a')).toBe(false)
    // L'appartenance, elle, reste : c'est le garde-fou anti-ouverture hors menu.
    expect(next.membership.get('bar a').ids.size).toBe(4)
  })

  it('renvoie des Map NEUVES (les computed dérivés doivent se réévaluer)', () => {
    const maps = baseMaps()
    const next = patchShopMenuMaps(maps, 'Bar A', deriveShopMenuEntry(items()))
    expect(next.ids).not.toBe(maps.ids)
    expect(maps.ids.get('bar a').has('mi-frites')).toBe(false)
  })
})
