<template>
  <v-card class="si-card" variant="outlined">
    <header class="si-card-head">
      <div>
        <h3 class="si-card-name">{{ entry?.element?.name }}</h3>
        <!-- Étage : distingue 2 Storage de même nom (la vraie clé reste element.id). -->
        <span v-if="entry?.element?.floorName" class="si-card-floor">{{ entry.element.floorName }}</span>
      </div>
      <span class="si-card-item-count">{{ countedItems }} / {{ items.length }} {{ t('invCardItems') }}</span>
    </header>

    <!-- Comptage storage : progression + statut + action (parité shops) -->
    <div class="si-storage-count">
      <v-progress-linear
        :model-value="progress"
        :color="isCounted ? 'success' : 'warning'"
        height="5"
        rounded
        class="si-storage-bar"
      />
      <div class="si-storage-count-row">
        <v-chip
          size="x-small"
          variant="flat"
          :color="isCounted ? 'success' : 'warning'"
          :prepend-icon="isCounted ? 'mdi-check-circle' : 'mdi-clipboard-list-outline'"
          class="si-storage-status"
        >
          {{ statusLabel }}
        </v-chip>
        <v-btn
          :color="isCounted ? 'success' : 'primary'"
          variant="flat"
          size="small"
          :disabled="items.length === 0"
          class="si-storage-action"
          @click="$emit('start-count', entry)"
        >
          <v-icon size="15" class="mr-1">{{ actionIcon }}</v-icon>
          {{ actionLabel }}
        </v-btn>
      </div>
    </div>

    <ul class="si-card-items">
      <li
        v-for="it in visibleItems"
        :key="it.id"
        class="si-storage-item"
      >
        <div class="si-storage-item-head">
          <span class="si-storage-item-name">{{ it.name }}</span>
          <span v-if="it.storageType" class="si-card-storagetype">{{ it.storageType }}</span>
        </div>
        <div
          v-if="it.usedIn && it.usedIn.length"
          class="si-storage-item-usedin"
        >
          Utilisé dans {{ it.usedIn.length }} lieu{{ it.usedIn.length !== 1 ? 'x' : '' }}
          <span
            v-for="(u, i) in it.usedIn.slice(0, 2)"
            :key="i"
            class="si-storage-usedin-tag"
          >
            {{ u.fbElementName || u.merchShopName || u.menuItemName }}
          </span>
          <span v-if="it.usedIn.length > 2" class="si-storage-usedin-more">
            +{{ it.usedIn.length - 2 }}
          </span>
        </div>
      </li>
    </ul>

    <v-btn
      v-if="items.length > 3"
      variant="text"
      size="small"
      class="si-card-expand-btn"
      @click="expanded = !expanded"
    >
      <v-icon size="16" class="mr-1">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      {{ expanded ? t('invStorageCollapse') : `${t('invStorageShowAll')} (${items.length})` }}
    </v-btn>
  </v-card>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'InventoryStorageCard',
  props: {
    entry: { type: Object, required: true },
    // Nombre d'articles comptés (isCounted) sur ce stockage → pilote progression + libellé.
    countedItems: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    statusLabel: { type: String, default: '' },
  },
  emits: ['start-count'],
  setup() {
    return { t: useI18n().t }
  },
  data() {
    return { expanded: false }
  },
  computed: {
    items() {
      // Storage + merch combinés : même base que le statut côté vue (storageStatusFor).
      return [
        ...(this.entry?.storageInventory || []),
        ...(this.entry?.merchInventory || []),
      ]
    },
    visibleItems() {
      return this.expanded ? this.items : this.items.slice(0, 3)
    },
    // Tous les articles comptés → stockage terminé (parité InventoryShopCard).
    isCounted() {
      return this.items.length > 0 && this.countedItems >= this.items.length
    },
    actionLabel() {
      if (this.items.length === 0) return this.t('invCardNoItems')
      if (this.isCounted) return this.t('invCardReviewCount')
      if (this.countedItems > 0) return this.t('invCardContinueCount')
      return this.t('invCardStartCount')
    },
    actionIcon() {
      return this.isCounted ? 'mdi-clipboard-check-outline' : 'mdi-clipboard-edit-outline'
    },
  },
}
</script>

<style scoped>
.si-card {
  background: #FFFFFF;
  border-color: #EEEEEE !important;
  border-radius: 8px;
}
.si-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 4px;
}
.si-card-name { font-size: 1rem; font-weight: 700; margin: 0; color: #212121; }
.si-card-floor { display: block; font-size: 0.72rem; color: #94a3b8; font-weight: 500; margin-top: 1px; }
.si-card-item-count { font-size: 0.78rem; color: #6B7280; white-space: nowrap; }
.si-storage-count { padding: 4px 16px 8px; display: flex; flex-direction: column; gap: 8px; }
.si-storage-bar { width: 100%; }
.si-storage-count-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.si-storage-status {
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: 0.66rem;
}
.si-storage-action { border-radius: 6px; text-transform: none; font-weight: 700; }
.si-card-items { list-style: none; padding: 0 10px; margin: 0 0 4px; display: flex; flex-direction: column; gap: 1px; }
.si-storage-item { padding: 7px 8px; border-radius: 8px; transition: background 0.15s ease; }
.si-storage-item:hover { background: #FAFAFA; }
.si-storage-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.si-storage-item-name { font-size: 0.85rem; font-weight: 600; color: #212121; line-height: 1.3; }
.si-card-storagetype {
  flex-shrink: 0;
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  color: #6B7280; background: #FAFAFA; border: 1px solid #EEEEEE;
  border-radius: 999px; padding: 2px 8px;
}
.si-storage-item-usedin { font-size: 0.72rem; color: #9E9E9E; margin-top: 3px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.si-storage-usedin-tag { background: #fff5f5; color: #ff3131; border-radius: 999px; padding: 1px 8px; font-size: 0.68rem; font-weight: 600; }
.si-storage-usedin-more { font-size: 0.68rem; color: #9E9E9E; font-weight: 600; }
.si-card-expand-btn { margin: 4px 8px 8px; width: calc(100% - 16px); }

.si-card {
  border-color: var(--fb-border, #E5E7EB) !important;
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--fb-surface, #FFFFFF);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.si-card:hover {
  border-color: rgba(255, 49, 49, 0.26) !important;
  box-shadow: var(--fb-shadow-hover, 0 4px 16px rgba(15, 23, 42, 0.08));
  /* Fond visible au survol (sinon blanc sur blanc). */
  background: rgba(255, 49, 49, 0.05);
}
.si-card-name,
.si-storage-item-name {
  color: var(--fb-text, #212121);
}
.si-card-item-count,
.si-storage-item-usedin,
.si-storage-usedin-more {
  color: var(--fb-muted, #6B7280);
}
.si-storage-item {
  border-color: var(--fb-border, #E5E7EB);
}
.si-storage-item:hover {
  background: var(--fb-subtle, #FAFAFA);
}
.si-card-storagetype {
  border-color: var(--fb-border, #E5E7EB);
  background: var(--fb-subtle, #FAFAFA);
  color: var(--fb-muted, #6B7280);
}
.si-storage-usedin-tag {
  background: var(--fb-primary-soft, #FFF5F5);
  color: #ff3131;
}
.si-storage-action,
.si-card-expand-btn {
  border-radius: var(--fb-radius-control, 8px);
}
</style>
