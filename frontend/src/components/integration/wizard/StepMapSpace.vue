<template>
  <div class="smsp-wrap" :class="{ 'smsp--dark': isDark }">

    <!-- ── Gradient Header ── -->
    <div class="smsp-header">
      <div class="smsp-header__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
      </div>
      <div class="smsp-header__body">
        <p class="smsp-header__title">
          {{ t('intgSpaceHeaderTitlePrefix') }} « {{ location.name }} » {{ t('intgSpaceHeaderTitleSuffix') }}
          <span class="smsp-header__step">{{ t('intgSpaceHeaderStep') }}</span>
        </p>
        <p class="smsp-header__sub">{{ t('intgSpaceHeaderSub') }}</p>
      </div>
      <span class="smsp-status-badge" :class="selectedSpaceId ? 'smsp-status-badge--green' : 'smsp-status-badge--gray'">
        {{ selectedSpaceId ? t('intgSpaceBadgeAssociated') : t('intgSpaceBadgePending') }}
      </span>
    </div>

    <!-- ── Loading ── -->
    <div v-if="loading" class="smsp-skeletons">
      <div class="smsp-skeleton-row smsp-skeleton-row--tall"></div>
      <div class="smsp-skeleton-row"></div>
      <div class="smsp-skeleton-row"></div>
    </div>

    <template v-else>

      <!-- ── Suggestion banner ── -->
      <div v-if="suggestion && !selectedSpaceId" class="smsp-banner smsp-banner--blue">
        <div class="smsp-banner__left">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="smsp-banner__icon"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
          <span>
            <strong>{{ t('intgSpaceSuggestionLabel') }}</strong> « {{ suggestion.space.name }} »
            <span class="smsp-score-badge">{{ suggestion.score }}% {{ t('intgSpaceSimilarity') }}</span>
          </span>
        </div>
        <button class="smsp-banner-btn smsp-banner-btn--blue" @click="selectSpace(suggestion.space.id)">
          {{ t('intgSpaceUse') }}
        </button>
      </div>

      <!-- ── Selected space banner ── -->
      <div v-if="selectedSpaceId" class="smsp-banner smsp-banner--green">
        <div class="smsp-banner__left">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="smsp-banner__icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
          <span><strong>{{ selectedSpaceName }}</strong> {{ t('intgSpaceSelectedSuccess') }}</span>
        </div>
      </div>

      <!-- ── Space selector card ── -->
      <div class="smsp-card">
        <label class="smsp-section-label smsp-section-label--red" for="smsp-space-select">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>{{ t('intgSpaceExisting') }}</span>
        </label>
        <div class="smsp-select-wrap">
          <select
            id="smsp-space-select"
            v-model="selectedSpaceId"
            class="smsp-select"
            :disabled="saving"
          >
            <option value="" disabled>{{ t('intgSpaceSelectPlaceholder') }}</option>
            <option v-for="item in spaceItems" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <button v-if="selectedSpaceId" class="smsp-select-clear" :title="t('intgSpaceDeselect')" :aria-label="t('intgSpaceDeselect')" @click="selectedSpaceId = null">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- ── Divider ── -->
      <div class="smsp-or-divider">
        <div class="smsp-or-divider__line" />
        <span class="smsp-or-pill">{{ t('intgSpaceOrCreateNew') }}</span>
        <div class="smsp-or-divider__line" />
      </div>

      <!-- ── Create new space collapsible ── -->
      <div class="smsp-expand-card">
        <button
          class="smsp-expand-trigger"
          :class="{ 'smsp-expand-trigger--open': createPanelOpen }"
          :aria-expanded="createPanelOpen"
          aria-controls="smsp-create-panel"
          @click="createPanelOpen = !createPanelOpen"
        >
          <div class="smsp-expand-trigger__left">
            <div class="smsp-icon-badge">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div>
              <div class="smsp-expand-trigger__title">{{ t('intgSpaceCreateNewTitle') }}</div>
              <div class="smsp-expand-trigger__sub">{{ t('intgSpaceCreateNewSub') }}</div>
            </div>
          </div>
          <svg class="smsp-expand-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>

        <Transition name="smsp-expand">
          <div v-if="createPanelOpen" id="smsp-create-panel" class="smsp-expand-body">

            <!-- Identité -->
            <div class="smsp-section-label smsp-section-label--red mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
              <span>{{ t('intgSpaceSectionIdentity') }}</span>
            </div>

            <div class="form-floating mb-3">
              <input
                id="smsp-name"
                v-model="newSpace.name"
                type="text"
                class="form-control smsp-input"
                :class="{ 'is-invalid': submitted && formErrors.name }"
                placeholder=" "
              />
              <label for="smsp-name">{{ t('intgSpaceFieldName') }}</label>
              <div v-if="submitted && formErrors.name" class="smsp-invalid">{{ formErrors.name }}</div>
            </div>

            <div class="smsp-field-wrap mb-3">
              <label class="smsp-field-label">{{ t('intgSpaceFieldPlaceType') }}</label>
              <select v-model="newSpace.spaceType" class="smsp-select smsp-select--full">
                <option value="">{{ t('intgSpaceSelectEmpty') }}</option>
                <option v-for="opt in spaceTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <div class="form-floating">
                  <input
                    id="smsp-maxcap"
                    v-model.number="newSpace.maxCapacity"
                    type="number"
                    min="0"
                    class="form-control smsp-input"
                    :class="{ 'is-invalid': formErrors.maxCapacity }"
                    placeholder=" "
                  />
                  <label for="smsp-maxcap">{{ t('intgSpaceFieldMaxCapacity') }}</label>
                  <div v-if="formErrors.maxCapacity" class="smsp-invalid">{{ formErrors.maxCapacity }}</div>
                </div>
              </div>
              <div class="col-6">
                <div class="form-floating">
                  <input
                    id="smsp-dept"
                    v-model="newSpace.department"
                    type="text"
                    inputmode="text"
                    class="form-control smsp-input"
                    :class="{ 'is-invalid': formErrors.department }"
                    placeholder=" "
                  />
                  <label for="smsp-dept">{{ t('intgSpaceFieldDepartment') }}</label>
                  <div v-if="formErrors.department" class="smsp-invalid">{{ formErrors.department }}</div>
                </div>
              </div>
            </div>

            <div class="form-floating mb-3">
              <input
                id="smsp-hometeam"
                v-model="newSpace.homeTeam"
                type="text"
                class="form-control smsp-input"
                placeholder=" "
              />
              <label for="smsp-hometeam">{{ t('intgSpaceFieldHomeTeam') }}</label>
            </div>

            <!-- Adresse -->
            <div class="smsp-form-divider" />
            <div class="smsp-section-label smsp-section-label--red mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{{ t('intgSpaceSectionAddress') }}</span>
            </div>

            <div class="form-floating mb-3">
              <input id="smsp-addr1" v-model="newSpace.addressLine1" type="text" class="form-control smsp-input" placeholder=" " />
              <label for="smsp-addr1">{{ t('intgSpaceFieldAddress') }}</label>
            </div>
            <div class="form-floating mb-3">
              <input id="smsp-addr2" v-model="newSpace.addressLine2" type="text" class="form-control smsp-input" placeholder=" " />
              <label for="smsp-addr2">{{ t('intgSpaceFieldAddress2') }}</label>
            </div>
            <div class="row g-2 mb-3">
              <div class="col-7">
                <div class="form-floating">
                  <input id="smsp-city" v-model="newSpace.city" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-city">{{ t('intgSpaceFieldCity') }}</label>
                </div>
              </div>
              <div class="col-5">
                <div class="form-floating">
                  <input id="smsp-postcode" v-model="newSpace.postcode" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-postcode">{{ t('intgSpaceFieldPostcode') }}</label>
                </div>
              </div>
            </div>
            <div class="form-floating mb-3">
              <input id="smsp-country" v-model="newSpace.country" type="text" class="form-control smsp-input" placeholder=" " />
              <label for="smsp-country">{{ t('intgSpaceFieldCountry') }}</label>
            </div>

            <!-- Contact -->
            <div class="smsp-form-divider" />
            <div class="smsp-section-label smsp-section-label--red mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span>{{ t('intgSpaceSectionContact') }}</span>
            </div>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <div class="form-floating">
                  <input
                    id="smsp-email"
                    v-model="newSpace.email"
                    type="email"
                    class="form-control smsp-input"
                    :class="{ 'is-invalid': formErrors.email }"
                    placeholder=" "
                  />
                  <label for="smsp-email">{{ t('intgSpaceFieldEmail') }}</label>
                  <div v-if="formErrors.email" class="smsp-invalid">{{ formErrors.email }}</div>
                </div>
              </div>
              <div class="col-6">
                <div class="form-floating">
                  <input id="smsp-tel" v-model="newSpace.tel" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-tel">{{ t('intgSpaceFieldPhone') }}</label>
                </div>
              </div>
            </div>

            <div class="form-floating mb-3">
              <input id="smsp-contact" v-model="newSpace.mainContactPerson" type="text" class="form-control smsp-input" placeholder=" " />
              <label for="smsp-contact">{{ t('intgSpaceFieldContactPerson') }}</label>
            </div>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <div class="form-floating">
                  <input
                    id="smsp-cemail"
                    v-model="newSpace.contactEmail"
                    type="email"
                    class="form-control smsp-input"
                    :class="{ 'is-invalid': formErrors.contactEmail }"
                    placeholder=" "
                  />
                  <label for="smsp-cemail">{{ t('intgSpaceFieldContactEmail') }}</label>
                  <div v-if="formErrors.contactEmail" class="smsp-invalid">{{ formErrors.contactEmail }}</div>
                </div>
              </div>
              <div class="col-6">
                <div class="form-floating">
                  <input id="smsp-ctel" v-model="newSpace.contactTel" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-ctel">{{ t('intgSpaceFieldContactPhone') }}</label>
                </div>
              </div>
            </div>

            <!-- Réseaux sociaux -->
            <div class="smsp-form-divider" />
            <div class="smsp-section-label smsp-section-label--red mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              <span>{{ t('intgSpaceSectionSocial') }}</span>
            </div>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <div class="form-floating">
                  <input id="smsp-instagram" v-model="newSpace.instagram" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-instagram">Instagram</label>
                </div>
              </div>
              <div class="col-6">
                <div class="form-floating">
                  <input id="smsp-tiktok" v-model="newSpace.tiktok" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-tiktok">TikTok</label>
                </div>
              </div>
            </div>
            <div class="row g-2 mb-3">
              <div class="col-6">
                <div class="form-floating">
                  <input id="smsp-facebook" v-model="newSpace.facebook" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-facebook">Facebook</label>
                </div>
              </div>
              <div class="col-6">
                <div class="form-floating">
                  <input id="smsp-twitter" v-model="newSpace.twitter" type="text" class="form-control smsp-input" placeholder=" " />
                  <label for="smsp-twitter">X / Twitter</label>
                </div>
              </div>
            </div>

            <div class="smsp-form-divider" />
            <button
              class="smsp-btn smsp-btn--primary smsp-btn--full"
              :disabled="saving || !newSpace.name"
              @click="handleCreateSpace"
            >
              <v-progress-circular v-if="saving" indeterminate size="16" width="2" color="white" />
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {{ t('intgSpaceCreateSpaceBtn') }}
            </button>

          </div>
        </Transition>
      </div>

    </template>

    <!-- ── Post-creation dialog: config name + RDC floor ── -->
    <v-dialog v-model="postCreateDialog" max-width="500" persistent>
      <v-card rounded="xl" elevation="8" style="overflow: hidden;">
        <div class="smsp-dialog-header">
          <div class="smsp-dialog-header__icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M21 12h-2M5 12H3M19.07 19.07l-1.41-1.41M5.34 5.34 3.93 3.93M12 21v-2M12 5V3"/></svg>
          </div>
          <div>
            <div class="smsp-dialog-header__title">{{ t('intgSpaceDialogTitle') }}</div>
            <div class="smsp-dialog-header__sub">{{ t('intgSpaceDialogSub') }}</div>
          </div>
        </div>

        <v-card-text class="px-5 py-4">
          <div class="form-floating mb-3">
            <input
              id="dlg-configname"
              v-model="configForm.configName"
              type="text"
              class="form-control smsp-input"
              placeholder=" "
            />
            <label for="dlg-configname">{{ t('intgSpaceConfigName') }}</label>
          </div>

          <div class="smsp-form-divider" />
          <div class="smsp-section-label smsp-section-label--red mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            <span>{{ t('intgSpaceGroundFloor') }}</span>
          </div>

          <div class="form-floating mb-3">
            <input
              id="dlg-floorname"
              v-model="configForm.floorName"
              type="text"
              class="form-control smsp-input"
              placeholder=" "
            />
            <label for="dlg-floorname">{{ t('intgSpaceFloorName') }}</label>
          </div>

          <div class="smsp-section-label mb-3"><span>{{ t('intgSpaceDimensions') }}</span></div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <div class="form-floating">
                <input
                  id="dlg-width"
                  v-model.number="configForm.floorWidth"
                  type="number"
                  min="1"
                  class="form-control smsp-input"
                  placeholder=" "
                />
                <label for="dlg-width">{{ t('intgSpaceWidth') }}</label>
              </div>
            </div>
            <div class="col-6">
              <div class="form-floating">
                <input
                  id="dlg-length"
                  v-model.number="configForm.floorLength"
                  type="number"
                  min="1"
                  class="form-control smsp-input"
                  placeholder=" "
                />
                <label for="dlg-length">{{ t('intgSpaceLength') }}</label>
              </div>
            </div>
          </div>

          <!-- Erreur affichée dans le dialog lui-même — la bannière de la page sous-jacente
               est masquée derrière ce dialog persistant au moment de l'échec. -->
          <div v-if="configError" class="smsp-infobar smsp-infobar--error mt-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{{ configError }}</span>
          </div>
        </v-card-text>

        <div class="smsp-dialog-footer">
          <button class="smsp-btn smsp-btn--ghost" :disabled="creatingConfig" @click="skipPostCreate">
            {{ t('intgSpaceSkip') }}
          </button>
          <button class="smsp-btn smsp-btn--primary" :disabled="creatingConfig" @click="handleConfirmConfig">
            <v-progress-circular v-if="creatingConfig" indeterminate size="14" width="2" color="white" />
            {{ t('intgSpaceCreateConfigBtn') }}
          </button>
        </div>
      </v-card>
    </v-dialog>

    <!-- ── Footer teleport ── -->
    <!-- BUG-273 : l'erreur principale est téléportée avec le bouton (même Teleport que le
         footer) pour rester visible dans la zone fixe .iw-footer, au lieu d'être perdue en
         haut du corps scrollable .iw-body du wizard parent (IntegrationWizard.vue). -->
    <Teleport :to="footerTarget" :disabled="!footerTarget">
      <div class="smsp-footer-teleport">
        <div v-if="error" class="smsp-infobar smsp-infobar--error smsp-footer-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{{ error }}</span>
        </div>
        <div class="smsp-footer-actions">
          <span></span>
          <button
            class="smsp-btn smsp-btn--primary"
            :disabled="!selectedSpaceId || saving || postCreateDialog"
            @click="handleSave"
          >
            <v-progress-circular v-if="saving" indeterminate size="16" width="2" color="white" />
            <span v-else>{{ t('intgSpaceNext') }}</span>
            <svg v-if="!saving" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script>
import { createSpace } from '@/api/endpoints/space.api'
import { createLocationSpaceMapping } from '@/api/endpoints/mapping.api'
import { createConfiguration } from '@/api/endpoints/configuration.api'
import { t as translate } from '@/i18n'

const SIMILARITY_THRESHOLD = 0.4
const MIN_NAME_LENGTH_FOR_SIMILARITY = 3
const DEFAULT_CONFIG_NAME = 'Configuration principale'
const DEFAULT_FLOOR_NAME = 'RDC'
const DEFAULT_FLOOR_WIDTH = 100
const DEFAULT_FLOOR_LENGTH = 100
// A2 : nom de config interne backend, à ne jamais laisser un utilisateur reproduire
// (cf. handleConfirmConfig) — collision avec le filtre isSystem/nom du sélecteur d'étage.
const WEEZEVENT_IMPORT_CONFIG_NAME = 'weezevent import'

function createEmptySpace() {
  return {
    name: '',
    spaceType: '',
    maxCapacity: null,
    department: null,
    homeTeam: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    postcode: '',
    country: '',
    email: '',
    tel: '',
    mainContactPerson: '',
    contactEmail: '',
    contactTel: '',
    instagram: '',
    tiktok: '',
    facebook: '',
    twitter: '',
  }
}

export default {
  name: 'StepMapSpace',

  props: {
    location: { type: Object, required: true },
    initialSpaceId: { type: String, default: null },
    isDark: { type: Boolean, default: false },
    footerTarget: { type: [Object, String], default: null },
  },

  emits: ['completed'],

  data() {
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      loading: false,
      saving: false,
      error: null,
      selectedSpaceId: this.initialSpaceId,
      createPanelOpen: false,
      submitted: false,
      newSpace: createEmptySpace(),
      postCreateDialog: false,
      postCreateSpaceId: null,
      creatingConfig: false,
      configError: null,
      configForm: {
        // A2 : ne PAS proposer "weezevent import" par défaut — ce nom entre en collision
        // avec la config interne backend "Weezevent Import" et serait masqué par le filtre
        // isSystem/nom du sélecteur d'étage (la config utilisateur deviendrait invisible).
        configName: DEFAULT_CONFIG_NAME,
        floorName: DEFAULT_FLOOR_NAME,
        floorWidth: DEFAULT_FLOOR_WIDTH,
        floorLength: DEFAULT_FLOOR_LENGTH,
      },
    }
  },

  computed: {
    spaces() {
      return this.$store.getters['spaces/spaces'] || []
    },
    spaceItems() {
      const nameCounts = {}
      for (const s of this.spaces) {
        const key = (s.name || '').trim().toLowerCase()
        nameCounts[key] = (nameCounts[key] || 0) + 1
      }
      return this.spaces.map(s => {
        const key = (s.name || '').trim().toLowerCase()
        const isDuplicate = nameCounts[key] > 1
        const disambiguator = isDuplicate ? (s.city || `#${String(s.id).slice(0, 6)}`) : ''
        return { title: disambiguator ? `${s.name} (${disambiguator})` : s.name, value: s.id }
      })
    },
    selectedSpaceName() {
      return this.spaces.find(s => s.id === this.selectedSpaceId)?.name || ''
    },
    spaceTypeOptions() {
      return [
        { value: 'Stadium', label: this.t('intgSpaceTypeStadium') },
        { value: 'Arena', label: this.t('intgSpaceTypeArena') },
        { value: 'Zénith', label: this.t('intgSpaceTypeZenith') },
        { value: 'Indoor Festival', label: this.t('intgSpaceTypeIndoorFestival') },
      ]
    },
    suggestion() {
      if (this.selectedSpaceId) return null
      return this.suggestSpace(this.location?.name)
    },
    formErrors() {
      const e = {}
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const departmentRe = /^(2[AB]|\d{1,3})$/i
      const trimmedName = this.newSpace.name?.trim() || ''
      if (!trimmedName) {
        e.name = this.t('intgSpaceErrNameRequired')
      } else if (this.spaces.some(s => (s.name || '').trim().toLowerCase() === trimmedName.toLowerCase())) {
        e.name = this.t('intgSpaceErrNameDuplicate')
      }
      if (this.newSpace.email && !emailRe.test(this.newSpace.email)) {
        e.email = this.t('intgSpaceErrEmailInvalid')
      }
      if (this.newSpace.contactEmail && !emailRe.test(this.newSpace.contactEmail)) {
        e.contactEmail = this.t('intgSpaceErrEmailInvalid')
      }
      if (this.newSpace.maxCapacity !== null && this.newSpace.maxCapacity !== '' && Number(this.newSpace.maxCapacity) < 0) {
        e.maxCapacity = this.t('intgSpaceErrPositiveValue')
      }
      const trimmedDepartment = String(this.newSpace.department ?? '').trim()
      if (trimmedDepartment && !departmentRe.test(trimmedDepartment)) {
        e.department = this.t('intgSpaceErrDepartmentInvalid')
      }
      return e
    },
    formValid() {
      return Object.keys(this.formErrors).length === 0
    },
  },

  async mounted() {
    window.addEventListener('locale-changed', this.handleLocaleChange)
    await this.loadAll()
  },

  beforeUnmount() {
    window.removeEventListener('locale-changed', this.handleLocaleChange)
  },

  methods: {
    t(key) {
      return translate(key, this.locale)
    },

    handleLocaleChange(event) {
      this.locale = event.detail.locale
    },

    async loadAll() {
      this.loading = true
      this.error = null
      try {
        await this.$store.dispatch('spaces/fetchSpaces', { forceRefresh: true })
      } catch (err) {
        console.error('[StepMapSpace] loadAll error:', err)
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    selectSpace(id) {
      this.selectedSpaceId = id
    },

    suggestSpace(locationName) {
      if (!locationName || !this.spaces.length) return null
      let bestMatch = null
      let bestScore = 0
      const normalizedLocationName = this.normalizeForComparison(locationName)
      if (normalizedLocationName.length < MIN_NAME_LENGTH_FOR_SIMILARITY) return null
      for (const space of this.spaces) {
        const normalizedSpaceName = this.normalizeForComparison(space.name)
        if (normalizedSpaceName.length < MIN_NAME_LENGTH_FOR_SIMILARITY) continue
        const score = this.calculateSimilarity(normalizedLocationName, normalizedSpaceName)
        if (score > bestScore && score > SIMILARITY_THRESHOLD) {
          bestScore = score
          bestMatch = { space, score: Math.round(score * 100) }
        }
      }
      return bestMatch
    },

    // Replie les accents et coupe les espaces parasites avant comparaison, pour éviter
    // des faux négatifs de similarité (ex. "Café Nord" vs "Cafe Nord ").
    normalizeForComparison(str) {
      return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
    },

    calculateSimilarity(a, b) {
      if (a === b) return 1
      const longer = a.length > b.length ? a : b
      const shorter = a.length > b.length ? b : a
      if (longer.length === 0) return 1
      const costs = []
      for (let i = 0; i <= longer.length; i++) {
        let lastValue = i
        for (let j = 0; j <= shorter.length; j++) {
          if (i === 0) {
            costs[j] = j
          } else if (j > 0) {
            let newValue = costs[j - 1]
            if (longer[i - 1] !== shorter[j - 1]) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
            }
            costs[j - 1] = lastValue
            lastValue = newValue
          }
        }
        if (i > 0) costs[shorter.length] = lastValue
      }
      return (longer.length - costs[shorter.length]) / longer.length
    },

    async handleCreateSpace() {
      this.submitted = true
      if (!this.formValid) return
      this.saving = true
      this.error = null
      try {
        const payload = { ...this.newSpace }
        if (!payload.spaceType) {
          payload.spaceType = undefined
        }
        const space = await createSpace(payload)
        if (space) {
          // Ajout optimiste immédiat → selectedSpaceName correct de suite
          this.$store.dispatch('spaces/addSpace', space)
          this.selectedSpaceId = space.id ?? space.data?.id
          this.postCreateSpaceId = this.selectedSpaceId
          // Ouvrir le dialog de configuration initiale
          this.postCreateDialog = true
        }
      } catch (err) {
        this.error = err.message
      } finally {
        this.saving = false
      }
    },

    async handleSave() {
      if (!this.selectedSpaceId) return
      // If the mapping already exists (same space as when this step opened), skip the API call
      if (this.selectedSpaceId === this.initialSpaceId) {
        this.$emit('completed', { spaceId: this.selectedSpaceId })
        return
      }
      this.saving = true
      this.error = null
      try {
        await createLocationSpaceMapping(this.location.id, this.selectedSpaceId)
        this.$emit('completed', { spaceId: this.selectedSpaceId })
      } catch (err) {
        this.error = err.message
      } finally {
        this.saving = false
      }
    },

    async handleConfirmConfig() {
      this.creatingConfig = true
      this.configError = null
      try {
        // A2 : garde-fou — un nom vide ou "weezevent import" est remplacé par un nom neutre,
        // sinon la config utilisateur serait masquée par le filtre du sélecteur d'étage.
        let configName = (this.configForm.configName || '').trim()
        if (!configName || configName.toLowerCase() === WEEZEVENT_IMPORT_CONFIG_NAME) {
          configName = DEFAULT_CONFIG_NAME
        }
        await createConfiguration({
          name: configName,
          spaceId: this.postCreateSpaceId,
          capacity: 0,
          data: {
            floors: [{
              name: this.configForm.floorName || DEFAULT_FLOOR_NAME,
              level: 0,
              width: this.configForm.floorWidth || DEFAULT_FLOOR_WIDTH,
              length: this.configForm.floorLength || DEFAULT_FLOOR_LENGTH,
              height: 4,
              elements: [],
              cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
              hole: {
                enabled: false, x: 0.5, y: 0.5, width: 10, length: 10,
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
              },
            }],
            forecourt: null,
            externalMerch: null,
          },
        })
        // Succès uniquement : on referme le dialog et on nettoie son état.
        this.closePostCreate()
      } catch (err) {
        console.error('[StepMapSpace] Error creating configuration:', err)
        // Le dialog reste ouvert en cas d'échec — la bannière d'erreur de la page
        // sous-jacente n'est pas visible derrière le dialog persistant. On affiche donc
        // l'erreur ici pour que l'utilisateur puisse la voir et réessayer/annuler.
        this.configError = err.message
      } finally {
        this.creatingConfig = false
      }
    },

    skipPostCreate() {
      this.closePostCreate()
    },

    closePostCreate() {
      this.postCreateDialog = false
      this.postCreateSpaceId = null
      this.configError = null
      this.newSpace = createEmptySpace()
      this.submitted = false
      this.createPanelOpen = false
      this.configForm = {
        configName: DEFAULT_CONFIG_NAME,
        floorName: DEFAULT_FLOOR_NAME,
        floorWidth: DEFAULT_FLOOR_WIDTH,
        floorLength: DEFAULT_FLOOR_LENGTH,
      }
      this.$store.dispatch('spaces/fetchSpaces', { forceRefresh: true })
    },
  },
}
</script>

<style scoped>
/* ── Wrapper ── */
.smsp-wrap { padding: 20px 24px; min-height: 100%; background: #f9fafb; }
.smsp--dark { background: #111827; color: #e5e7eb; }

/* ── Gradient Header ── */
.smsp-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; border-radius: 18px; margin-bottom: 16px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.smsp-header__icon {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.smsp-header__body { flex: 1; min-width: 0; }
.smsp-header__title { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 3px; }
.smsp-header__step  { font-size: 13px; font-weight: 400; opacity: .72; }
.smsp-header__sub   { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 0; }

.smsp-status-badge {
  display: inline-flex; align-items: center; padding: 4px 14px;
  border-radius: 100px; font-size: 12px; font-weight: 700;
  white-space: nowrap; flex-shrink: 0;
}
.smsp-status-badge--green { background: rgba(255,255,255,.22); color: #fff; }
.smsp-status-badge--gray  { background: rgba(0,0,0,.15); color: rgba(255,255,255,.85); }

/* ── Loading skeletons ── */
.smsp-skeletons { display: flex; flex-direction: column; gap: 10px; }
.smsp-skeleton-row {
  height: 56px; border-radius: 14px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: smsp-shimmer 1.4s infinite;
}
.smsp-skeleton-row--tall { height: 88px; }
@keyframes smsp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── Banners ── */
.smsp-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 16px; border-radius: 14px; margin-bottom: 12px;
  font-size: 13px;
}
.smsp-banner__left { display: flex; align-items: center; gap: 8px; flex: 1; }
.smsp-banner__icon { flex-shrink: 0; }
.smsp-banner--blue  { background: #eff6ff; border: 1.5px solid #bfdbfe; color: #1e40af; }
.smsp-banner--green { background: #f0fdf4; border: 1.5px solid #bbf7d0; color: #166534; }

.smsp-score-badge {
  background: rgba(30,64,175,.12); color: #1e40af;
  font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 100px;
}

.smsp-banner-btn {
  padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600;
  border: none; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all .15s;
}
.smsp-banner-btn--blue { background: #2563eb; color: #fff; }
.smsp-banner-btn--blue:hover { background: #1d4ed8; }

/* ── Section labels ── */
.smsp-section-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .7px; color: #9ca3af; margin-bottom: 8px;
}
.smsp-section-label--red { color: #ff3131; }

/* ── Card ── */
.smsp-card {
  padding: 16px; border-radius: 14px; background: #fff;
  border: 1.5px solid #e5e7eb; margin-bottom: 16px;
}
.smsp--dark .smsp-card { background: #1f2937; border-color: #374151; }

/* ── Native select ── */
.smsp-select-wrap { position: relative; display: flex; align-items: center; }
.smsp-select {
  width: 100%; padding: 9px 36px 9px 12px; border-radius: 10px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 13.5px; color: #111827; outline: none;
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
  transition: border-color .18s, box-shadow .18s; cursor: pointer;
}
.smsp-select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1); background-color: #fff; }
.smsp-select--full { width: 100%; }
.smsp-select:disabled { opacity: .5; cursor: not-allowed; }
.smsp--dark .smsp-select { background-color: #111827; border-color: #374151; color: #e5e7eb; }
.smsp--dark .smsp-select:focus { background-color: #1f2937; }

.smsp-select-clear {
  position: absolute; right: 8px;
  width: 22px; height: 22px; border-radius: 6px; border: none;
  background: #fee2e2; color: #ff3131; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
.smsp-select-clear:hover { background: #fecaca; }

/* ── Or divider ── */
.smsp-or-divider {
  display: flex; align-items: center; gap: 12px; margin: 16px 0;
}
.smsp-or-divider__line { flex: 1; height: 1px; background: #e5e7eb; }
.smsp-or-pill {
  font-size: 11px; font-weight: 600; color: #9ca3af;
  white-space: nowrap; padding: 4px 12px;
  border-radius: 100px; border: 1px solid #e5e7eb;
  text-transform: uppercase; letter-spacing: .4px;
}

/* ── Expand card ── */
.smsp-expand-card {
  border: 1.5px solid #fecaca; border-radius: 14px; overflow: hidden; background: #fff;
}
.smsp--dark .smsp-expand-card { background: #1f2937; border-color: #374151; }

.smsp-expand-trigger {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; background: #fef9f9; border: none; cursor: pointer;
  text-align: left; transition: background .15s;
}
.smsp-expand-trigger:hover { background: #fef2f2; }
.smsp--dark .smsp-expand-trigger { background: rgba(255, 49, 49,.06); }
.smsp--dark .smsp-expand-trigger:hover { background: rgba(255, 49, 49,.1); }

.smsp-expand-trigger__left { display: flex; align-items: center; gap: 12px; }
.smsp-expand-trigger__title { font-size: 14px; font-weight: 700; color: #111827; }
.smsp--dark .smsp-expand-trigger__title { color: #f3f4f6; }
.smsp-expand-trigger__sub { font-size: 12px; color: #6b7280; margin-top: 1px; }

.smsp-expand-chevron { color: #9ca3af; flex-shrink: 0; transition: transform .22s ease; }
.smsp-expand-trigger--open .smsp-expand-chevron { transform: rotate(180deg); }

.smsp-expand-body { padding: 16px 20px 20px; border-top: 1px solid #f0f0f0; }
.smsp--dark .smsp-expand-body { border-top-color: #374151; }

/* Expand transition */
.smsp-expand-enter-active { transition: all .24s ease; overflow: hidden; }
.smsp-expand-leave-active  { transition: all .18s ease; overflow: hidden; }
.smsp-expand-enter-from, .smsp-expand-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.smsp-expand-enter-to, .smsp-expand-leave-from { opacity: 1; max-height: 3000px; }

/* ── Icon badge ── */
.smsp-icon-badge {
  width: 34px; height: 34px; border-radius: 10px;
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

/* ── Field wrap (labeled native selects) ── */
.smsp-field-wrap { display: flex; flex-direction: column; gap: 5px; }
.smsp-field-label { font-size: 12px; font-weight: 600; color: #6b7280; }

/* ── Form divider ── */
.smsp-form-divider { height: 1px; background: #f0f0f0; margin: 16px 0; }
.smsp--dark .smsp-form-divider { background: #374151; }

/* ── Bootstrap floating inputs ── */
.smsp-input.form-control {
  border-radius: 10px; border: 1.5px solid #e5e7eb; font-size: 13.5px;
  color: #374151; padding: 0.65rem 0.8rem; background: #f9fafb;
  transition: border-color .2s, box-shadow .2s;
}
.smsp-input.form-control:focus {
  border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
  background: #fff; outline: none;
}
.smsp-input.form-control.is-invalid { border-color: #ff3131; }
.form-floating > label { font-size: 13.5px; color: #9ca3af; padding: 0.65rem 0.8rem; }
.form-floating > .smsp-input:focus ~ label,
.form-floating > .smsp-input:not(:placeholder-shown) ~ label {
  color: #ff3131; font-weight: 600; font-size: 10.5px; opacity: 1;
  transform: scale(1) translateY(-0.6rem) translateX(0.1rem);
}
.smsp-invalid { font-size: 11.5px; color: #ff3131; margin-top: 4px; }

/* ── Info bars ── */
.smsp-infobar {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px; border-radius: 12px; font-size: 13px;
}
.smsp-infobar--error { background: #fef2f2; border: 1px solid #fecaca; color: #ff3131; }

/* ── Buttons ── */
.smsp-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 20px; border-radius: 100px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: none; transition: all .2s; line-height: 1.4;
}
.smsp-btn:disabled { opacity: .45; cursor: not-allowed; }
.smsp-btn--primary {
  background: #ff3131; color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.smsp-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.smsp-btn--ghost { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.smsp-btn--ghost:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }
.smsp-btn--full { width: 100%; }

/* ── Footer actions ── */
.smsp-footer-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
/* BUG-273 : conteneur du Teleport footer — colonne pour empiler l'erreur au-dessus du bouton,
   dans la zone fixe du wizard (jamais dans le corps scrollable). */
.smsp-footer-teleport { display: flex; flex-direction: column; align-items: stretch; gap: 8px; flex: 1 1 auto; min-width: 0; }
.smsp-footer-error { margin: 0; }

/* ── Dialog header ── */
.smsp-dialog-header {
  display: flex; align-items: center; gap: 14px; padding: 20px 24px;
  background: #ff3131;
}
.smsp-dialog-header__icon {
  width: 42px; height: 42px; border-radius: 11px; background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.smsp-dialog-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.smsp-dialog-header__sub   { font-size: 12px; color: rgba(255,255,255,.78); margin-top: 2px; }
.smsp-dialog-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid #f0f0f0;
}

/* ── Dark mode tweaks ── */
.smsp--dark .smsp-input.form-control { background: #111827; border-color: #374151; color: #e5e7eb; }
.smsp--dark .smsp-input.form-control:focus { background: #1f2937; }
.smsp--dark .form-floating > label { color: #6b7280; }
.smsp--dark :deep(.v-card) { background: #1a0505 !important; }
</style>
