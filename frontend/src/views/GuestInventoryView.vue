<template>
  <div class="gi-root">
    <div class="gi-header">
      <div>
        <p class="gi-header__eyebrow">{{ phaseLabel }}</p>
        <h1 class="gi-header__title">{{ elementName }}</h1>
      </div>
      <v-progress-circular v-if="saving" indeterminate size="20" width="2" color="#ff3131" />
      <CheckCircle2 v-else-if="justSaved" :size="20" color="#66BB6A" />
    </div>

    <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" />

    <v-alert v-if="loadError" type="error" variant="tonal" density="compact" class="ma-4">
      {{ loadError }}
    </v-alert>

    <div v-else class="gi-list">
      <div v-for="item in items" :key="item.itemId" class="gi-card">
        <div class="gi-card__head">
          <p class="gi-card__name">{{ item.name }}</p>
          <v-checkbox
            v-model="item.isCounted"
            density="compact"
            hide-details
            color="#ff3131"
            @update:model-value="scheduleSave(item)"
          />
        </div>

        <div class="gi-card__fields">
          <v-text-field
            v-model.number="item.packedUnits"
            type="number"
            min="0"
            label="Carton"
            variant="outlined"
            density="compact"
            hide-details
            @update:model-value="scheduleSave(item)"
          />
          <v-text-field
            v-model.number="item.looseUnits"
            type="number"
            min="0"
            label="Vrac"
            variant="outlined"
            density="compact"
            hide-details
            @update:model-value="scheduleSave(item)"
          />
        </div>

        <p v-if="expectedFor(item.itemId)" class="gi-card__expected">
          Attendu : {{ expectedFor(item.itemId).packed }} carton · {{ expectedFor(item.itemId).loose }} vrac
        </p>
      </div>

      <p v-if="!loading && items.length === 0" class="gi-empty">Aucun article à compter pour ce point de vente.</p>
    </div>
  </div>
</template>

<script>
import { CheckCircle2 } from 'lucide-vue-next';
import { getGuestInventory, getGuestBaseline, saveGuestCount } from '@/api/endpoints/guestPin.api';

const SAVE_DEBOUNCE_MS = 600;

export default {
  name: 'GuestInventoryView',
  components: { CheckCircle2 },

  data() {
    return {
      elementName: '',
      items: [],
      expected: {},
      loading: true,
      loadError: '',
      saving: false,
      justSaved: false,
      saveTimers: {},
    };
  },

  computed: {
    session() {
      return this.$store.getters['guestPin/session'];
    },
    phaseLabel() {
      return this.session?.phase === 'pre-event' ? 'Inventaire pré-événement' : 'Inventaire post-événement';
    },
  },

  async mounted() {
    await this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      this.loadError = '';
      try {
        const inventory = await getGuestInventory();
        this.elementName = inventory.elementName || this.session?.elementName || '';
        this.items = inventory.items || [];

        if (this.session?.showExpected) {
          const baseline = await getGuestBaseline();
          this.expected = baseline?.expected?.[inventory.elementId] || {};
        }
      } catch (error) {
        this.loadError = "Impossible de charger l'inventaire.";
      } finally {
        this.loading = false;
      }
    },

    expectedFor(itemId) {
      return this.expected[itemId] || null;
    },

    scheduleSave(item) {
      clearTimeout(this.saveTimers[item.itemId]);
      this.saveTimers[item.itemId] = setTimeout(() => this.persist(item), SAVE_DEBOUNCE_MS);
    },

    async persist(item) {
      this.saving = true;
      this.justSaved = false;
      try {
        await saveGuestCount({
          itemId: item.itemId,
          packedUnits: Number(item.packedUnits) || 0,
          looseUnits: Number(item.looseUnits) || 0,
          isCounted: !!item.isCounted,
          storageLocation: item.storageLocation ?? null,
          countingStatus: item.isCounted ? 'counted' : 'pending',
        });
        this.justSaved = true;
        setTimeout(() => (this.justSaved = false), 1500);
      } catch (error) {
        this.loadError = 'La sauvegarde a échoué, réessayez.';
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.gi-root {
  min-height: 100vh;
  background: #f5f5f5;
}

.gi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  background: #0f172a;
  color: #fff;
}

.gi-header__eyebrow {
  margin: 0;
  color: #ff3131;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.gi-header__title {
  margin: 4px 0 0 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.gi-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gi-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.gi-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gi-card__name {
  margin: 0;
  font-weight: 600;
  font-size: 0.9375rem;
}

.gi-card__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
}

.gi-card__expected {
  margin: 8px 0 0 0;
  color: #64748b;
  font-size: 0.75rem;
}

.gi-empty {
  text-align: center;
  color: #64748b;
  padding: 40px 16px;
}
</style>
