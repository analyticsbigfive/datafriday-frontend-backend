<template>
  <v-dialog :model-value="modelValue" max-width="520" persistent @update:model-value="onToggle">
    <v-card>
      <v-card-title class="rpd-title">{{ t('srPlanDupTitle') }}</v-card-title>
      <v-card-text>
        <p class="rpd-body">{{ bodyText }}</p>
        <p v-if="existingEvents" class="rpd-events">{{ existingEvents }}</p>

        <div class="rpd-choices" role="radiogroup" :aria-label="t('srPlanDupTitle')">
          <label class="rpd-choice" :class="{ 'rpd-choice--on': mode === 'replace' }">
            <input v-model="mode" type="radio" value="replace" />
            <span>
              <strong>{{ t('srPlanDupReplace') }}</strong>
              <small>{{ t('srPlanDupReplaceHint') }}</small>
            </span>
          </label>
          <label class="rpd-choice" :class="{ 'rpd-choice--on': mode === 'create' }">
            <input v-model="mode" type="radio" value="create" />
            <span>
              <strong>{{ t('srPlanDupCreate') }}</strong>
              <small>{{ t('srPlanDupCreateHint') }}</small>
            </span>
          </label>
        </div>

        <v-text-field
          v-if="mode === 'create'"
          v-model="newName"
          :label="t('srPlanDupNameLabel')"
          :error-messages="nameError"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          autofocus
          @keyup.enter="confirm"
        />
      </v-card-text>
      <v-card-actions class="rpd-actions">
        <v-btn variant="text" @click="$emit('cancel')">{{ t('srPlanDetachCancel') }}</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" :disabled="!canConfirm" @click="confirm">
          {{ mode === 'replace' ? t('srPlanDupConfirmReplace') : t('srPlanDupConfirmCreate') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
// Dialogue « cette commande existe déjà » (retour Bertrand 2026-11-10) : même jeu d'events
// déjà sauvegardé. Deux issues : remplacer la commande existante (confirmation explicite,
// y compris si elle a été envoyée aux fournisseurs) ou créer une nouvelle commande sous un
// nouveau nom. Présentation seule : la décision remonte par événements.
import { useI18n } from '@/i18n/useI18n'
import { isPlanNameTaken } from '@/utils/restockPlanMatch'

export default {
  name: 'RestockPlanDuplicateDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    /** Métadonnées de la commande existante la plus récente pour ces events. */
    existing: { type: Object, default: null },
    /** Nom proposé pour la nouvelle commande. */
    suggestedName: { type: String, default: '' },
    /** Toutes les commandes de l'espace (noms déjà pris). */
    plans: { type: Array, default: () => [] },
  },
  emits: ['replace', 'create', 'cancel'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  data() {
    return { mode: 'replace', newName: '' }
  },
  computed: {
    existingName() { return this.existing?.name || '' },
    bodyText() { return this.t('srPlanDupBody').replace('{name}', this.existingName) },
    existingEvents() {
      const names = (this.existing?.eventsSnapshot || []).map((e) => e?.name).filter(Boolean)
      return names.join(', ')
    },
    nameError() {
      if (this.mode !== 'create') return ''
      if (!this.newName.trim()) return this.t('srPlanDupNameRequired')
      return isPlanNameTaken(this.plans, this.newName) ? this.t('srPlanDupNameTaken') : ''
    },
    canConfirm() {
      return this.mode === 'replace' || !this.nameError
    },
  },
  watch: {
    modelValue(open) {
      if (!open) return
      this.mode = 'replace'
      this.newName = this.suggestedName
    },
  },
  methods: {
    onToggle(open) { if (!open) this.$emit('cancel') },
    confirm() {
      if (!this.canConfirm) return
      if (this.mode === 'replace') this.$emit('replace', this.existing?.id)
      else this.$emit('create', this.newName.trim())
    },
  },
}
</script>

<style scoped>
.rpd-title { font-size: var(--fs-lg); font-weight: var(--fw-semibold); }
.rpd-body { margin: 0 0 4px; }
.rpd-events { margin: 0 0 12px; opacity: 0.7; font-size: var(--fs-sm); }
.rpd-choices { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.rpd-choice {
  display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
  padding: 10px 12px; border: 1px solid rgba(0, 0, 0, 0.15); border-radius: 8px;
}
.rpd-choice--on { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.06); }
.rpd-choice span { display: flex; flex-direction: column; gap: 2px; }
.rpd-choice small { opacity: 0.7; font-size: var(--fs-sm); }
.rpd-actions { padding: 8px 16px 16px; }
</style>
