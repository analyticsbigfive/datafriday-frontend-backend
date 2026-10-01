// BUG-390-02 : vue « Par article » d'Event Predict, changement de catégorie lent.
// 1. Les index mémoïsés (Space Menu par PDV, PDV cochés par article, libellés
//    de catégorie, groupByMenuItemArray) donnent EXACTEMENT les mêmes résultats
//    que les anciennes implémentations, recopiées ici telles quelles.
// 2. Le rendu progressif monte 30 cartes, en ajoute 30 au clic « Afficher
//    plus », repart de 30 au changement de catégorie / recherche / chip, et ne
//    fait pas disparaître une carte traitée sous un chip (BUG-315-01).
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import EventPredictMenusSection from '@/components/space-workspace/event-predict/sections/EventPredictMenusSection.vue'
import {
  buildSelectedElementsByMenuItem,
  buildAssignedIdSetByElement,
  sliceVisibleEntries,
} from '@/utils/eventPredictItemIndexes'

// ---------------------------------------------------------------------------
// Jeu de données synthétique : 6 PDV (dont 1 sans Space Menu chargé), 90
// articles répartis sur 5 catégories, ids mixtes (chaînes + nombres), des
// doublons dans les sélections, des ajustements variés.
// ---------------------------------------------------------------------------
const N_ITEMS = 90
const cats = [
  { id: 'c0', name: 'Burger' },
  { id: 'c1', name: 'Bières' },
  { id: 'c2', name: 'Softs' },
  { id: 'c3', name: 'Snacks' },
]
const itemId = (i) => (i % 10 === 0 ? 1000 + i : 'mi' + i) // quelques ids numériques
const menuItems = Array.from({ length: N_ITEMS }, (_, i) => ({
  id: itemId(i),
  name: 'Article ' + String(i).padStart(3, '0'),
  // Les 5 derniers sans catégorie → « Aucune catégorie ».
  categoryId: i >= N_ITEMS - 5 ? null : cats[i % cats.length].id,
  basePrice: 5,
}))
const configShops = Array.from({ length: 6 }, (_, s) => ({
  id: 'sh' + s,
  name: 'Shop ' + s,
  type: 'shop',
  isOpen: true,
}))
const timeline = []
configShops.forEach((sh, s) => {
  for (let k = 0; k < 25; k++) {
    const i = (s * 11 + k * 3) % N_ITEMS
    timeline.push({
      shopId: sh.id,
      shopName: sh.name,
      menuItemId: itemId(i),
      itemName: menuItems[i].name,
      totalQuantity: 4 + k,
      totalRevenue: 20,
    })
  }
})
// Space Menu : shops 0..4 chargés (ids en CHAÎNE pour les numériques sur le
// shop 2, pour couvrir `ids.has(String(id))`), shop 5 non chargé (null).
function buildAssignments({ everyShop = false } = {}) {
  const out = {}
  const n = everyShop ? configShops.length : configShops.length - 1
  configShops.slice(0, n).forEach((sh, s) => {
    const arr = Array.from({ length: 20 }, (_, k) => menuItems[(s * 7 + k * 4) % N_ITEMS])
    // Article 0 présent partout (cas « déjà assigné sur tous les PDV »).
    arr.push(menuItems[0])
    out[sh.id] = arr.map((m) => ({ ...m, id: s === 2 ? String(m.id) : m.id }))
  })
  return out
}
function buildSelection(assignments) {
  const sel = {}
  configShops.forEach((sh) => {
    const ids = (assignments[sh.id] || []).map((m) => m.id)
    // Doublon volontaire : un PDV ne doit compter qu'une fois.
    if (ids.length) ids.push(ids[0])
    sel[sh.id] = ids
  })
  return sel
}
function buildAdjustments(selection) {
  const qa = {}
  Object.entries(selection).forEach(([elId, ids], s) => {
    ids.forEach((id, k) => {
      if (k % 3 === 0) qa[`${elId}-${id}`] = 100 + s * 10 // varie selon le PDV → « Mixte »
      if (k % 5 === 0) qa[`${elId}-${id}`] = 150 // même valeur partout pour certains
    })
  })
  return qa
}

function mountSection(propsOverride = {}) {
  const assignments = propsOverride.shopMenuAssignmentItems || buildAssignments()
  const selection = propsOverride.selectedMenuItems || buildSelection(assignments)
  return mount(EventPredictMenusSection, {
    props: {
      viewMode: 'item',
      itemsContext: 'ready',
      menuItems,
      configShops,
      predictedTimelineData: timeline,
      shopMenuAssignmentItems: assignments,
      selectedMenuItems: selection,
      quantityAdjustments: buildAdjustments(selection),
      isOpenByShop: Object.fromEntries(configShops.map((s) => [s.name.toLowerCase(), true])),
      productCategories: cats,
      spaceId: 's',
      eventId: 'e',
      ...propsOverride,
    },
    global: {
      mocks: { $vuetify: { theme: { global: { current: { dark: false } } } } },
      stubs: {
        Teleport: true,
        'v-icon': true,
        'v-alert': true,
        'v-progress-circular': true,
        EventPredictRowActions: true,
        EventDrawerShell: true,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Anciennes implémentations (avant BUG-390-02), recopiées telles quelles.
// ---------------------------------------------------------------------------
const legacy = {
  assignedIdsForElement(vm, element) {
    const arr = vm.assignedItemsForElement(element)
    return Array.isArray(arr) ? new Set(arr.map((it) => it.id)) : null
  },
  isItemAssignedEverywhere(vm, menuItemId) {
    if (!vm.fbElements.length) return false
    return vm.fbElements.every((el) => {
      const ids = legacy.assignedIdsForElement(vm, el)
      return ids !== null && (ids.has(menuItemId) || ids.has(String(menuItemId)))
    })
  },
  getSelectedElementsForMenuItem(vm, menuItemId) {
    return vm.fbElements.filter((element) => {
      const selected = vm.selectedMenuItems[element.id] || []
      return selected.includes(menuItemId)
    })
  },
  getItemAdjustmentValues(vm, menuItemId) {
    return legacy.getSelectedElementsForMenuItem(vm, menuItemId).map((element) => {
      const value = vm.quantityAdjustments[`${element.id}-${menuItemId}`] ?? 100
      return Number(value)
    })
  },
  isItemAdjustmentMixed(vm, menuItemId) {
    return new Set(legacy.getItemAdjustmentValues(vm, menuItemId)).size > 1
  },
  getItemAdjustmentValue(vm, menuItemId) {
    const values = new Set(legacy.getItemAdjustmentValues(vm, menuItemId))
    return values.size === 1 ? [...values][0] : 100
  },
  categoryChips(vm) {
    const items = vm.groupByMenuItemArray.map((e) => e.menuItem)
    return vm.buildCategoryChipList(items, vm.itemTypeTab)
  },
  groupByMenuItemArray(vm) {
    const all = new Set()
    for (const items of vm.menuItemsPerElement.values()) {
      for (const it of items) all.add(it.id)
    }
    const assignedObjById = new Map()
    let anyAssignment = false
    for (const element of vm.fbElements) {
      const ai = vm.assignedItemsForElement(element)
      if (Array.isArray(ai) && ai.length) {
        anyAssignment = true
        for (const it of ai) {
          all.add(it.id)
          if (!assignedObjById.has(it.id)) assignedObjById.set(it.id, it)
        }
      }
    }
    const result = []
    for (const miId of all) {
      const mi =
        vm.menuItems.find((m) => m.id === miId) ||
        vm.syntheticItemsById.get(miId) ||
        assignedObjById.get(miId)
      if (!mi) continue
      const shops = []
      let assignedSomewhere = false
      for (const element of vm.fbElements) {
        const items = vm.menuItemsPerElement.get(element.id) || []
        const assignedIds = legacy.assignedIdsForElement(vm, element)
        const inBase = items.some((i) => i.id === miId)
        const isAssigned = !!assignedIds && assignedIds.has(miId)
        if (!inBase && !isAssigned) continue
        if (isAssigned) assignedSomewhere = true
        const sel = (vm.selectedMenuItems[element.id] || []).includes(miId)
        const pq = vm.getPredictedQuantity(element.id, miId)
        const aq = vm.getAdjustedQuantity(element.id, miId)
        shops.push({ element, selected: sel, predictedQty: pq, adjustedQty: aq, assigned: isAssigned, assignmentLoaded: !!assignedIds })
      }
      if (!shops.length) continue
      shops.sort((a, b) => {
        if (a.selected && !b.selected) return -1
        if (!a.selected && b.selected) return 1
        return b.predictedQty - a.predictedQty
      })
      const mapGroup = anyAssignment && !assignedSomewhere ? 'unmapped' : 'other'
      result.push({ menuItemId: miId, menuItem: mi, shops, _mapGroup: mapGroup })
    }
    return result
  },
}

const snapshotEntries = (list) =>
  list.map((e) => ({
    id: e.menuItemId,
    name: e.menuItem.name,
    group: e._mapGroup,
    shops: e.shops.map((s) => [s.element.id, s.selected, s.predictedQty, s.adjustedQty, s.assigned, s.assignmentLoaded]),
  }))

// Ids à tester : catalogue + variantes chaîne des ids numériques + inconnu.
const probeIds = [...menuItems.map((m) => m.id), '1000', '1010', 1010, 'inconnu', 999999]

describe('BUG-390-02 : index mémoïsés de la vue article (mêmes résultats qu\'avant)', () => {
  let w
  afterEach(() => w && w.unmount())

  it('groupByMenuItemArray identique à l\'ancienne double boucle', () => {
    w = mountSection()
    expect(snapshotEntries(w.vm.groupByMenuItemArray)).toEqual(snapshotEntries(legacy.groupByMenuItemArray(w.vm)))
    expect(w.vm.groupByMenuItemArray.length).toBeGreaterThan(30)
    expect(w.vm.groupByMenuItemArray.some((e) => e._mapGroup === 'unmapped')).toBe(true)
  })

  it('assignedIdsForElement / isItemAssignedEverywhere identiques (un PDV non chargé)', () => {
    w = mountSection()
    for (const el of w.vm.fbElements) {
      const now = w.vm.assignedIdsForElement(el)
      const before = legacy.assignedIdsForElement(w.vm, el)
      expect(now === null ? null : [...now]).toEqual(before === null ? null : [...before])
    }
    // Élément hors index (autre objet) : repli sur la construction historique.
    const clone = { ...w.vm.fbElements[0] }
    expect([...w.vm.assignedIdsForElement(clone)]).toEqual([...legacy.assignedIdsForElement(w.vm, clone)])
    for (const id of probeIds) {
      expect([id, w.vm.isItemAssignedEverywhere(id)]).toEqual([id, legacy.isItemAssignedEverywhere(w.vm, id)])
    }
  })

  it('isItemAssignedEverywhere identique quand tous les PDV ont un Space Menu (cas vrai, ids chaîne/nombre)', () => {
    w = mountSection({ shopMenuAssignmentItems: buildAssignments({ everyShop: true }) })
    let trues = 0
    for (const id of probeIds) {
      const before = legacy.isItemAssignedEverywhere(w.vm, id)
      if (before) trues += 1
      expect([id, w.vm.isItemAssignedEverywhere(id)]).toEqual([id, before])
    }
    // Article 0 (id numérique 1000, en chaîne sur le shop 2) assigné partout.
    expect(w.vm.isItemAssignedEverywhere(1000)).toBe(true)
    expect(trues).toBeGreaterThan(0)
  })

  it('getSelectedElementsForMenuItem / isItemAdjustmentMixed / getItemAdjustmentValue identiques', () => {
    w = mountSection()
    let mixed = 0
    let uniform150 = 0
    for (const id of probeIds) {
      expect(w.vm.getSelectedElementsForMenuItem(id).map((e) => e.id))
        .toEqual(legacy.getSelectedElementsForMenuItem(w.vm, id).map((e) => e.id))
      const m = w.vm.isItemAdjustmentMixed(id)
      expect([id, m]).toEqual([id, legacy.isItemAdjustmentMixed(w.vm, id)])
      const v = w.vm.getItemAdjustmentValue(id)
      expect([id, v]).toEqual([id, legacy.getItemAdjustmentValue(w.vm, id)])
      if (m) mixed += 1
      if (v === 150) uniform150 += 1
    }
    // Le jeu de données couvre bien les deux cas.
    expect(mixed).toBeGreaterThan(0)
    expect(uniform150).toBeGreaterThan(0)
  })

  it('les index suivent les props (réactivité conservée)', async () => {
    w = mountSection()
    const id = menuItems[3].id
    const before = w.vm.getSelectedElementsForMenuItem(id).length
    const sel = { ...w.vm.selectedMenuItems, sh5: [...(w.vm.selectedMenuItems.sh5 || []), id] }
    await w.setProps({ selectedMenuItems: sel })
    expect(w.vm.getSelectedElementsForMenuItem(id).length).toBe(before + 1)
    const assignments = { ...buildAssignments(), sh5: [menuItems[0]] }
    expect(w.vm.isItemAssignedEverywhere(1000)).toBe(false)
    await w.setProps({ shopMenuAssignmentItems: assignments })
    expect(w.vm.isItemAssignedEverywhere(1000)).toBe(true)
  })

  it('chips catégorie : mêmes libellés et compteurs qu\'avant, pour chaque onglet', async () => {
    w = mountSection()
    const strip = (chips) => chips.map((c) => [c.key, c.label, c.count, c.color, c.active])
    expect(strip(w.vm.itemViewCategoryChips)).toEqual(strip(legacy.categoryChips(w.vm)))
    const keys = w.vm.itemViewCategoryChips.map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(['All', 'Burger', 'Softs', 'Aucune catégorie'].filter((k) => keys.includes(k))))
    for (const key of keys) {
      w.vm.itemTypeTab = key
      await nextTick()
      expect(strip(w.vm.itemViewCategoryChips)).toEqual(strip(legacy.categoryChips(w.vm)))
    }
  })
})

describe('BUG-390-02 : rendu progressif de la vue article', () => {
  let w
  afterEach(() => w && w.unmount())

  it('monte 30 cartes, « Afficher plus » en ajoute 30, la catégorie remet à 30', async () => {
    w = mountSection()
    await nextTick()
    const total = w.vm.groupedItemViewEntries.length
    expect(total).toBeGreaterThan(60)
    expect(w.findAll('.ep-item-entry')).toHaveLength(30)
    const more = w.find('.ep-item-list-more button')
    expect(more.exists()).toBe(true)
    expect(more.text()).toContain(String(total - 30))
    await more.trigger('click')
    expect(w.findAll('.ep-item-entry')).toHaveLength(60)

    w.vm.itemTypeTab = 'Burger'
    await nextTick()
    const burger = w.vm.groupedItemViewEntries.length
    expect(w.findAll('.ep-item-entry')).toHaveLength(Math.min(30, burger))
    w.vm.itemTypeTab = 'All'
    await nextTick()
    expect(w.findAll('.ep-item-entry')).toHaveLength(30)
  })

  it('coupe les transitions pendant la bascule de catégorie puis les rétablit', async () => {
    w = mountSection()
    expect(w.vm.categorySwitching).toBe(false)
    w.vm.itemTypeTab = 'Burger'
    await nextTick()
    expect(w.vm.categorySwitching).toBe(true)
    await new Promise((r) => setTimeout(r, 30))
    expect(w.vm.categorySwitching).toBe(false)
  })

  it('recherche : un article au-delà des 30 premières cartes apparaît', async () => {
    w = mountSection()
    await nextTick()
    const last = w.vm.groupedItemViewEntries[w.vm.groupedItemViewEntries.length - 1]
    expect(w.text()).not.toContain(last.menuItem.name)
    await w.find('.ep-toolbar-search-input').setValue(last.menuItem.name)
    expect(w.vm.itemListVisibleCount).toBe(30)
    expect(w.text()).toContain(last.menuItem.name)
  })

  it('le chip global remet le compteur à 30 et garde l\'en-tête « Non rattachés »', async () => {
    w = mountSection()
    await nextTick()
    await w.find('.ep-item-list-more button').trigger('click')
    expect(w.vm.itemListVisibleCount).toBe(60)
    w.vm.toggleGlobalChip('unmapped')
    await nextTick()
    expect(w.vm.itemListVisibleCount).toBe(30)
    const visible = w.vm.visibleItemViewEntries
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.filter((e) => e._isFirstUnmapped)).toHaveLength(1)
    expect(visible[0]._isFirstUnmapped).toBe(true)
    expect(w.findAll('.ep-unmapped-header')).toHaveLength(1)
  })
})

describe('BUG-390-02 : utilitaires purs', () => {
  it('sliceVisibleEntries garde l\'ordre, les entrées traitées et le tiroir ouvert, et replace l\'en-tête', () => {
    const entries = [
      { menuItemId: 'a', _mapGroup: 'other', _isFirstUnmapped: false },
      { menuItemId: 'b', _mapGroup: 'other', _isFirstUnmapped: false },
      { menuItemId: 'c', _mapGroup: 'other', _isFirstUnmapped: false, _chipTreated: true },
      { menuItemId: 'd', _mapGroup: 'unmapped', _isFirstUnmapped: true },
      { menuItemId: 'e', _mapGroup: 'unmapped', _isFirstUnmapped: false },
      { menuItemId: 'f', _mapGroup: 'unmapped', _isFirstUnmapped: false },
    ]
    const out = sliceVisibleEntries(entries, 2, new Set(['f']))
    expect(out.map((e) => e.menuItemId)).toEqual(['a', 'b', 'c', 'f'])
    // « d » (porteur de l'en-tête) hors tranche → l'en-tête passe sur « f ».
    expect(out.map((e) => e._isFirstUnmapped)).toEqual([false, false, false, true])
    // Les objets non modifiés sont réutilisés tels quels.
    expect(out[0]).toBe(entries[0])
    expect(sliceVisibleEntries(entries, 10).map((e) => e._isFirstUnmapped))
      .toEqual(entries.map((e) => e._isFirstUnmapped))
    expect(sliceVisibleEntries(null, 30)).toEqual([])
  })

  it('buildSelectedElementsByMenuItem : un PDV par article même en doublon, type de clé conservé', () => {
    const els = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const map = buildSelectedElementsByMenuItem(els, { a: [1, 'x', 1], b: ['1', 'x'], c: [] })
    expect(map.get(1).map((e) => e.id)).toEqual(['a'])
    expect(map.get('1').map((e) => e.id)).toEqual(['b'])
    expect(map.get('x').map((e) => e.id)).toEqual(['a', 'b'])
    expect(map.has('y')).toBe(false)
  })

  it('buildAssignedIdSetByElement : Set par élément, null si non chargé', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    const map = buildAssignedIdSetByElement([a, b], (el) => (el === a ? [{ id: 1 }, { id: 'z' }] : null))
    expect([...map.get(a)]).toEqual([1, 'z'])
    expect(map.get(b)).toBeNull()
  })
})
