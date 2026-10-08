/**
 * Cuisines (Settings > Menu F&B) et fiche Composant, demande Bertrand 2026-10-08 :
 * choix de la cuisine (Locale ou cuisine de Settings), filtre Espace, formulaire Cuisine.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { createStore } from 'vuex'

jest.mock('@/api/endpoints/kitchens.api', () => ({
  getKitchens: jest.fn(),
  createKitchen: jest.fn(),
  updateKitchen: jest.fn(),
  deleteKitchen: jest.fn(),
}))
jest.mock('@/api/endpoints/menu.api', () => ({ getMenuComponent: jest.fn(), createMenuComponent: jest.fn() }))

import { createKitchen, getKitchens } from '@/api/endpoints/kitchens.api'
import kitchensModule from '@/store/modules/kitchens'
import KitchenFormDrawer from '@/components/menu-fb/views/kitchens/drawers/KitchenFormDrawer.vue'
import SpaceMultiSelect from '@/components/menu-fb/common/SpaceMultiSelect.vue'
import { buildComponentDuplicatePayload } from '@/composables/useComponentDuplicate'
import {
  KITCHEN_LOCAL,
  buildKitchenOptions,
  kitchenChoiceFrom,
  kitchenChoiceFromCsv,
  kitchenCsvLabel,
  kitchenPayloadFrom,
} from '@/composables/useKitchenOptions'
import { componentMatchesSpace } from '@/utils/componentSpaces'

const t = (k) => ({ kitchenLocal: 'Cuisine Locale' }[k] || k)
const KITCHENS = [
  { id: 'k-paris', name: 'Labo Paris', sites: ['paris'] },
  { id: 'k-aix', name: 'Cuisine Centrale', sites: ['aix', 'paris'] },
  { id: 'k-lyon', name: 'Labo Lyon', sites: ['lyon'] },
]

describe('cuisine : valeur du champ <-> API', () => {
  it('lit Local, une cuisine, ou rien', () => {
    expect(kitchenChoiceFrom({ kitchenType: 'Local', kitchenId: null })).toBe(KITCHEN_LOCAL)
    expect(kitchenChoiceFrom({ kitchenType: 'Central', kitchenId: 'k-aix' })).toBe('k-aix')
    expect(kitchenChoiceFrom({ kitchenType: 'Central', kitchenId: null })).toBeNull()
    expect(kitchenChoiceFrom({})).toBeNull()
  })

  it('écrit kitchenType + kitchenId cohérents', () => {
    expect(kitchenPayloadFrom(KITCHEN_LOCAL)).toEqual({ kitchenType: 'Local', kitchenId: null })
    expect(kitchenPayloadFrom('k-aix')).toEqual({ kitchenType: 'Central', kitchenId: 'k-aix' })
    expect(kitchenPayloadFrom(null)).toEqual({ kitchenType: null, kitchenId: null })
  })
})

describe('buildKitchenOptions', () => {
  it('Cuisine Locale en premier, puis toutes les cuisines si la fiche est sans espace', () => {
    expect(buildKitchenOptions(KITCHENS, [], null, t).map((o) => o.title))
      .toEqual(['Cuisine Locale', 'Labo Paris', 'Cuisine Centrale', 'Labo Lyon'])
  })

  it('fiche rattachée à Aix : seules les cuisines d\'Aix', () => {
    expect(buildKitchenOptions(KITCHENS, ['aix'], null, t).map((o) => o.value)).toEqual([KITCHEN_LOCAL, 'k-aix'])
  })

  it('cuisine actuelle hors de la liste chargée (autres espaces) : affichée avec son nom', () => {
    const opts = buildKitchenOptions(KITCHENS, [], 'k-nice', t, { id: 'k-nice', name: 'Labo Nice' })
    expect(opts.at(-1)).toEqual({ value: 'k-nice', title: 'Labo Nice' })
  })

  it('la cuisine déjà choisie reste proposée hors des espaces', () => {
    expect(buildKitchenOptions(KITCHENS, ['aix'], 'k-lyon', t).map((o) => o.value)).toEqual([KITCHEN_LOCAL, 'k-aix', 'k-lyon'])
  })
})

describe('CSV menu items : colonne Kitchen Type', () => {
  it('export : Local ou nom de la cuisine', () => {
    expect(kitchenCsvLabel({ kitchenType: 'Local' }, KITCHENS)).toBe('Local')
    expect(kitchenCsvLabel({ kitchenType: 'Central', kitchenId: 'k-paris' }, KITCHENS)).toBe('Labo Paris')
    expect(kitchenCsvLabel({}, KITCHENS)).toBe('')
  })

  it('import : Local, nom de cuisine (casse libre), ancien « Central », inconnu', () => {
    expect(kitchenChoiceFromCsv('Cuisine Locale', KITCHENS)).toBe(KITCHEN_LOCAL)
    expect(kitchenChoiceFromCsv('labo paris', KITCHENS)).toBe('k-paris')
    expect(kitchenChoiceFromCsv('Central', KITCHENS)).toBe('k-aix')
    expect(kitchenChoiceFromCsv('Inconnue', KITCHENS)).toBeNull()
  })
})

describe('filtre Espace de la bibliothèque', () => {
  it('garde les composants de l\'espace et les composants communs', () => {
    expect(componentMatchesSpace({ spaceIds: ['aix'] }, 'aix')).toBe(true)
    expect(componentMatchesSpace({ spaceIds: [] }, 'aix')).toBe(true)
    expect(componentMatchesSpace({ spaceIds: ['paris'] }, 'aix')).toBe(false)
    expect(componentMatchesSpace({ spaceIds: ['paris'] }, null)).toBe(true)
  })
})

function makeStore() {
  return createStore({
    modules: {
      kitchens: kitchensModule,
      spaces: {
        namespaced: true,
        getters: { spaces: () => [{ id: 'aix', name: 'Aix' }, { id: 'paris', name: 'Paris' }] },
        actions: { fetchSpaces: () => Promise.resolve() },
      },
    },
  })
}

describe('store kitchens', () => {
  it('charge toutes les pages', async () => {
    getKitchens
      .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({ id: `k${i}`, name: `K${i}` })), meta: { total: 101 } })
      .mockResolvedValueOnce({ data: [{ id: 'k100', name: 'K100' }], meta: { total: 101 } })
    const store = makeStore()
    await store.dispatch('kitchens/fetchKitchens')
    expect(getKitchens).toHaveBeenCalledTimes(2)
    expect(store.getters['kitchens/kitchens']).toHaveLength(101)
  })
})

describe('KitchenFormDrawer', () => {
  async function open() {
    const store = makeStore()
    const wrapper = mount(KitchenFormDrawer, {
      props: { modelValue: false, mode: 'create' },
      global: { plugins: [store], stubs: { Teleport: true, Transition: false, 'v-file-input': true } },
    })
    await wrapper.setProps({ modelValue: true })
    return { wrapper, store }
  }

  beforeEach(() => createKitchen.mockReset())

  it('nom obligatoire', async () => {
    const { wrapper } = await open()
    await wrapper.vm.submit()
    expect(createKitchen).not.toHaveBeenCalled()
    expect(wrapper.vm.error).toContain('Nom de la cuisine')
  })

  it('au moins un espace (tous cochés par défaut, comme les fournisseurs)', async () => {
    const { wrapper } = await open()
    expect(wrapper.vm.form.spaceIds).toEqual(['aix', 'paris'])
    wrapper.vm.form.name = 'Labo'
    wrapper.vm.form.spaceIds = []
    await wrapper.vm.submit()
    expect(createKitchen).not.toHaveBeenCalled()
  })

  it('crée la cuisine avec les seuls champs saisis obligatoires', async () => {
    createKitchen.mockResolvedValue({ id: 'k1', name: 'Labo', sites: ['aix'] })
    const { wrapper, store } = await open()
    wrapper.vm.form.name = 'Labo'
    wrapper.vm.form.spaceIds = ['aix']
    await wrapper.vm.submit()
    await flushPromises()
    expect(createKitchen).toHaveBeenCalledWith(expect.objectContaining({ name: 'Labo', spaceIds: ['aix'], email: '' }))
    expect(store.getters['kitchens/kitchens']).toEqual([{ id: 'k1', name: 'Labo', sites: ['aix'] }])
    expect(wrapper.emitted('saved')).toBeTruthy()
  })
})

describe('espaces non visibles par un compte restreint', () => {
  it('SpaceMultiSelect : affiche ses espaces, conserve les autres dans la valeur', async () => {
    const wrapper = mount(SpaceMultiSelect, {
      props: { modelValue: ['aix', 'nice'] },
      global: { plugins: [makeStore()], stubs: { 'v-select': true } },
    })
    expect(wrapper.vm.visibleValue).toEqual(['aix'])
    wrapper.vm.onUpdate(['aix', 'paris'])
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual(['aix', 'paris', 'nice'])
  })

  it('duplication : ne recopie que les espaces de l\'utilisateur', () => {
    const payload = buildComponentDuplicatePayload({ name: 'Aïoli', spaceIds: ['aix', 'nice'] }, { allowedSpaceIds: ['aix', 'paris'] })
    expect(payload.spaceIds).toEqual(['aix'])
    expect(buildComponentDuplicatePayload({ name: 'Aïoli', spaceIds: ['aix', 'nice'] }).spaceIds).toEqual(['aix', 'nice'])
  })
})

describe('store kitchens : appels simultanés', () => {
  it('un second appel pendant le chargement attend le même chargement', async () => {
    let release
    getKitchens.mockReset()
    getKitchens.mockReturnValueOnce(new Promise((r) => { release = r }))
    const store = makeStore()
    const first = store.dispatch('kitchens/fetchKitchens')
    const second = store.dispatch('kitchens/fetchKitchens')
    release({ data: [{ id: 'k1', name: 'Labo' }], meta: { total: 1 } })
    await second
    expect(store.getters['kitchens/kitchens']).toEqual([{ id: 'k1', name: 'Labo' }])
    await first
    expect(getKitchens).toHaveBeenCalledTimes(1)
  })
})
