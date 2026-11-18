/**
 * Inventaire : réécriture d'URL (?event=) faite par la vue elle-même.
 * La clé de route attendue après la réécriture permet au watcher de route d'ignorer CETTE
 * transition (le chargement en cours couvre déjà le contexte) sans jamais avaler une vraie
 * navigation de l'utilisateur.
 */
import { createSelfNavGuard, routeKeyAfterEventReplace } from '@/components/space-workspace/inventory/inventorySelfNav'
import { inventoryRouteKey } from '@/components/space-workspace/inventory/useInventoryKeepAlive'

const route = (query = {}, mode = 'post') => ({
  meta: { inventoryMode: mode },
  params: { spaceId: 'sp1' },
  query,
})

describe('routeKeyAfterEventReplace', () => {
  it('donne la clé que produit réellement router.replace({ query: { ...query, event } })', () => {
    const before = route({ configuration: 'cfg-1' })
    const after = route({ configuration: 'cfg-1', event: 'ev-9' })
    expect(routeKeyAfterEventReplace(before, 'ev-9')).toBe(inventoryRouteKey(after))
  })

  it('garde le mode (pre/post) et la configuration de l\'URL', () => {
    expect(routeKeyAfterEventReplace(route({}, 'pre'), 'ev-1')).toBe('pre::sp1::ev-1::')
    expect(routeKeyAfterEventReplace(route({ config: 'c2' }), 'ev-1')).toBe('post::sp1::ev-1::c2')
  })

  it('remplace un ?event= déjà présent', () => {
    expect(routeKeyAfterEventReplace(route({ event: 'old' }), 'new')).toBe('post::sp1::new::')
  })
})

describe('createSelfNavGuard', () => {
  it('ignore UNE seule fois la transition attendue', () => {
    const guard = createSelfNavGuard()
    guard.expect('post::sp1::ev-1::')
    expect(guard.consume('post::sp1::ev-1::')).toBe(true)
    expect(guard.consume('post::sp1::ev-1::')).toBe(false)
  })

  it('n\'ignore jamais une autre clé (vraie navigation de l\'utilisateur)', () => {
    const guard = createSelfNavGuard()
    guard.expect('post::sp1::ev-1::')
    expect(guard.consume('post::sp1::ev-2::')).toBe(false)
    // la clé attendue reste en attente tant qu'elle n'est pas arrivée
    expect(guard.consume('post::sp1::ev-1::')).toBe(true)
  })

  it('sans attente, rien n\'est ignoré (y compris une clé vide)', () => {
    const guard = createSelfNavGuard()
    expect(guard.consume('post::sp1::ev-1::')).toBe(false)
    expect(guard.consume('')).toBe(false)
    expect(guard.consume(null)).toBe(false)
  })

  it('clear : réécriture échouée, la même clé revient ensuite comme une navigation normale', () => {
    const guard = createSelfNavGuard()
    guard.expect('post::sp1::ev-1::')
    guard.clear()
    expect(guard.consume('post::sp1::ev-1::')).toBe(false)
  })
})
