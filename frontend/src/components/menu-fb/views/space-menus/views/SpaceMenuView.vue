<template>
  <div
    :class="['space-menu-view', { 'space-menu-view--dark': isDark }]"
    :style="isDark
      ? 'background: #0f172a; min-height: 100vh;'
      : 'background: #f6f7fb; min-height: 100vh;'"
  >
    <!-- Sticky Header -->
    <div class="smv-header" :class="{ 'smv-header--dark': isDark }">
      <div class="smv-header__inner">

        <!-- Row 1 : brand + selects + view toggle + save -->
        <div class="smv-header__row smv-header__row--top">

          <!-- Brand -->
          <div class="smv-header__brand">
            <div class="smv-header__icon">
              <Utensils :size="20" color="white" />
            </div>
            <div>
              <div class="smv-header__title">{{ t("spaceMenu.title") }}</div>
              <div class="smv-header__sub">{{ t("spaceMenu.subtitle") }}</div>
            </div>
          </div>

          <!-- Space selector -->
          <div class="smv-select-wrap">
            <select
              v-model="selectedSpaceId"
              class="smv-select"
              :disabled="spacesLoading || !spaceOptions.length"
            >
              <option value="">{{ t('spaceMenu.selectSpace') }}</option>
              <option v-for="s in spaceOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <label class="smv-select__label">{{ t('spaceMenu.selectSpace') }}</label>
          </div>

          <!-- Config selector -->
          <div class="smv-select-wrap">
            <select
              v-model="selectedConfigId"
              class="smv-select"
              :disabled="!selectedSpaceId || configurationsLoading || !configOptions.length"
            >
              <option value="">{{ t('spaceMenu.selectConfiguration') }}</option>
              <option v-for="c in configOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <label class="smv-select__label">{{ t('spaceMenu.selectConfiguration') }}</label>
          </div>

          <!-- View toggle -->
          <div class="smv-view-toggle">
            <button class="smv-view-btn" :class="{ active: viewMode === 'shop' }" @click="viewMode = 'shop'">
              <Store :size="14" /> {{ t("spaceMenu.byShop") }}
            </button>
            <button class="smv-view-btn" :class="{ active: viewMode === 'menu' }" @click="viewMode = 'menu'">
              <UtensilsCrossed :size="14" /> {{ t("spaceMenu.byMenuItem") }}
            </button>
          </div>

          <!-- Status toggles (à côté du view toggle) -->
          <div v-if="selectedSpaceId" class="smv-status-pills">
            <button class="smv-status-pill" :class="{ active: statusFilter === 'open' }" @click="statusFilter = 'open'">
              {{ t('spaceMenu.open') }}
              <span class="smv-status-pill__count">{{ openShopsCount }}</span>
            </button>
            <button class="smv-status-pill smv-status-pill--closed" :class="{ active: statusFilter === 'closed' }" @click="statusFilter = 'closed'">
              {{ t('spaceMenu.closed') }}
              <span class="smv-status-pill__count">{{ closedShopsCount }}</span>
            </button>
          </div>

        </div>

      </div>

      <!-- ── Search bar (style MarketPriceListView) ── -->
      <div v-if="selectedSpaceId" class="smv-searchbar">
        <div class="smv-searchbar__inner">
          <Search :size="17" class="smv-searchbar__icon" />
          <input
            v-if="viewMode === 'shop'"
            v-model="searchQuery"
            class="smv-searchbar__input"
            type="search"
            :placeholder="t('spaceMenu.searchShops')"
          />
          <input
            v-else
            v-model="menuItemQuery"
            class="smv-searchbar__input"
            type="search"
            :placeholder="t('spaceMenu.searchMenuItems')"
          />

          <span class="smv-searchbar__count">{{ filteredShops.length }} {{ t('spaceMenu.shops') }}</span>

          <button
            v-if="searchQuery || menuItemQuery"
            class="smv-searchbar__clear"
            @click="searchQuery = ''; menuItemQuery = ''"
          >
            <X :size="15" />
          </button>
        </div>
      </div>
    </div>

    <!-- Main content -->
    <div class="smv-container">

      <!-- Empty state: no space selected -->
      <div v-if="!selectedSpaceId" class="smv-empty">
        <div class="smv-empty__icon">
          <Store :size="40" style="color: #d1d5db" />
        </div>
        <p class="smv-empty__title">{{ t("spaceMenu.selectASpace") }}</p>
        <p class="smv-empty__sub">{{ t("spaceMenu.chooseSpaceToSeeShops") }}</p>
      </div>

      <div v-else>
        <!-- Shop view -->
        <template v-if="viewMode === 'shop'">
          <SpaceMenuShopView
            :shops="shops"
            :filtered-shops="filteredShops"
            :shops-loading="shopsLoading"
            :load-error="shopsError"
            :is-dark="isDark"
            :space-has-no-configuration="!configurationsLoading && configOptions.length === 0"
            @edit-shop="editShop"
            @select-shop="selectShop"
            @retry="selectedConfigId && loadShopsForSpace(selectedSpaceId, selectedConfigId, { forceRefresh: true })"
          />
        </template>

        <!-- Menu item view -->
        <template v-else-if="viewMode === 'menu'">
          <SpaceMenuItemView
            :menu-items-by-category="menuItemsByCategory"
            :shops="shops"
            :menu-items-loading="menuItemsLoading"
            :shop-menu-items-loading="shopMenuItemsLoading"
            :menu-item-query="menuItemQuery"
            :space-id="String(selectedSpaceId || '')"
            :config-id="String(selectedConfigId || '')"
            :menu-assignment-map="menuAssignmentMap"
            :is-dark="isDark"
            :load-error="menuItemsError"
            @show-error="onChildError"
            @menu-item-toggled="onMenuItemToggled"
            @retry="loadMenuItemsForSpace(); loadMenuAssignmentsForConfig();"
          />
        </template>
      </div>

      <ShopMenuItemsDrawer
        v-model="drawerOpen"
        :shop="selectedShop"
        :space-id="String(selectedSpaceId || '')"
        :config-id="String(selectedConfigId || '')"
        :is-dark="isDark"
        @attached="onMenuItemsAttached"
      />

      <SpaceMenuEditShopDrawer
        v-model="editDrawerOpen"
        :shop="editShopTarget"
        :is-dark="isDark"
        :selected-config-id="String(selectedConfigId || '')"
        :config-options="configOptions"
        @saved="onShopSaved"
        @save-error="onChildError"
      />

    </div>

    <!-- Snackbar feedback -->
    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      location="bottom right"
      :timeout="3500"
      rounded="lg"
    >
      {{ snackbarMessage }}
      <template #actions>
        <v-btn variant="text" size="small" @click="snackbar = false">OK</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Utensils, Store, UtensilsCrossed, Search, X } from 'lucide-vue-next';
import { getSpacesLight } from '@/api/endpoints/space.api';
import { getSpaceMenuConfiguration, getSpaceMenuItemsWithAvailability } from '@/api/endpoints/menu.api';
import ShopMenuItemsDrawer from '../drawers/ShopMenuItemsDrawer.vue';
import SpaceMenuEditShopDrawer from '../drawers/SpaceMenuEditShopDrawer.vue';
import SpaceMenuShopView from './SpaceMenuShopView.vue';
import SpaceMenuItemView from './SpaceMenuItemView.vue';

export default {
  name: "SpaceMenuView",
  components: { ShopMenuItemsDrawer, SpaceMenuEditShopDrawer, SpaceMenuShopView, SpaceMenuItemView, Utensils, Store, UtensilsCrossed, Search, X },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      spacesLoading: false,
      spaces: [],

      selectedSpaceId: null,
      selectedConfigId: null,
      // Config demandée via ?config= (deep-link depuis EventPredict). Consommée
      // une fois par loadConfigurationsForSpace pour préselectionner la bonne
      // config au lieu de la 1re. Non réactif-critique → simple champ.
      pendingConfigId: null,
      configurations: [],
      configurationsLoading: false,

      shopsFetching: false,
      // Shops bruts de l'espace (toutes configs confondues) ; `shops` (computed plus bas)
      // en dérive la vue filtrée par `selectedConfigId`.
      rawShops: [],

      // Shop sélectionné pour afficher ses menu items
      selectedShop: null,
      editShopTarget: null,

      viewMode: "shop",
      statusFilter: "open",
      searchQuery: "",
      menuItemQuery: "",
      menuItemsLoading: false,
      // Items de l'espace avec disponibilité SERVEUR (GET /space-menu/space/:id/items) —
      // même source que le drawer shop, plus aucun calcul de disponibilité côté front.
      spaceMenuItems: [],
      // Erreurs de chargement distinctes de l'état « vraiment vide » : l'UI affichait
      // « Aucun menu item » aussi bien sur un catalogue vide que sur un appel en échec.
      menuItemsError: null,
      shopsError: null,
      shopMenuItemsLoading: false,
      // Matrice d'assignation shop×menuItem pour l'onglet "By Menu Item" — { [shopId]: {
      // [menuItemId]: boolean } }, chargée en 1 SEUL appel (GET /space-menu/:spaceId/:configId)
      // au lieu d'un appel /space-menu/shop/:shopId par shop (chacun renvoyant la recette
      // complète — ingrédients/packagings/composants — pour juste savoir si l'item est coché).
      menuAssignmentMap: {},
      drawerOpen: false,
      editDrawerOpen: false,

      snackbar: false,
      snackbarColor: 'success',
      snackbarMessage: '',
    };
  },
  computed: {
    spaceOptions() {
      return (this.spaces || [])
        .map((s) => ({
          id: String(s?.id ?? s?._id ?? ""),
          name: String(s?.name ?? s?.title ?? "").trim(),
          image: s?.image || s?.logo || s?.avatar || s?.coverImage || "",
          _raw: s,
        }))
        .filter((s) => s.id && s.name);
    },

    configOptions() {
      return (this.configurations || [])
        .map((c) => ({
          id: String(c?.id ?? ""),
          name: String(c?.name ?? "").trim(),
          capacity: c?.capacity ?? 0,
          _raw: c,
        }))
        .filter((c) => c.id && c.name);
    },

    // `rawShops` est déjà scopé par le backend (GET /spaces/:id/shops?configId=...) —
    // ce filtre est un garde-fou bon marché (petit tableau) au cas où rawShops contienne
    // encore des shops d'une config précédente pendant la transition entre deux fetches.
    //
    // BUG-274 : le backend renvoie shopTypes = ['shop','fnb_food','fnb_beverages','fnb_bar',
    // 'fnb_snack','fnb_icecream','merchshop'] — la même liste que EVENT_TIMELINE_SHOP_TYPES/
    // logistics.SHOP_TYPES (revenu, stock), où merchshop a sa place. Ici (assignation de
    // MenuItem à un point de vente), merchshop n'a aucun sens produit : le stock merch passe
    // par Article, pas MenuItem (cf. StorageShopsSection.vue) — rien n'empêchait techniquement
    // l'assignation, c'était juste un oubli de filtre. Exclu ici plutôt que côté backend pour ne
    // pas affecter les autres écrans qui consomment le même endpoint (Restock, Event Predict,
    // Analyse, wizard Weezevent) et où merchshop doit rester.
    shops() {
      if (!this.selectedConfigId) return [];
      return (this.rawShops || []).filter((shop) => {
        const shopConfigId = shop?.configId || shop?._raw?.configId;
        return shopConfigId === this.selectedConfigId && shop?.type !== 'merchshop';
      });
    },

    // Le fetch shops tourne en parallèle de celui des configurations : si les shops
    // arrivent avant que la config ne soit résolue, `shops` (ci-dessus) est encore vide
    // faute de selectedConfigId — on garde l'état "chargement" actif pour éviter un
    // flash "aucun shop" trompeur pendant cette fenêtre.
    shopsLoading() {
      return this.shopsFetching || (!!this.selectedSpaceId && !this.selectedConfigId && this.configurationsLoading);
    },

    filteredShops() {
      let filtered = this.shops || [];

      // Filter by status
      if (this.statusFilter === "open") {
        filtered = filtered.filter((s) => s.isOpen !== false);
      } else if (this.statusFilter === "closed") {
        filtered = filtered.filter((s) => s.isOpen === false);
      }

      // Filter by shop name / type / location
      if (this.searchQuery && this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase().trim();
        filtered = filtered.filter((s) =>
          String(s.name || "").toLowerCase().includes(query) ||
          String(s.type || "").toLowerCase().includes(query) ||
          String(s.location || "").toLowerCase().includes(query)
        );
      }

      // BUG-123 : le filtre par nom d'article a été retiré d'ici. `filteredShops` (grille de
      // shops + badge "N shops" de la barre de recherche) reste piloté par `searchQuery`
      // uniquement — `menuItemQuery` n'a d'input visible qu'en vue "By Menu Item" (où aucun
      // shop n'est rendu). Appliquer `menuItemQuery` ici faisait que la grille restait
      // silencieusement filtrée après un passage par l'autre vue, alors que le champ visible en
      // vue "By Shop" (`searchQuery`) apparaissait vide.

      return filtered;
    },

    openShopsCount() {
      return (this.shops || []).filter((s) => s.isOpen !== false).length;
    },

    closedShopsCount() {
      return (this.shops || []).filter((s) => s.isOpen === false).length;
    },

    // Items de l'espace servis par le backend avec `available` déjà calculé —
    // seule la recherche texte reste filtrée côté client.
    menuItemsForSpace() {
      const q = String(this.menuItemQuery || '').toLowerCase().trim();
      if (!q) return this.spaceMenuItems;
      return this.spaceMenuItems.filter(item => {
        const name = String(item?.name || '').toLowerCase();
        const cat  = String(item?.category || '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      });
    },

    menuItemsByCategory() {
      const groups = {};
      for (const item of this.menuItemsForSpace) {
        const cat = item?.category || 'Sans catégorie';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
      }
      return Object.entries(groups)
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([category, items]) => ({ category, items }));
    },

  },
  watch: {
    selectedSpaceId: {
      immediate: false,
      handler(id) {
        if (!id) {
          this.rawShops = [];
          this.configurations = [];
          this.selectedConfigId = null;
          this.spaceMenuItems = [];
          this.menuItemsError = null;
          return;
        }
        // Les shops sont chargés scopés par configuration (GET /spaces/:id/shops?configId=)
        // dès que selectedConfigId est résolu — cf. watcher ci-dessous, déclenché par
        // l'auto-sélection de la 1ère config dans loadConfigurationsForSpace. Pas de fetch
        // shops non scopé ici : il serait immédiatement remplacé par le fetch scopé
        // (double appel réseau pour le même résultat, cf. retour utilisateur du 2026-07-03).
        this.loadConfigurationsForSpace(id);
        if (this.viewMode === 'menu') this.loadMenuItemsForSpace();
      },
    },
    viewMode(mode) {
      if (mode === 'menu') {
        this.loadMenuItemsForSpace();
        if (this.selectedConfigId) this.loadMenuAssignmentsForConfig();
      }
    },
    selectedConfigId(id) {
      // Seul déclencheur du fetch shops (GET /spaces/:id/shops?configId=...) : auto-
      // sélection de la 1ère config après loadConfigurationsForSpace, ou changement
      // manuel de config par l'utilisateur.
      if (id && this.selectedSpaceId) {
        this.loadShopsForSpace(this.selectedSpaceId, id);
      }
      if (id && this.viewMode === 'menu') {
        this.loadMenuAssignmentsForConfig();
      }
    },

    drawerOpen(isOpen) {
      if (!isOpen) {
        setTimeout(() => { this.selectedShop = null; }, 300);
      }
    },
  },
  methods: {
    normalizeShop(s) {
      const menuItemsCount =
        s?.menuItemsCount ??
        s?.menu_items_count ??
        s?.menuItemCount ??
        s?.menu_items?.length ??
        s?.menuItems?.length ??
        s?.menu_items?.total ??
        s?.menuItems?.total ??
        0;

      const menuItemsCountNum = Number.isFinite(Number(menuItemsCount)) ? Number(menuItemsCount) : 0;
      return {
        id: String(s?.id ?? s?._id ?? s?.shopId ?? ""),
        name: String(s?.name ?? s?.shopName ?? s?.title ?? "").trim() || "-",
        image: s?.image || s?.logo || s?.avatar || "",
        location: s?.location || "",
        address: s?.address || "",
        city: s?.city || "",
        country: s?.country || "",
        type: s?.type || s?.shopType || "",
        // `shopTypes` (nom de champ hérité de la réponse GET /spaces/:id/shops) est déjà
        // subtypes-prioritaire côté backend (spaces.service.ts::getSpaceShops) — sans ce
        // passage, les tiroirs d'édition s'ouvraient toujours avec une sélection vide.
        subtypes: Array.isArray(s?.shopTypes) ? s.shopTypes : [],
        isOpen: menuItemsCountNum > 0,
        menuItemsCount: menuItemsCountNum,
        _raw: s,
      };
    },

    // Applique un deep-link ?space=&config= (ex : bouton « Ajouter des shops »
    // d'EventPredict). Appelé au mount ET à l'activated (la route est keepAlive :
    // mounted() ne rejoue pas sur les visites suivantes).
    applyRouteQuery() {
      const q = this.$route?.query || {};
      const qSpace = q.space ? String(q.space) : null;
      const qConfig = q.config ? String(q.config) : null;
      if (!qSpace) return;
      // Idempotence : mounted() ET activated() tirent au 1er rendu (keepAlive).
      // On n'applique une même query qu'une fois (évite un double chargement).
      const sig = `${qSpace}|${qConfig || ''}`;
      if (this._lastRouteQuerySig === sig) return;
      this._lastRouteQuerySig = sig;
      this.pendingConfigId = qConfig;
      if (this.selectedSpaceId !== qSpace) {
        // Change d'espace → le watcher recharge configs+shops et consomme
        // pendingConfigId dans loadConfigurationsForSpace.
        this.selectedSpaceId = qSpace;
      } else if (qConfig && this.selectedConfigId !== qConfig) {
        // Même espace déjà sélectionné : appliquer la config directement si
        // elle est déjà chargée, sinon relancer le chargement des configs.
        const has = this.configOptions.find((c) => c.id === qConfig);
        if (has) {
          this.selectedConfigId = qConfig;
          this.pendingConfigId = null;
        } else {
          this.loadConfigurationsForSpace(qSpace);
        }
      }
    },

    async loadSpaces() {
      this.spacesLoading = true;
      try {
        // Le sélecteur n'affiche que id+name : endpoint léger Redis-caché au lieu du
        // module Vuex `spaces` (liste complète non cachée au-delà de limit=10, utilisée
        // ailleurs pour des vues qui ont besoin des champs riches — ne pas y toucher ici).
        this.spaces = await getSpacesLight();

        if (!this.selectedSpaceId && this.spaceOptions.length) {
          this.selectedSpaceId = this.spaceOptions[0].id;
        }
      } catch (e) {
        this.spaces = [];
        this.selectedSpaceId = null;
        console.error('Failed to load spaces', e);
      } finally {
        this.spacesLoading = false;
      }
    },

    async loadConfigurationsForSpace(spaceId) {
      this.configurationsLoading = true;
      this.selectedConfigId = null;
      this.configurations = [];
      try {
        const configurations = await this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId });
        // BUG-124 : garde anti-course — un changement d'espace pendant l'attente réseau (espace
        // A lent, espace B rapide) ne doit pas écraser les configs déjà affichées pour B avec
        // celles de A arrivées en retard.
        if (String(this.selectedSpaceId) !== String(spaceId)) return;
        this.configurations = configurations;

        // Préselection : config demandée en deep-link (?config=) si elle existe,
        // sinon la 1re configuration.
        if (this.configOptions.length > 0) {
          const wanted =
            this.pendingConfigId &&
            this.configOptions.find((c) => c.id === String(this.pendingConfigId));
          this.selectedConfigId = wanted ? wanted.id : this.configOptions[0].id;
          this.pendingConfigId = null;
        }
      } catch (e) {
        this.configurations = [];
        console.error("Error loading configurations:", e);
      } finally {
        this.configurationsLoading = false;
      }
    },

    async loadMenuItemsForSpace() {
      const spaceId = this.selectedSpaceId;
      if (!spaceId) return;
      this.menuItemsLoading = true;
      this.menuItemsError = null;
      try {
        // Disponibilité calculée côté SERVEUR (même règles que le drawer shop) :
        // condition 0 (items associés à l'espace) + ingrédients actifs + fournisseur
        // résolu + fournisseur livrant cet espace.
        const res = await getSpaceMenuItemsWithAvailability(spaceId);
        // Ignore une réponse arrivée après un changement d'espace (garde anti-course).
        if (String(this.selectedSpaceId) !== String(spaceId)) return;
        this.spaceMenuItems = res?.items || [];
      } catch (e) {
        console.error('Failed to load menu items', e);
        this.spaceMenuItems = [];
        this.menuItemsError = e?.response?.data?.message || e?.message || 'Load failed';
      } finally {
        this.menuItemsLoading = false;
      }
    },

    onChildError(message) {
      this.snackbarColor = 'error';
      this.snackbarMessage = message;
      this.snackbar = true;
    },

    /**
     * 1 SEUL appel réseau (GET /space-menu/:spaceId/:configId) pour toute la matrice
     * shop×menuItem de la config sélectionnée, au lieu d'un appel /space-menu/shop/:shopId
     * PAR SHOP (chacun renvoyant la recette complète de chaque item — ingrédients,
     * packagings, composants — juste pour savoir si l'item est coché sur ce shop).
     */
    async loadMenuAssignmentsForConfig() {
      const spaceId = this.selectedSpaceId;
      const configId = this.selectedConfigId;
      if (!spaceId || !configId) return;
      this.shopMenuItemsLoading = true;
      try {
        const res = await getSpaceMenuConfiguration(spaceId, configId);
        this.menuAssignmentMap = res?.menuItems || {};
      } catch (e) {
        this.menuAssignmentMap = {};
        console.error('Failed to load menu assignments', e);
      } finally {
        this.shopMenuItemsLoading = false;
      }
    },

    /**
     * Toujours appelé avec un configId résolu (déclenché par le watcher selectedConfigId) :
     * seule requête shops de la page, scopée à la config sélectionnée (GET
     * /spaces/:id/shops?configId=...).
     * @param {string} spaceId
     * @param {string} configId
     */
    async loadShopsForSpace(spaceId, configId, { forceRefresh = false } = {}) {
      this.shopsFetching = true;
      this.shopsError = null;
      try {
        const list = await this.$store.dispatch('spaceShops/fetchForSpace', { spaceId, configId, forceRefresh });
        // BUG-124 : garde anti-course — un changement d'espace pendant l'attente réseau ne doit
        // pas écraser les shops déjà affichés pour le nouvel espace sélectionné.
        if (String(this.selectedSpaceId) !== String(spaceId)) return;

        this.rawShops = (list || [])
          .map((s) => this.normalizeShop(s))
          .filter((s) => s.id);

        // « Ouverts » toujours actif par défaut à l'ouverture (choix utilisateur) —
        // pas de bascule auto vers « Fermés », même si toutes les boutiques sont fermées.
      } catch (e) {
        this.rawShops = [];
        this.shopsError = e?.response?.data?.message || e?.message || 'Load failed';
        console.error("Error loading shops:", e);
      } finally {
        this.shopsFetching = false;
      }
    },

    async selectShop(shop) {
      if (!shop?.id) return;
      this.selectedShop = shop;
      this.drawerOpen = true;
    },

    editShop(shop) {
      this.editShopTarget = shop;
      this.editDrawerOpen = true;
    },

    // Le cache Vuex spaceShops (TTL 15 min) gardait les anciens compteurs après une
    // écriture : changer de config puis revenir resservait l'état d'avant l'attach
    // (« je dois hard-refresh »). On l'invalide à chaque écriture — la mise à jour
    // optimiste locale (rawShops) garde l'écran courant réactif sans refetch.
    invalidateShopsCache() {
      if (this.selectedSpaceId && this.selectedConfigId) {
        this.$store.dispatch('spaceShops/invalidateForSpace', `${this.selectedSpaceId}:${this.selectedConfigId}`);
      }
    },

    // BUG-128 : `shopMenuItems` (le roster détaillé d'items par shop, TTL 15 min) est un module
    // Vuex distinct de `spaceShops` (juste le compteur) — d'autres écrans (Event Predict,
    // Restock, useInventoryData) le lisent directement. Sans cette invalidation, ils servaient
    // le roster pré-édition jusqu'à 15 min après un toggle/attach fait ici.
    invalidateShopMenuItemsCache(shopId) {
      if (shopId) {
        this.$store.dispatch('shopMenuItems/invalidateForShop', { shopId, configId: this.selectedConfigId || null });
      }
    },

    onMenuItemsAttached({ shopId, newCount, error }) {
      if (error) {
        this.snackbarColor = 'error';
        this.snackbarMessage = error;
      } else {
        const shopIdx = this.rawShops.findIndex(s => s.id === shopId);
        if (shopIdx !== -1) {
          this.rawShops[shopIdx].menuItemsCount = newCount;
          this.rawShops[shopIdx].isOpen = newCount > 0;
        }
        this.invalidateShopsCache();
        this.invalidateShopMenuItemsCache(shopId);
        this.snackbarColor = 'success';
        this.snackbarMessage = this.t('spaceMenu.menuItemsAttached');
      }
      this.snackbar = true;
    },

    // Mise à jour optimiste locale après un toggle dans SpaceMenuItemView — pas de refetch
    // réseau, on connaît déjà exactement ce qui a changé (cf. loadMenuAssignmentsForConfig).
    onMenuItemToggled({ shopId, menuItemId, enabled }) {
      const shopMap = { ...(this.menuAssignmentMap[shopId] || {}), [menuItemId]: enabled };
      this.menuAssignmentMap = { ...this.menuAssignmentMap, [shopId]: shopMap };

      const count = Object.values(shopMap).filter(Boolean).length;
      const shopIdx = this.rawShops.findIndex(s => String(s.id) === String(shopId));
      if (shopIdx !== -1) {
        this.rawShops[shopIdx] = {
          ...this.rawShops[shopIdx],
          menuItemsCount: count,
          isOpen: count > 0,
        };
      }
      this.invalidateShopsCache();
      this.invalidateShopMenuItemsCache(shopId);
    },

    onShopSaved(updatedShop) {
      const index = this.rawShops.findIndex(s => s.id === updatedShop.id);
      if (index !== -1) this.rawShops[index] = { ...updatedShop };
      if (this.selectedSpaceId) {
        this.$store.dispatch('spaceShops/fetchForSpace', {
          spaceId: this.selectedSpaceId,
          configId: this.selectedConfigId,
          forceRefresh: true,
        });
      }
    },
  },
  mounted() {
    this.applyRouteQuery();
    this.loadSpaces();
  },
  // Route keep-alive : au retour sur la page, on resynchronise TOUT (shops compris —
  // avant, seuls items+assignments étaient rechargés et les compteurs shops restaient
  // figés sur l'état d'avant navigation).
  activated() {
    // BUG-122 : sur une route keep-alive, mounted() ne rejoue pas aux visites suivantes — seul
    // activated() se déclenche. Sans cet appel, un deep-link ?space=&config= relancé depuis
    // Event Predict pendant que cette page reste en mémoire (ex. "Add shops" pour un 2e espace)
    // n'était jamais relu, malgré ce que ce hook prétendait déjà faire.
    this.applyRouteQuery();
    if (this.selectedSpaceId && this.selectedConfigId) {
      this.loadShopsForSpace(this.selectedSpaceId, this.selectedConfigId, { forceRefresh: true });
    }
    if (this.selectedSpaceId && this.viewMode === 'menu') {
      this.loadMenuItemsForSpace();
    }
    if (this.viewMode === 'menu' && this.selectedConfigId) {
      this.loadMenuAssignmentsForConfig();
    }
  },
};
</script>

<style scoped>
/* ─────────────────────────────────────────────
   Header
───────────────────────────────────────────── */
/* ── Fixed gradient header ── */
.smv-header {
  position: fixed;
  top: var(--v-layout-top, 64px);
  left: var(--v-layout-left, 0px);
  right: 0;
  z-index: 100;
  background: #ff3131;
  box-shadow: none;
}

.smv-header__inner { padding: 14px 24px 14px; }

.smv-header__row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.smv-header__brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.smv-header__icon {
  width: 40px; height: 40px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.smv-header__title { font-size: 16px; font-weight: 700; color: #fff; line-height: 1.3; }
.smv-header__sub { font-size: 11px; color: rgba(255,255,255,.7); }

/* ── Select with floating label (sur fond rouge) ── */
.smv-select-wrap { position: relative; min-width: 180px; }
.smv-select {
  width: 100%; height: 42px;
  border: 1.5px solid rgba(255,255,255,.35); border-radius: 12px;
  padding: 12px 32px 4px 12px; font-size: 13.5px; color: #fff;
  background: rgba(255,255,255,.15) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;
  -webkit-appearance: none; appearance: none; outline: none; cursor: pointer;
  transition: border-color .2s, background .2s;
}
.smv-select option { background: #ff3131; color: #fff; }
.smv-select:focus { border-color: rgba(255,255,255,.7); background: rgba(255,255,255,.22); }
.smv-select:disabled { opacity: .45; cursor: not-allowed; }
.smv-select__label {
  position: absolute; top: 4px; left: 12px;
  font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: rgba(255,255,255,.75); pointer-events: none;
}

/* ── View toggle (sur fond rouge) ── */
.smv-view-toggle { display: flex; background: rgba(255,255,255,.15); border-radius: 100px; padding: 3px; gap: 2px; margin-left: auto; }
.smv-view-btn {
  display: flex; align-items: center; gap: 5px; padding: 6px 14px;
  border-radius: 100px; border: none; font-size: 13px; font-weight: 500;
  color: rgba(255,255,255,.75); background: transparent; cursor: pointer; transition: all .2s;
}
.smv-view-btn.active { background: #fff; color: #ff3131; box-shadow: 0 2px 8px rgba(0,0,0,.12); font-weight: 700; }


/* ── Search bar (style MarketPriceListView) ── */
.smv-searchbar {
  background: #fff;
  border-top: 1px solid rgba(255, 255, 255, .12);
}
.space-menu-view--dark .smv-searchbar { background: #0f172a; border-top-color: rgba(255,255,255,.06); }
.smv-searchbar__inner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 24px; flex-wrap: wrap;
}
.smv-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.smv-searchbar__input {
  flex: 1; min-width: 160px; border: none; outline: none;
  background: transparent; font-size: 14px; color: #111827;
}
.space-menu-view--dark .smv-searchbar__input { color: #e5e7eb; }
.smv-searchbar__input::placeholder { color: #9ca3af; }

/* Status pills (à côté du view toggle, sur fond rouge) */
.smv-status-pills { display: flex; gap: 6px; }
.smv-status-pill {
  display: flex; align-items: center; gap: 5px; padding: 5px 12px;
  border-radius: 100px; border: 1.5px solid rgba(255,255,255,.3);
  background: rgba(255,255,255,.12);
  font-size: 12.5px; font-weight: 500; color: rgba(255,255,255,.8); cursor: pointer; transition: all .2s;
}
.smv-status-pill:hover { background: rgba(255,255,255,.2); color: #fff; }
.smv-status-pill.active { background: #fff; color: #ff3131; border-color: #fff; font-weight: 700; }
.smv-status-pill--closed.active { background: rgba(255,255,255,.9); color: #374151; border-color: #fff; }
.smv-status-pill__count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: rgba(255,255,255,.25); color: #fff;
  font-size: 10px; font-weight: 700; border-radius: 100px;
}
.smv-status-pill.active .smv-status-pill__count { background: rgba(255, 49, 49,.15); color: #ff3131; }

.smv-searchbar__count { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.smv-searchbar__clear {
  background: none; border: none; padding: 2px; cursor: pointer;
  color: #9ca3af; display: flex; align-items: center; border-radius: 4px;
}
.smv-searchbar__clear:hover { color: #ff3131; }


/* ── Container — compense le header fixed (ligne rouge + search bar) ── */
.smv-container { padding: 24px; padding-top: 160px; }

/* ── Empty state ── */
.smv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 24px; text-align: center; }
.smv-empty__icon { width: 80px; height: 80px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
.smv-empty__title { font-size: 18px; font-weight: 600; color: #6b7280; margin-bottom: 6px; }
.smv-empty__sub { font-size: 14px; color: #9ca3af; }

/* ── Dark mode ── */
.space-menu-view--dark .smv-empty__icon { background: #1e293b; }
.space-menu-view--dark .smv-empty__title { color: #94a3b8; }
.space-menu-view--dark .smv-empty__sub { color: #64748b; }
</style>
