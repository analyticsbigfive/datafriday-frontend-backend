<!-- src/views/OnboardingView.vue -->
<template>
  <div class="onboarding-page">
    <div class="onboarding-wrapper">

      <!-- Header -->
      <div class="onboarding-header">
        <div class="onboarding-brand">
          <img :src="require('@/assets/datafriday.png')" alt="DataFriday" style="width:32px;height:32px;object-fit:contain;" />
          <span class="brand-label">DataFriday</span>
        </div>

        <div class="onboarding-meta">
          <div class="onboarding-step-info">
            <span class="step-text">Étape {{ step }} sur {{ totalSteps }}</span>
            <span v-if="userEmail" class="step-email">{{ userEmail }}</span>
          </div>
          <div class="d-flex align-items-center gap-3">
            <v-btn
              variant="text"
              size="small"
              style="color: #64748b; text-transform: none; font-size: 13px;"
              :disabled="submitting || signingOut"
              @click="signOut"
            >
              Déconnexion
            </v-btn>
            <span class="progress-pct">{{ Math.round((step / totalSteps) * 100) }}%</span>
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <v-progress-linear
        :model-value="(step / totalSteps) * 100"
        height="4"
        rounded
        color="#ff3131"
        bg-color="rgba(51,65,85,0.6)"
        class="onboarding-progress"
      />

      <!-- Card -->
      <div class="onboarding-content">
        <div class="onboarding-card">

          <!-- Étape 1 — Organisation -->
          <template v-if="step === 1">
            <div class="step-icon-wrap">
              <Building2 :size="28" style="color:#ff3131;" />
            </div>
            <h2 class="step-title">Créer votre organisation</h2>
            <p class="step-subtitle">Donnez un nom à votre organisation pour commencer</p>

            <v-text-field
              v-model="form.organizationName"
              label="Nom de l'organisation"
              placeholder="Ma société"
              variant="outlined"
              color="#ff3131"
              bg-color="rgba(30,41,59,0.7)"
              base-color="#64748b"
              density="comfortable"
              class="auth-field mt-6"
              hide-details
            />
          </template>

          <!-- Étape 2 — Espace -->
          <template v-else-if="step === 2">
            <div class="step-icon-wrap">
              <MapPin :size="28" style="color:#ff3131;" />
            </div>
            <h2 class="step-title">Créer votre premier espace</h2>
            <p class="step-subtitle">Un espace représente un lieu (festival, salle, bar…)</p>

            <v-text-field
              v-model="form.spaceName"
              label="Nom de l'espace"
              placeholder="Festival d'été 2024"
              variant="outlined"
              color="#ff3131"
              bg-color="rgba(30,41,59,0.7)"
              base-color="#64748b"
              density="comfortable"
              class="auth-field mt-6 mb-3"
              hide-details
            />

            <v-select
              v-model="form.spaceType"
              :items="spaceTypeItems"
              item-title="title"
              item-value="value"
              label="Type d'espace"
              placeholder="Choisir un type"
              variant="outlined"
              color="#ff3131"
              bg-color="rgba(30,41,59,0.7)"
              base-color="#64748b"
              density="comfortable"
              class="auth-field"
              hide-details
            />
          </template>

          <!-- Étape 3 — Succès -->
          <template v-else>
            <div class="step-icon-wrap step-icon--success">
              <Check :size="32" style="color: #4ade80;" />
            </div>
            <h2 class="step-title">Tout est prêt !</h2>
            <p class="step-subtitle">
              Votre espace est configuré. Commencez à explorer DataFriday.
            </p>
          </template>

          <!-- Navigation -->
          <div class="step-actions">
            <v-btn
              variant="outlined"
              rounded="lg"
              size="large"
              class="action-btn-back"
              :disabled="step === 1"
              @click="prevStep"
            >
              Retour
            </v-btn>
            <v-btn
              color="#ff3131"
              rounded="lg"
              size="large"
              class="action-btn-next"
              :loading="submitting"
              elevation="0"
              @click="nextStep"
            >
              {{ step === totalSteps ? 'Commencer' : 'Continuer' }}
              <ArrowRight v-if="step < totalSteps" :size="18" class="ml-2" />
            </v-btn>
          </div>
        </div>

        <!-- Steps indicator -->
        <div class="steps-indicator">
          <div
            v-for="i in totalSteps"
            :key="i"
            class="step-dot"
            :class="{ 'step-dot--active': i === step, 'step-dot--done': i < step }"
          />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Building2, MapPin, ArrowRight } from 'lucide-vue-next'
import { useStore } from 'vuex'
import { supabase } from '@/lib/supabase'
import { createSpace } from '@/api/endpoints/space.api'

const router = useRouter()
const store = useStore()
const step = ref(1)
const totalSteps = 3
const submitting = ref(false)
const signingOut = ref(false)
const userEmail = ref('')

const form = reactive({
  organizationName: '',
  spaceName: '',
  spaceType: ''
})

const spaceTypeItems = [
  { title: 'Festival', value: 'festival' },
  { title: 'Salle de concert', value: 'venue' },
  { title: 'Bar / Restaurant', value: 'bar' },
  { title: 'Autre', value: 'other' },
]

onMounted(async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    userEmail.value = user?.email || ''
  } catch {
    userEmail.value = ''
  }
})

const nextStep = async () => {
  if (submitting.value) return
  if (step.value < totalSteps) { step.value++; return }

  submitting.value = true
  try {
    if (!form.organizationName) return
    if (!userEmail.value) throw new Error('Missing authenticated user email')

    const payload = {
      firstName: 'Owner',
      lastName: 'Owner',
      organizationName: form.organizationName,
      organizationType: 'Autre',
      organizationEmail: userEmail.value,
      organizationPhone: '+0000000000',
    }

    await store.dispatch('auth/createOrganization', payload)

    if (form.spaceName) {
      let spaceType, spaceTypeOther
      if (form.spaceType === 'festival') spaceType = 'Outdoor Festival'
      else if (form.spaceType === 'venue') spaceType = 'Indoor Show Venue'
      else if (form.spaceType === 'bar') { spaceType = 'Other'; spaceTypeOther = 'Bar / Restaurant' }
      else { spaceType = 'Other'; spaceTypeOther = 'Other' }
      await createSpace({ name: form.spaceName, spaceType, spaceTypeOther })
    }
    router.push('/spaces')
  } catch (e) {
    console.error(e)
  } finally {
    submitting.value = false
  }
}

const prevStep = () => { if (step.value > 1) step.value-- }

const signOut = async () => {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await store.dispatch('auth/signOut')
    router.push('/login')
  } finally {
    signingOut.value = false
  }
}
</script>

<style scoped>
.onboarding-page {
  min-height: 100vh;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px 48px;
  background-image: radial-gradient(ellipse at 20% 50%, rgba(255, 49, 49, 0.05) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 20%, rgba(255, 49, 49, 0.04) 0%, transparent 40%);
}

.onboarding-wrapper {
  width: 100%;
  max-width: 560px;
  padding-top: 48px;
}

/* Header */
.onboarding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.onboarding-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-label {
  color: white;
  font-size: 16px;
  font-weight: 700;
}

.onboarding-meta {
  display: flex;
  align-items: center;
  gap: 20px;
}

.onboarding-step-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.step-text {
  color: #94a3b8;
  font-size: 13px;
}

.step-email {
  color: #475569;
  font-size: 11px;
}

.progress-pct {
  color: #ff3131;
  font-size: 14px;
  font-weight: 700;
  min-width: 40px;
  text-align: right;
}

.onboarding-progress {
  margin-bottom: 40px;
}

/* Card */
.onboarding-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.onboarding-card {
  width: 100%;
  background: rgba(30, 41, 59, 0.4);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: 24px;
  padding: 44px 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* Step icon */
.step-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(255, 49, 49, 0.1);
  border: 1px solid rgba(255, 49, 49, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.step-icon--success {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.2);
}

/* Step text */
.step-title {
  color: white;
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.step-subtitle {
  color: #94a3b8;
  font-size: 15px;
  margin: 0;
  line-height: 1.6;
}

/* Form fields */
:deep(.auth-field .v-field__input) {
  color: white !important;
  -webkit-text-fill-color: white !important;
}
:deep(.auth-field .v-field__input::placeholder) {
  color: #475569 !important;
  -webkit-text-fill-color: #475569 !important;
}
:deep(.auth-field .v-label) {
  color: #64748b !important;
}
:deep(.auth-field .v-field--focused .v-label) {
  color: #ff3131 !important;
}
:deep(.auth-field .v-field__outline__start),
:deep(.auth-field .v-field__outline__notch),
:deep(.auth-field .v-field__outline__end) {
  border-color: rgba(51, 65, 85, 0.8) !important;
}
:deep(.auth-field .v-field--focused .v-field__outline__start),
:deep(.auth-field .v-field--focused .v-field__outline__notch),
:deep(.auth-field .v-field--focused .v-field__outline__end) {
  border-color: #ff3131 !important;
}
:deep(.auth-field .v-select__selection-text),
:deep(.auth-field .v-select__selection) {
  color: white !important;
}

/* Navigation */
.step-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 40px;
}

.action-btn-back {
  border-color: rgba(51, 65, 85, 0.8) !important;
  color: #94a3b8 !important;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  min-width: 120px;
}

.action-btn-next {
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  min-width: 160px;
}

/* Steps dots */
.steps-indicator {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(51, 65, 85, 0.8);
  transition: all 0.3s;
}

.step-dot--active {
  background: #ff3131;
  width: 24px;
  border-radius: 4px;
}

.step-dot--done {
  background: rgba(255, 49, 49, 0.4);
}
</style>
