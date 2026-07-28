<template>
  <div :class="{ 'smsh-root--dark': isDark }">
    <!-- Section header -->
    <div class="smsh-section-head">
      <div class="smsh-section-head__title">
        <Store :size="16" style="color:#ff3131; flex-shrink:0;" />
        {{ t("spaceMenu.foodAndBeverages") }}
        <span class="smsh-section-head__count">{{ filteredShops.length }}</span>
      </div>
    </div>

    <!-- Loading skeletons -->
    <div v-if="shopsLoading" class="smsh-grid mt-4">
      <div v-for="i in 8" :key="i" class="smsh-skeleton">
        <div class="smsh-skeleton__img"></div>
        <div class="smsh-skeleton__body">
          <div class="smsh-skeleton__line smsh-skeleton__line--title"></div>
          <div class="smsh-skeleton__line smsh-skeleton__line--sub"></div>
        </div>
      </div>
    </div>

    <!-- Erreur de chargement : état distinct du « vraiment vide » -->
    <div v-else-if="loadError" class="smsh-empty smsh-empty--error">
      <div class="smsh-empty__icon"><AlertCircle :size="32" style="color:#ff3131" /></div>
      <p class="smsh-empty__title">{{ t('spaceMenu.loadError') }}</p>
      <p class="smsh-empty__sub">{{ loadError }}</p>
      <button class="smsh-retry-btn" @click="$emit('retry')">{{ t('spaceMenu.retry') }}</button>
    </div>

    <!-- Empty: filtre sans résultat -->
    <div v-else-if="!filteredShops.length && shops.length > 0" class="smsh-empty">
      <div class="smsh-empty__icon"><Store :size="32" style="color:#d1d5db" /></div>
      <p class="smsh-empty__title">{{ t("spaceMenu.noMatchingShops") }}</p>
      <p class="smsh-empty__sub">{{ t("spaceMenu.tryAdjustingFilters") }}</p>
    </div>

    <!-- Empty: espace sans configuration — distinct de "aucun shop" (BUG-129), la vraie cause
         ici est qu'il n'existe encore aucune configuration à sélectionner. -->
    <div v-else-if="spaceHasNoConfiguration" class="smsh-empty">
      <div class="smsh-empty__icon"><Store :size="32" style="color:#d1d5db" /></div>
      <p class="smsh-empty__title">{{ t("spaceMenu.noConfigurationSelected") }}</p>
      <p class="smsh-empty__sub">{{ t("spaceMenu.spaceHasNoConfiguration") }}</p>
    </div>

    <!-- Empty: aucun shop dans cet espace -->
    <div v-else-if="!shops.length" class="smsh-empty">
      <div class="smsh-empty__icon"><Store :size="32" style="color:#d1d5db" /></div>
      <p class="smsh-empty__title">{{ t("spaceMenu.noShopsFound") }}</p>
      <p class="smsh-empty__sub">{{ t("spaceMenu.spaceHasNoShops") }}</p>
    </div>

    <!-- Shop grid -->
    <div v-else class="smsh-grid mt-4">
      <div
        v-for="shop in paginatedShops"
        :key="shop.id"
        class="smsh-card"
        @click="$emit('select-shop', shop)"
      >
        <!-- Image -->
        <div class="smsh-card__img">
          <img v-if="shop.image" :src="shop.image" :alt="shop.name" />
          <div v-else class="smsh-card__img-placeholder">
            <Store :size="28" />
          </div>
          <!-- Status badge -->
          <span
            class="smsh-card__status"
            :class="shop.isOpen ? 'smsh-card__status--open' : 'smsh-card__status--closed'"
          >
            {{ shop.isOpen ? t("spaceMenu.open") : t("spaceMenu.closed") }}
          </span>
          <!-- Edit button -->
          <button class="smsh-card__edit" @click.stop="$emit('edit-shop', shop)">
            <Pencil :size="13" />
          </button>
        </div>
        <!-- Body -->
        <div class="smsh-card__body">
          <div class="smsh-card__name">{{ shop.name }}</div>
          <div class="smsh-card__meta">
            <span v-if="shop.type" class="smsh-card__type">{{ shop.type }}</span>
            <span class="smsh-card__count">
              <UtensilsCrossed :size="11" /> {{ shop.menuItemsCount || 0 }} {{ t("spaceMenu.menuItems") }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div
      v-if="filteredShops.length > pageSize || totalPages > 1"
      class="smsh-pagination"
    >
      <div class="smsh-pagination__info">
        <span class="smsh-pagination__label">{{ t('spaceMenu.shopsPerPage') }}</span>
        <div class="smsh-page-size-toggle">
          <button
            v-for="n in pageSizeOptions"
            :key="n"
            class="smsh-page-size-btn"
            :class="{ active: pageSize === n }"
            @click="pageSize = n"
          >{{ n }}</button>
        </div>
      </div>

      <div class="smsh-pagination__controls">
        <button class="smsh-page-btn" :disabled="currentPage === 1" @click="currentPage--">
          <ChevronLeft :size="14" />
        </button>
        <span class="smsh-page-number">{{ currentPage }} / {{ totalPages }}</span>
        <button class="smsh-page-btn" :disabled="currentPage === totalPages" @click="currentPage++">
          <ChevronRight :size="14" />
        </button>
      </div>

      <span class="smsh-pagination__range">
        {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredShops.length) }} / {{ filteredShops.length }}
      </span>
    </div>
  </div>
</template>

<script>
import { useI18n } from "@/i18n/useI18n";
import { Store, Pencil, UtensilsCrossed, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-vue-next';

export default {
  name: "SpaceMenuShopView",
  components: { Store, Pencil, UtensilsCrossed, ChevronLeft, ChevronRight, AlertCircle },
  props: {
    shops:                 { type: Array,   required: true },
    filteredShops:         { type: Array,   required: true },
    shopsLoading:          { type: Boolean, default: false },
    // Message d'échec de chargement (null = pas d'erreur) — état distinct du vide.
    loadError:             { type: String,  default: null },
    // BUG-125 : non propagé par le parent jusqu'ici — cartes/grille restaient blanches sur
    // fond sombre.
    isDark:                { type: Boolean, default: false },
    // BUG-129 : distingue "espace sans configuration" de "espace sans shops" (message trompeur
    // sinon, la vraie cause n'étant pas communiquée).
    spaceHasNoConfiguration: { type: Boolean, default: false },
  },
  emits: ["edit-shop", "select-shop", "retry"],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      currentPage:     1,
      pageSize:        20,
      pageSizeOptions: [20, 50, 100],
    };
  },
  computed: {
    totalPages() {
      return Math.ceil(this.filteredShops.length / this.pageSize) || 1;
    },
    paginatedShops() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.filteredShops.slice(start, start + this.pageSize);
    },
  },
  watch: {
    filteredShops() { this.currentPage = 1; },
    pageSize()      { this.currentPage = 1; },
  },
};
</script>

<style scoped>
/* ── Section head ── */
.smsh-section-head { margin-bottom: 8px; }
.smsh-section-head__title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: #111827;
}
.smsh-section-head__count {
  background: rgba(255, 49, 49,.1); color: #ff3131;
  font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px;
}

/* ── Grid ── */
.smsh-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

/* ── Card ── */
.smsh-card {
  background: #fff; border-radius: 16px; border: 1px solid rgba(0,0,0,.06);
  overflow: hidden; cursor: pointer; transition: transform .2s, box-shadow .2s;
}
.smsh-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,.12); }

.smsh-card__img { position: relative; height: 140px; background: #f3f4f6; overflow: hidden; }
.smsh-card__img img { width: 100%; height: 100%; object-fit: cover; }
.smsh-card__img-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: #d1d5db; }

.smsh-card__status {
  position: absolute; top: 8px; left: 8px;
  padding: 3px 9px; border-radius: 100px; font-size: 10.5px; font-weight: 700;
}
.smsh-card__status--open { background: #ecfdf5; color: #059669; }
.smsh-card__status--closed { background: #f3f4f6; color: #6b7280; }

.smsh-card__edit {
  position: absolute; top: 8px; right: 8px;
  width: 28px; height: 28px; border-radius: 8px;
  background: rgba(255,255,255,.9); border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #374151; opacity: 0; transition: opacity .15s;
}
.smsh-card:hover .smsh-card__edit,
.smsh-card__edit:focus-visible { opacity: 1; }

.smsh-card__body { padding: 12px 14px; }
.smsh-card__name { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smsh-card__meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smsh-card__type { background: rgba(255, 49, 49,.08); color: #ff3131; border-radius: 100px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
.smsh-card__count { display: flex; align-items: center; gap: 3px; font-size: 12px; color: #6b7280; }

/* ── Skeleton ── */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.smsh-skeleton { background: #fff; border-radius: 16px; border: 1px solid rgba(0,0,0,.06); overflow: hidden; }
.smsh-skeleton__img {
  height: 140px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 800px 100%; animation: shimmer 1.5s infinite;
}
.smsh-skeleton__body { padding: 12px 14px; }
.smsh-skeleton__line {
  border-radius: 6px; margin-bottom: 8px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 800px 100%; animation: shimmer 1.5s infinite;
}
.smsh-skeleton__line--title { height: 14px; width: 70%; }
.smsh-skeleton__line--sub { height: 11px; width: 45%; }

/* ── Empty state ── */
.smsh-empty { padding: 60px 20px; text-align: center; border: 2px dashed #e5e7eb; border-radius: 16px; background: #fafafa; }
.smsh-empty--error { border-color: #fecaca; background: #fef2f2; }
.smsh-retry-btn {
  margin-top: 14px; padding: 8px 20px; border: none; border-radius: 100px;
  background: #ff3131; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: box-shadow .2s;
}
.smsh-retry-btn:hover { box-shadow: 0 4px 12px rgba(255, 49, 49,.35); }
.smsh-empty__icon { width: 64px; height: 64px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
.smsh-empty__title { font-size: 16px; font-weight: 600; color: #6b7280; margin-bottom: 4px; }
.smsh-empty__sub { font-size: 13px; color: #9ca3af; }

/* ── Pagination ── */
.smsh-pagination { display: flex; align-items: center; justify-content: space-between; margin-top: 24px; gap: 12px; flex-wrap: wrap; }
.smsh-pagination__info { display: flex; align-items: center; gap: 8px; }
.smsh-pagination__label { font-size: 12px; color: #6b7280; }
.smsh-page-size-toggle { display: flex; gap: 4px; }
.smsh-page-size-btn {
  padding: 4px 10px; border-radius: 100px; border: 1.5px solid #e5e7eb;
  background: #f9fafb; font-size: 12px; font-weight: 500; color: #6b7280; cursor: pointer; transition: all .2s;
}
.smsh-page-size-btn.active { border-color: #ff3131; background: #fef2f2; color: #ff3131; font-weight: 700; }
.smsh-pagination__controls { display: flex; align-items: center; gap: 8px; }
.smsh-page-btn {
  width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid #e5e7eb;
  background: #f9fafb; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .2s; color: #374151;
}
.smsh-page-btn:hover:not(:disabled) { border-color: #ff3131; color: #ff3131; }
.smsh-page-btn:disabled { opacity: .4; cursor: not-allowed; }
.smsh-page-number { font-size: 13px; font-weight: 600; color: #374151; min-width: 50px; text-align: center; }
.smsh-pagination__range { font-size: 12px; color: #9ca3af; }

/* ── Dark mode (BUG-125) ── */
.smsh-root--dark .smsh-section-head__title { color: #e2e8f0; }
.smsh-root--dark .smsh-card { background: #1e293b; border-color: rgba(255,255,255,.08); }
.smsh-root--dark .smsh-card__img { background: #111827; }
.smsh-root--dark .smsh-card__status--closed { background: #111827; color: #94a3b8; }
.smsh-root--dark .smsh-card__edit { background: rgba(17,24,39,.85); color: #e2e8f0; }
.smsh-root--dark .smsh-card__name { color: #e2e8f0; }
.smsh-root--dark .smsh-card__count { color: #94a3b8; }
.smsh-root--dark .smsh-skeleton { background: #1e293b; border-color: rgba(255,255,255,.08); }
.smsh-root--dark .smsh-skeleton__img,
.smsh-root--dark .smsh-skeleton__line { background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%); background-size: 800px 100%; }
.smsh-root--dark .smsh-empty { background: #111827; border-color: #1e293b; }
.smsh-root--dark .smsh-empty--error { background: rgba(255, 49, 49,.08); border-color: rgba(255, 49, 49,.3); }
.smsh-root--dark .smsh-empty__icon { background: #1e293b; }
.smsh-root--dark .smsh-empty__title { color: #94a3b8; }
.smsh-root--dark .smsh-empty__sub { color: #64748b; }
.smsh-root--dark .smsh-pagination__label,
.smsh-root--dark .smsh-pagination__range { color: #64748b; }
.smsh-root--dark .smsh-page-size-btn,
.smsh-root--dark .smsh-page-btn { border-color: #334155; background: #1e293b; color: #94a3b8; }
.smsh-root--dark .smsh-page-number { color: #e2e8f0; }
</style>
