/**
 * Dataset Analyse + export CSV.
 *
 * Trois contrats, dans l'ordre où ils cassent en production :
 *  1. la SIGNATURE change avec les filtres — sans quoi un dataset périmé
 *     alimenterait l'assistant et le classeur ;
 *  2. rien n'est publié tant que la page charge — un export sur données
 *     partielles est faux sans le dire ;
 *  3. le CSV s'ouvre au double-clic sous Excel FR (BOM, `;`, virgule décimale).
 */

import { defineComponent, computed, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { useAnalyseDataset } from '@/composables/useAnalyseDataset';
import { useAnalyseExport } from '@/composables/useAnalyseExport';

const RECORDS = [
  { eventId: 'e1', eventName: 'AJA vs Angers', shopName: 'Nord', shopArea: 'Tribune Nord', menuItemName: 'Pression', revenue: 100.555, quantity: 20, transactionCount: 12 },
  { eventId: 'e1', eventName: 'AJA vs Angers', shopName: 'Sud', shopArea: 'Tribune Sud', menuItemName: 'Frites', revenue: 40, quantity: 8, transactionCount: 5 },
];

function makeStore(menuItemCostMap = {}) {
  return createStore({
    modules: {
      analyse: {
        namespaced: true,
        state: () => ({ selectedToolbox: 'analyse', dataset: null, menuItemCostMap }),
        mutations: {
          SET_ANALYSE_DATASET(state, v) {
            state.dataset = v || null;
          },
        },
      },
    },
  });
}

/** Monte un composant hôte : les composables ont besoin d'un setup et d'un store. */
function mountHost(store, overrides = {}) {
  const api = {};
  const filters = ref({ timeRange: 'last_30_days', comparisonMode: null, selectedShopIds: [] });
  const busy = ref(false);
  const records = ref(RECORDS);

  const Host = defineComponent({
    setup() {
      const empty = computed(() => []);
      const dataset = useAnalyseDataset({
        spaceName: computed(() => 'Auxerre'),
        filters,
        activeFilterChips: computed(() => []),
        filteredEvents: computed(() => [{ id: 'e1', name: 'AJA vs Angers' }]),
        filteredRecords: records,
        chartRecords: records,
        articleRecords: records,
        itemLevelRecords: records,
        filteredBaskets: empty,
        filteredEventAggregates: computed(() => [
          { eventId: 'e1', eventName: 'AJA vs Angers', eventDate: '2026-05-03', revenue: 140.555, transactions: 17, attendees: 15200, avgTransaction: 8.27 },
        ]),
        filteredTimelineData: empty,
        timelineHeaderLabel: computed(() => ''),
        metrics: {
          displayRevenue: computed(() => 140.555),
          displayCost: computed(() => 40),
          displayTransactions: computed(() => 17),
          displayAttendees: computed(() => 15200),
          displayAvgRevenue: computed(() => 140.555),
          displayPerCapita: computed(() => 0.0092),
        },
        itemSummary: computed(() => ({ variations: { revenue: 12.44 }, variationsYoY: {} })),
        shopPerformance: { enriched: ref(false), shops: ref([]) },
        isPredictMode: computed(() => false),
        busy,
        ...overrides,
      });
      Object.assign(api, dataset);
      api.export = useAnalyseExport({
        ensureDataset: dataset.ensureDataset,
        spaceName: computed(() => 'Auxerre'),
        isPredictMode: computed(() => false),
        notify: jest.fn(),
      });
      return () => null;
    },
  });

  const wrapper = mount(Host, { global: { plugins: [store] } });
  return { wrapper, api, filters, busy };
}

describe('useAnalyseDataset — signature', () => {
  it('change quand une dimension de filtre change', async () => {
    const { api, filters } = mountHost(makeStore());
    const before = api.signature.value;
    filters.value = { ...filters.value, selectedShopIds: ['Nord'] };
    await nextTick();
    expect(api.signature.value).not.toBe(before);
  });

  it('reste stable si rien ne bouge', async () => {
    const { api } = mountHost(makeStore());
    const first = api.signature.value;
    await nextTick();
    expect(api.signature.value).toBe(first);
  });

  it('change quand la langue change', async () => {
    // Titres de tables et en-têtes sont résolus À LA CONSTRUCTION : sans la
    // locale dans la signature, un classeur bâti en français resterait servi
    // après un passage en anglais.
    const { api } = mountHost(makeStore());
    const before = api.signature.value;
    window.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: 'en' } }));
    await nextTick();
    expect(api.signature.value).not.toBe(before);
  });

  it('change quand le nombre de records change (enrichissement tardif)', async () => {
    const store = makeStore();
    const { api, wrapper } = mountHost(store);
    const before = api.signature.value;
    wrapper.unmount();
    // Un enrichissement item-level arrivé après coup doit invalider : sans ça,
    // le dataset construit sur le repli shop-level resterait publié.
    const { api: api2 } = mountHost(makeStore(), { chartRecords: computed(() => [...RECORDS, ...RECORDS]) });
    expect(api2.signature.value).not.toBe(before);
  });
});

describe('useAnalyseDataset — publication', () => {
  it('publie au premier appel et ne reconstruit pas à signature égale', () => {
    const store = makeStore();
    let publishes = 0;
    store.subscribe((m) => {
      if (m.type === 'analyse/SET_ANALYSE_DATASET' && m.payload) publishes += 1;
    });

    const { api } = mountHost(store);
    const first = api.ensureDataset();
    expect(store.state.analyse.dataset.signature).toBe(first.signature);
    expect(publishes).toBe(1);

    // Deuxième appel : le classeur et l'assistant se partagent le même calcul,
    // il ne doit pas repartir de zéro à chaque clic.
    api.ensureDataset();
    expect(publishes).toBe(1);
  });

  it('dépublie dès que les filtres changent', async () => {
    const store = makeStore();
    const { api, filters } = mountHost(store);
    api.ensureDataset();
    expect(store.state.analyse.dataset).not.toBeNull();

    filters.value = { ...filters.value, selectedShopIds: ['Nord'] };
    await nextTick();
    // Remis à null AVANT toute reconstruction : c'est ce qui garantit à
    // l'assistant qu'un dataset présent est à jour, sans comparer de signature.
    expect(store.state.analyse.dataset).toBeNull();
  });

  it('ne publie rien tant que la page charge', async () => {
    const store = makeStore();
    const { busy } = mountHost(store);
    busy.value = true;
    await nextTick();
    expect(store.state.analyse.dataset).toBeNull();
  });

  it('nomme les tables avec les titres affichés et omet les tables vides', () => {
    const { api } = mountHost(makeStore());
    const keys = api.ensureDataset().tables.map((t) => t.key);
    expect(keys).toContain('topArticles');
    expect(keys).toContain('donutByShop');
    // Paniers et timeline non chargés → aucune table vierge dans le classeur.
    expect(keys).not.toContain('basketByCategory');
    expect(keys).not.toContain('timeline');
  });

  it('replie « Performance des shops » sur 4 colonnes sans déclencher enrich()', () => {
    const { api } = mountHost(makeStore());
    const table = api.ensureDataset().tables.find((t) => t.key === 'shopPerformance');
    expect(table.partial).toBe(true);
    expect(table.columns).toHaveLength(4);
  });

  it('BUG-298-01 — table by-event sans colonne coût tant que l\'item-level manque', () => {
    // Records du fixture : shop-level (aucun menuItemId) → coût inconnu. Mieux
    // vaut pas de colonne qu'une colonne « 0 € » qui se lirait comme un chiffre.
    const { api } = mountHost(makeStore());
    const table = api.ensureDataset().tables.find((t) => t.key === 'byEvent');
    expect(table.columns.map((c) => c.key)).toEqual([
      'event', 'date', 'revenue', 'transactions', 'attendees', 'basket',
    ]);
    expect(table.rows[0].cost).toBeUndefined();
  });

  it('BUG-298-01 — coût et marge par event dès que l\'item-level est là', () => {
    const itemRecords = ref([
      { eventId: 'e1', menuItemId: 'm1', menuItemName: 'Pression', shopName: 'Nord', revenue: 100, quantity: 20, transactionCount: 12 },
      { eventId: 'e1', menuItemId: 'm2', menuItemName: 'Frites', shopName: 'Sud', revenue: 40, quantity: 8, transactionCount: 5 },
      // Event hors agrégats (cap item-level) : ne doit pas créer de ligne.
      { eventId: 'e9', menuItemId: 'm1', revenue: 10, quantity: 2, transactionCount: 1 },
    ]);
    const { api } = mountHost(makeStore({ m1: 1.5, m2: 0.4 }), { itemLevelRecords: itemRecords });
    const table = api.ensureDataset().tables.find((t) => t.key === 'byEvent');
    expect(table.columns.map((c) => c.key)).toEqual([
      'event', 'date', 'revenue', 'cost', 'margin', 'transactions', 'attendees', 'basket',
    ]);
    // 20×1,5 + 8×0,4 = 33,2 ; marge sur le CA ITEM-LEVEL (140), pas sur la
    // colonne `revenue` shop-level : (140 − 33,2) / 140 = 76,29 %.
    expect(table.rows[0].cost).toBe(33.2);
    expect(table.rows[0].margin).toBe(76.29);
  });

  it('BUG-298-01 — event non couvert par l\'item-level : cellules vides, jamais 0', () => {
    const itemRecords = ref([
      { eventId: 'autre', menuItemId: 'm1', revenue: 10, quantity: 2, transactionCount: 1 },
    ]);
    const { api } = mountHost(makeStore({ m1: 1.5 }), { itemLevelRecords: itemRecords });
    const table = api.ensureDataset().tables.find((t) => t.key === 'byEvent');
    const row = table.rows.find((r) => r.event === 'AJA vs Angers');
    expect(row.cost).toBeNull();
    expect(row.margin).toBeNull();
  });

  it('sépare la valeur KPI de son unité, en Number nu', () => {
    const { api } = mountHost(makeStore());
    const kpi = api.ensureDataset().tables.find((t) => t.key === 'kpi');
    expect(kpi.columns.map((c) => c.key)).toEqual(['indicator', 'value', 'unit', 'deltaPrev', 'deltaYoy']);
    expect(kpi.rows[0].value).toBe(140.56);
    expect(kpi.rows[0].unit).toBe('€');
    expect(kpi.rows[0].deltaPrev).toBe(12.44);
    // Variation absente → null, jamais NaN ni 0 (0 signifierait « stable »).
    expect(kpi.rows[0].deltaYoy).toBeNull();
  });
});

describe('useAnalyseExport — CSV Excel FR', () => {
  let captured;
  let RealBlob;

  beforeEach(() => {
    captured = [];
    RealBlob = global.Blob;
    global.Blob = function FakeBlob(parts) {
      captured.push(parts.join(''));
    };
    global.URL.createObjectURL = jest.fn(() => 'blob:test');
    global.URL.revokeObjectURL = jest.fn();
    // Interception de la SEULE ancre de téléchargement : Vue a besoin des vrais
    // éléments pour monter le composant hôte.
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'a' ? { click: jest.fn(), href: '', download: '' } : realCreate(tag),
    );
  });

  afterEach(() => {
    global.Blob = RealBlob;
    document.createElement.mockRestore();
  });

  it('écrit un BOM, des points-virgules et des décimales à la virgule', () => {
    const { api } = mountHost(makeStore());
    api.export.onExportCsv();

    expect(captured).toHaveLength(1);
    const csv = captured[0];
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(';');
    // Une valeur monétaire arrondie doit sortir « 140,56 » et non « 140.56 » :
    // sinon Excel FR la lit comme du texte et la colonne n'est plus sommable.
    expect(csv).toContain('140,56');
    expect(csv).not.toContain('140.56');
  });

  it('empile les tables, chacune précédée de son titre complet', () => {
    const { api } = mountHost(makeStore());
    api.export.onExportCsv();
    const csv = captured[0];
    const titles = csv.split('\r\n').filter((l) => l.startsWith('# '));
    expect(titles.length).toBeGreaterThan(3);
    // Titre non tronqué côté CSV, contrairement aux onglets Excel.
    expect(titles.some((tt) => tt.length > 33)).toBe(true);
  });

  it('échappe un libellé contenant le séparateur', () => {
    const { api } = mountHost(makeStore(), {
      chartRecords: computed(() => [
        { eventId: 'e1', eventName: 'A;B', shopName: 'Nord; Sud', menuItemName: 'X', revenue: 1, quantity: 1 },
      ]),
    });
    api.export.onExportCsv();
    expect(captured[0]).toContain('"Nord; Sud"');
  });
});
