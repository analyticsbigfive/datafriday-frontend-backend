<template>
  <v-dialog :model-value="modelValue" max-width="520" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon color="primary" size="20">mdi-calendar-edit</v-icon>
        {{ t('intgEnrichEvtTitle') }}
        <span v-if="event" class="text-body-2 text-medium-emphasis ml-1">— {{ event.name }}</span>
      </v-card-title>
      <v-card-text class="pt-2">
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model="form.doorsOpening"
              :label="t('intgEnrichEvtDoorsOpening')"
              placeholder="18:30"
              prepend-inner-icon="mdi-door-open"
              :hint="t('intgEnrichEvtTimeHint')"
              persistent-hint
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.showTime"
              :label="t('intgEnrichEvtShowTime')"
              placeholder="20:00"
              prepend-inner-icon="mdi-clock-start"
              :hint="t('intgEnrichEvtTimeHint')"
              persistent-hint
            />
          </v-col>
          <v-col cols="6">
            <v-select
              v-model="form.category"
              :items="['sport', 'musique', 'festival', 'conference', 'autre']"
              :label="t('intgEnrichEvtCategory')"
              prepend-inner-icon="mdi-tag"
              clearable
            />
          </v-col>
          <v-col cols="6">
            <v-select
              v-model="form.eventType"
              :items="[{ title: t('intgEnrichEvtTypeHome'), value: 'home' }, { title: t('intgEnrichEvtTypeAway'), value: 'away' }, { title: t('intgEnrichEvtTypeNeutral'), value: 'neutral' }]"
              item-title="title"
              item-value="value"
              :label="t('intgEnrichEvtType')"
              prepend-inner-icon="mdi-home-city"
              clearable
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.team"
              :label="t('intgEnrichEvtHomeTeam')"
              prepend-inner-icon="mdi-shield"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.visitingTeam"
              :label="t('intgEnrichEvtVisitingTeam')"
              prepend-inner-icon="mdi-shield-outline"
            />
          </v-col>
          <v-col cols="12">
            <v-switch
              v-model="form.hasIntermission"
              :label="t('intgEnrichEvtIntermission')"
              color="primary"
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('intgEnrichEvtCancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          @click="$emit('save', form)"
        >
          {{ t('intgEnrichEvtSave') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'EnrichEventDialog',
  setup() {
    const { t } = useI18n()
    return { t }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    event: { type: Object, default: null },
    saving: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'save'],
  data() {
    return {
      form: {
        doorsOpening: '',
        showTime: '',
        category: '',
        eventType: '',
        team: '',
        visitingTeam: '',
        hasIntermission: false,
      },
    }
  },
  watch: {
    modelValue(val) {
      if (val && this.event) {
        this.form = {
          doorsOpening: this.event.doorsOpening ?? '',
          showTime: this.event.showTime ?? '',
          category: this.event.category ?? '',
          eventType: this.event.eventType ?? '',
          team: this.event.team ?? '',
          visitingTeam: this.event.visitingTeam ?? '',
          hasIntermission: this.event.hasIntermission ?? false,
        }
      }
    },
  },
}
</script>
