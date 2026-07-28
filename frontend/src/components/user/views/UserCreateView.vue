<template>
  <div id="user-create-page" :class="{ 'ucp--dark': isDark }">

    <!-- Header dégradé -->
    <div class="ucp-header">
      <div class="ucp-header__icon"><UserPlus :size="22" color="white" /></div>
      <div class="ucp-header__body">
        <h1 class="ucp-header__title">{{ t('userCreate.title') }}</h1>
        <p class="ucp-header__sub">{{ t('userCreate.subtitle') }}</p>
      </div>
      <div class="ucp-header__actions">
        <button class="ucp-btn ucp-btn--ghost-white" @click="onCancel">
          <X :size="16" /> {{ t('userCreate.cancel') }}
        </button>
        <button
          class="ucp-btn ucp-btn--white"
          :disabled="saving || stagingList.length === 0"
          @click="onSaveAll"
        >
          <v-progress-circular v-if="saving" indeterminate size="14" width="2" color="#ff3131" />
          <Save v-else :size="16" />
          {{ t('userCreate.saveAll') }} ({{ stagingList.length }})
        </button>
      </div>
    </div>

    <!-- Corps principal -->
    <div class="ucp-body">

      <!-- Gauche : liste staging -->
      <div class="ucp-left">
        <div class="ucp-left__header">
          <h2 class="ucp-section-title">{{ t('userCreate.stagingTitle') }}</h2>
          <span class="ucp-count-badge">
            {{ stagingList.length }} {{ stagingList.length === 1 ? t('userCreate.user') : t('userCreate.users') }}
          </span>
        </div>

        <div v-if="saveError" class="ucp-error">
          <AlertTriangle :size="14" />
          {{ saveError }}
        </div>

        <div class="ucp-table-wrap">
          <v-data-table
            :headers="stagingHeaders"
            :items="stagingList"
            item-value="uid"
            density="comfortable"
            hide-default-footer
            :items-per-page="-1"
            class="ucp-table"
          >
            <template #no-data>
              <div class="ucp-empty">
                <div class="ucp-empty__icon"><UserPlus :size="28" /></div>
                <div class="ucp-empty__title">{{ t('userCreate.stagingEmptyTitle') }}</div>
                <div class="ucp-empty__sub">{{ t('userCreate.stagingEmptySubtitle') }}</div>
              </div>
            </template>

            <template #item.name="{ item }">
              <div class="ucp-user-cell">
                <div class="ucp-user-avatar">{{ getInitials(item) }}</div>
                <span class="ucp-user-name">{{ getFullName(item) }}</span>
              </div>
            </template>

            <template #item.role="{ item }">
              <span v-if="item.roleName" class="ucp-badge ucp-badge--role">{{ item.roleName }}</span>
              <span v-else class="ucp-empty-cell">—</span>
            </template>

            <template #item.spaces="{ item }">
              <span class="ucp-badge" :class="item.spaceMode === 'some' ? 'ucp-badge--blue' : 'ucp-badge--green'">
                {{ spaceLabel(item) }}
              </span>
            </template>

            <template #item.status="{ item }">
              <span
                class="ucp-badge"
                :class="item.saved ? 'ucp-badge--green' : item.error ? 'ucp-badge--red' : 'ucp-badge--gray'"
              >
                {{ item.saved ? t('userCreate.statusSaved') : item.error ? t('userCreate.statusError') : t('userCreate.statusPending') }}
              </span>
            </template>

            <template #item.actions="{ item }">
              <div class="ucp-row-actions">
                <button class="ucp-icon-btn" @click="editFromStaging(item)"><Pencil :size="13" /></button>
                <button class="ucp-icon-btn ucp-icon-btn--danger" @click="removeFromStaging(item.uid)"><Trash2 :size="13" /></button>
              </div>
            </template>
          </v-data-table>
        </div>
      </div>

      <!-- Droite : formulaire -->
      <div class="ucp-right">
        <div class="ucp-right__header">
          <h2 class="ucp-section-title">
            {{ editingUid ? t('userCreate.formEditTitle') : t('userCreate.formTitle') }}
          </h2>
          <p class="ucp-right__sub">{{ t('userCreate.formSubtitle') }}</p>
        </div>

        <div class="ucp-right__scroll">
          <!-- Stepper -->
          <div class="ucp-stepper">
            <div class="ucp-step" :class="{ active: currentStep === 1, done: currentStep > 1 }">
              <div class="ucp-step-dot"><Check v-if="currentStep > 1" :size="13" /><span v-else>1</span></div>
              <span class="ucp-step-label">Informations</span>
            </div>
            <div class="ucp-step-line" :class="{ done: currentStep > 1 }" />
            <div class="ucp-step" :class="{ active: currentStep === 2 }">
              <div class="ucp-step-dot"><span>2</span></div>
              <span class="ucp-step-label">Rôle &amp; accès</span>
            </div>
          </div>

          <div v-if="formError" class="ucp-error">
            <AlertTriangle :size="14" />
            {{ formError }}
          </div>

          <!-- ÉTAPE 1 -->
          <div v-show="currentStep === 1">
            <div class="ucp-section"><span>{{ t('userCreate.sectionIdentity') }}</span></div>
            <div class="ucp-row">
              <div class="ucp-field">
                <label class="ucp-label">{{ t('userCreate.labelFirstName') }}</label>
                <input v-model="form.firstName" class="ucp-input" :placeholder="t('userCreate.firstNamePlaceholder')" />
              </div>
              <div class="ucp-field">
                <label class="ucp-label">{{ t('userCreate.labelLastName') }}</label>
                <input v-model="form.lastName" class="ucp-input" :placeholder="t('userCreate.lastNamePlaceholder')" />
              </div>
            </div>
            <div class="ucp-section"><span>{{ t('userCreate.sectionContact') }}</span></div>
            <div class="ucp-field">
              <label class="ucp-label">{{ t('userCreate.labelEmail') }} <span class="ucp-required">*</span></label>
              <input v-model="form.email" class="ucp-input" :placeholder="t('userCreate.emailPlaceholder')" type="email" />
            </div>
            <div class="ucp-field" style="margin-top: 12px;">
              <label class="ucp-label">{{ t('userCreate.labelPhone') }}</label>
              <input v-model="form.phone" class="ucp-input" :placeholder="t('userCreate.phonePlaceholder')" />
            </div>
          </div>

          <!-- ÉTAPE 2 -->
          <div v-show="currentStep === 2">
            <div class="ucp-section"><span>{{ t('userCreate.labelRole') }}</span></div>
            <div class="ucp-field">
              <label class="ucp-label">{{ t('userCreate.labelRole') }}</label>
              <div class="ucp-select-wrap">
                <select v-model="form.roleId" class="ucp-select" :disabled="rolesLoading">
                  <option value="">{{ rolesLoading ? 'Chargement…' : t('userCreate.rolePlaceholder') }}</option>
                  <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select>
                <ChevronDown class="ucp-select-chevron" :size="14" />
              </div>
              <p v-if="rolesError" class="ucp-hint ucp-hint--err">
                Impossible de charger les rôles.
                <button class="ucp-link" @click="loadRoles(true)">Réessayer</button>
              </p>
            </div>

            <div class="ucp-section" style="margin-top: 20px;"><span>Espaces accessibles</span></div>
            <div class="ucp-space-modes">
              <button
                v-for="opt in spaceModeOptions"
                :key="opt.value"
                type="button"
                class="ucp-space-mode"
                :class="{ selected: form.spaceMode === opt.value }"
                @click="form.spaceMode = opt.value"
              >
                <Globe v-if="opt.value === 'all'" :size="17" />
                <ListChecks v-else :size="17" />
                <span>{{ opt.title }}</span>
              </button>
            </div>

            <div v-if="form.spaceMode === 'some'" class="ucp-field" style="margin-top: 12px;">
              <label class="ucp-label">Sélection des espaces</label>
              <div class="ucp-space-list">
                <label v-for="space in spacesList" :key="space.id" class="ucp-space-check">
                  <input type="checkbox" :value="space.id" v-model="form.spaceIds" />
                  <span>{{ space.name }}</span>
                </label>
                <p v-if="!spacesList.length" class="ucp-hint" style="padding: 8px 12px;">Aucun espace disponible</p>
              </div>
            </div>

            <p class="ucp-hint" style="margin-top: 12px;">
              « Tous » inclut les espaces présents et futurs. Le propriétaire voit toujours tout. L'accès est indépendant du rôle.
            </p>
          </div>
        </div>

        <!-- Footer form -->
        <div class="ucp-right__footer">
          <button v-if="currentStep === 2" class="ucp-btn ucp-btn--ghost" @click="prevStep">
            <ChevronLeft :size="16" /> Précédent
          </button>
          <button v-else-if="editingUid" class="ucp-btn ucp-btn--ghost" @click="cancelEdit">
            {{ t('userCreate.cancelEdit') }}
          </button>
          <div v-else />

          <button v-if="currentStep === 1" class="ucp-btn ucp-btn--primary" @click="nextStep">
            Suivant <ChevronRight :size="16" />
          </button>
          <button v-else class="ucp-btn ucp-btn--primary" @click="onAddToList">
            <Check v-if="editingUid" :size="16" />
            <Plus v-else :size="16" />
            {{ editingUid ? t('userCreate.updateInList') : t('userCreate.addToList') }}
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Plus, Pencil, Trash2, UserPlus, Check, ChevronLeft, ChevronRight, ChevronDown, Globe, ListChecks, AlertTriangle } from 'lucide-vue-next';
import { inviteUser } from '@/api/endpoints/user.api';
import { getSpacesLight } from '@/api/endpoints/space.api';

export default {
  name: 'UserCreateView',
  components: { X, Save, Plus, Pencil, Trash2, UserPlus, Check, ChevronLeft, ChevronRight, ChevronDown, Globe, ListChecks, AlertTriangle },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      saving: false,
      saveError: '',
      formError: '',
      editingUid: null,
      currentStep: 1,
      rolesLoading: false,
      rolesError: false,
      form: { firstName: '', lastName: '', email: '', phone: '', roleId: '', spaceMode: 'all', spaceIds: [] },
      stagingList: [],
      spacesList: [],
    };
  },
  computed: {
    roles() {
      return this.$store.getters['roles/roles'] || [];
    },
    spaceModeOptions() {
      return [
        { title: 'Tous les espaces', value: 'all' },
        { title: 'Espaces spécifiques', value: 'some' },
      ];
    },
    stagingHeaders() {
      return [
        { title: this.t('userCreate.colName'), key: 'name', sortable: false },
        { title: this.t('userCreate.colEmail'), key: 'email', sortable: false },
        { title: this.t('userCreate.colPhone'), key: 'phone', sortable: false },
        { title: this.t('userCreate.colRole'), key: 'role', sortable: false },
        { title: 'Espaces', key: 'spaces', sortable: false, width: 120 },
        { title: this.t('userCreate.colStatus'), key: 'status', sortable: false, width: 100 },
        { title: '', key: 'actions', sortable: false, align: 'end', width: 80 },
      ];
    },
  },
  watch: {
    roles(list) {
      if (Array.isArray(list) && list.length) this.rolesError = false;
    },
  },
  async mounted() {
    await this.loadRoles();
    try {
      this.spacesList = (await getSpacesLight()) || [];
    } catch {
      this.spacesList = [];
    }
    const importData = this.$route.query.import;
    if (importData) {
      try {
        const users = JSON.parse(importData);
        users.forEach((u) => this.addEntryToList(u));
      } catch {}
    }
  },
  methods: {
    async loadRoles(force = false) {
      this.rolesLoading = true;
      try {
        await this.$store.dispatch('roles/fetchRoles', force ? { forceRefresh: true } : undefined);
      } finally {
        this.rolesLoading = false;
        this.rolesError = this.roles.length === 0;
      }
    },
    getFullName(user) {
      return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '—';
    },
    getInitials(user) {
      const f = (user.firstName || '')[0] || '';
      const l = (user.lastName || '')[0] || '';
      return (f + l).toUpperCase() || (user.email || '?')[0].toUpperCase();
    },
    resetForm() {
      this.form = { firstName: '', lastName: '', email: '', phone: '', roleId: '', spaceMode: 'all', spaceIds: [] };
      this.formError = '';
      this.editingUid = null;
      this.currentStep = 1;
    },
    nextStep() {
      this.formError = '';
      if (!this.form.email?.trim()) {
        this.formError = "L'email est requis";
        return;
      }
      this.currentStep = 2;
    },
    prevStep() {
      this.currentStep = 1;
    },
    spaceLabel(entry) {
      if (entry.spaceMode !== 'some') return 'Tous';
      const n = (entry.spaceIds || []).length;
      return n === 0 ? 'Aucun' : `${n} espace${n > 1 ? 's' : ''}`;
    },
    onAddToList() {
      this.formError = '';
      if (!this.form.email?.trim()) {
        this.formError = "L'email est requis";
        return;
      }
      const duplicate = this.stagingList.find(
        (u) => u.email === this.form.email.trim() && u.uid !== this.editingUid,
      );
      if (duplicate) {
        this.formError = 'Cet email est déjà dans la liste';
        return;
      }
      if (this.editingUid) {
        const role = this.roles.find((r) => r.id === this.form.roleId) || null;
        this.stagingList = this.stagingList.map((u) =>
          u.uid === this.editingUid
            ? { ...u, ...this.form, spaceIds: [...(this.form.spaceIds || [])], roleName: role?.name || '', saved: false, error: '' }
            : u,
        );
        this.editingUid = null;
      } else {
        this.addEntryToList(this.form);
      }
      this.resetForm();
    },
    addEntryToList(data) {
      let roleId = data.roleId || '';
      let role = roleId ? this.roles.find((r) => r.id === roleId) || null : null;
      if (!role && data.roleName) {
        role = this.roles.find(
          (r) => String(r.name).toLowerCase() === String(data.roleName).toLowerCase(),
        ) || null;
        if (role) roleId = role.id;
      }
      this.stagingList = [
        ...this.stagingList,
        {
          uid: `uid-${Date.now()}-${Math.random()}`,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          roleId,
          roleName: role?.name || data.roleName || '',
          spaceMode: data.spaceMode || 'all',
          spaceIds: [...(data.spaceIds || [])],
          saved: false,
          error: '',
        },
      ];
    },
    editFromStaging(item) {
      this.editingUid = item.uid;
      this.form = {
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        phone: item.phone,
        roleId: item.roleId,
        spaceMode: item.spaceMode || 'all',
        spaceIds: [...(item.spaceIds || [])],
      };
      this.formError = '';
      this.currentStep = 1;
    },
    cancelEdit() {
      this.editingUid = null;
      this.resetForm();
    },
    removeFromStaging(uid) {
      this.stagingList = this.stagingList.filter((u) => u.uid !== uid);
      if (this.editingUid === uid) this.resetForm();
    },
    onCancel() {
      this.$router.push({ path: '/users' });
    },
    async onSaveAll() {
      if (this.stagingList.length === 0) return;
      this.saving = true;
      this.saveError = '';
      let anyError = false;
      for (const u of this.stagingList) {
        if (u.saved) continue;
        const useSome = u.spaceMode === 'some';
        if (useSome && !(u.spaceIds || []).length) {
          u.error = 'Sélectionnez au moins un espace (ou choisissez « Tous »).';
          anyError = true;
          continue;
        }
        const payload = {
          email: (u.email || '').trim(),
          firstName: u.firstName || undefined,
          lastName: u.lastName || undefined,
          phone: u.phone || undefined,
          roleId: u.roleId || undefined,
          allSpaces: useSome ? undefined : true,
          spaceIds: useSome ? u.spaceIds : undefined,
        };
        try {
          await inviteUser(payload);
          u.saved = true;
          u.error = '';
        } catch (e) {
          u.error = e?.response?.data?.message || e?.message || 'Échec';
          anyError = true;
        }
      }
      this.saving = false;
      try {
        await this.$store.dispatch('users/fetchUsers', { forceRefresh: true });
      } catch {}
      if (anyError) {
        this.saveError = 'Certaines invitations ont échoué — voir la colonne « Statut ».';
      } else {
        this.$router.push({ path: '/users' });
      }
    },
  },
};
</script>

<style scoped>
#user-create-page {
  background: #f9fafb;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header dégradé ── */
.ucp-header {
  display: flex; align-items: center; gap: 16px;
  padding: 20px 24px; flex-shrink: 0;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
}
.ucp-header__icon {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ucp-header__body { flex: 1; min-width: 0; }
.ucp-header__title { font-size: var(--fs-lg); font-weight: 700; color: #fff; margin: 0 0 3px; }
.ucp-header__sub { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.72); margin: 0; }
.ucp-header__actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* ── Corps ── */
.ucp-body {
  flex: 1; min-height: 0; display: flex; overflow: hidden;
}

/* ── Gauche staging ── */
.ucp-left {
  flex: 3; min-width: 0; overflow-y: auto;
  background: #f9fafb; border-right: 1px solid #e5e7eb;
  padding: 20px 24px;
}
.ucp-left__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }

/* ── Droite formulaire ── */
.ucp-right {
  flex: 0 0 360px; min-width: 0; background: #fff;
  display: flex; flex-direction: column; overflow: hidden;
}
.ucp-right__header {
  flex-shrink: 0; padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
}
.ucp-right__sub { font-size: 0.8125rem; color: #6b7280; margin: 4px 0 0; }
.ucp-right__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 24px; }
.ucp-right__footer {
  flex-shrink: 0; padding: 14px 20px;
  border-top: 1px solid #e5e7eb; background: #f9fafb;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}

/* ── Section title ── */
.ucp-section-title { font-size: 1rem; font-weight: 700; color: #111827; margin: 0; }

/* ── Badges ── */
.ucp-count-badge {
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  color: #fff; border-radius: 20px; padding: 2px 12px;
  font-size: 0.75rem; font-weight: 700;
}

/* ── Buttons ── */
.ucp-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; height: 38px; border-radius: 50px;
  font-size: var(--fs-base); font-weight: 600; cursor: pointer; border: none; transition: all 0.2s;
}
.ucp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ucp-btn--ghost-white { background: rgba(255,255,255,0.15); color: #fff; border: 1.5px solid rgba(255,255,255,0.3); }
.ucp-btn--ghost-white:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
.ucp-btn--white { background: #fff; color: #ff3131; font-weight: 700; }
.ucp-btn--white:hover:not(:disabled) { background: #fef2f2; }
.ucp-btn--ghost { background: #f3f4f6; color: #374151; }
.ucp-btn--ghost:hover:not(:disabled) { background: #e5e7eb; }
.ucp-btn--primary { background: #ff3131; color: #fff; }
.ucp-btn--primary:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(255, 49, 49,0.3); }

/* ── Error ── */
.ucp-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; margin-bottom: 14px;
  background: rgba(255, 49, 49, 0.08); border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 10px; font-size: 0.8125rem; color: #ff3131;
}

/* ── Table staging ── */
.ucp-table-wrap {
  background: #fff; border-radius: 14px;
  border: 1px solid #e5e7eb; overflow: hidden;
}
.ucp-table :deep(thead tr th) {
  background: #f9fafb !important;
  font-size: 0.72rem !important; font-weight: 700 !important;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: #6b7280 !important; border-bottom: 1px solid #e5e7eb !important;
}
.ucp-table :deep(tbody td) {
  padding-top: 11px !important; padding-bottom: 11px !important;
  font-size: 0.875rem; color: #374151;
}

.ucp-user-cell { display: flex; align-items: center; gap: 9px; }
.ucp-user-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: var(--fw-bold); color: #fff; flex-shrink: 0;
}
.ucp-user-name { font-weight: 600; color: #111827; font-size: 0.875rem; }

.ucp-badge {
  display: inline-flex; padding: 2px 9px; border-radius: 20px;
  font-size: 0.7rem; font-weight: 700;
}
.ucp-badge--role { background: rgba(255, 49, 49,0.1); color: #b91c1c; }
.ucp-badge--blue { background: rgba(9,132,227,0.1); color: #0984e3; }
.ucp-badge--green { background: rgba(0,184,148,0.1); color: #00b894; }
.ucp-badge--red { background: rgba(255,49,49,0.1); color: #ff3131; }
.ucp-badge--gray { background: #f3f4f6; color: #6b7280; }

.ucp-empty-cell { font-size: 0.875rem; color: #d1d5db; }

.ucp-row-actions { display: flex; justify-content: flex-end; gap: 4px; }
.ucp-icon-btn {
  width: 28px; height: 28px; border-radius: 7px;
  background: #f3f4f6; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #6b7280; transition: all 0.15s;
}
.ucp-icon-btn:hover { background: #e5e7eb; color: #374151; }
.ucp-icon-btn--danger:hover { background: rgba(255,49,49,0.1); color: #ff3131; }

/* ── Empty state ── */
.ucp-empty { padding: 40px 20px; text-align: center; }
.ucp-empty__icon {
  width: 56px; height: 56px; border-radius: 14px;
  background: #f3f4f6; color: #9ca3af;
  display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;
}
.ucp-empty__title { font-size: 0.9rem; font-weight: 700; color: #111827; margin-bottom: 4px; }
.ucp-empty__sub { font-size: 0.8125rem; color: #6b7280; }

/* ── Stepper ── */
.ucp-stepper { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.ucp-step { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.ucp-step-dot {
  width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: 700;
  border: 2px solid #e5e7eb; color: #9ca3af; background: #fff;
  transition: all 0.2s;
}
.ucp-step.active .ucp-step-dot { border-color: #ff3131; background: #ff3131; color: #fff; box-shadow: 0 4px 10px rgba(255, 49, 49,0.3); }
.ucp-step.done .ucp-step-dot { border-color: #ff3131; background: rgba(255, 49, 49,0.1); color: #ff3131; }
.ucp-step-label { font-size: 0.72rem; font-weight: 600; color: #9ca3af; white-space: nowrap; }
.ucp-step.active .ucp-step-label, .ucp-step.done .ucp-step-label { color: #374151; }
.ucp-step-line { flex: 1; height: 2px; background: #e5e7eb; border-radius: 2px; margin: 0 4px 20px; transition: background 0.2s; }
.ucp-step-line.done { background: #ff3131; }

/* ── Form fields ── */
.ucp-section {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  color: #6b7280; margin-bottom: 12px; margin-top: 4px;
}
.ucp-section::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
.ucp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.ucp-field { display: flex; flex-direction: column; gap: 5px; }
.ucp-label { font-size: 0.8125rem; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 4px; }
.ucp-required { color: #ff3131; }
.ucp-input {
  width: 100%; height: 38px;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 0 12px; font-size: 0.875rem; color: #111827;
  background: #fff; outline: none; transition: border-color 0.2s;
}
.ucp-input:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,0.1); }

/* ── Select ── */
.ucp-select-wrap { position: relative; }
.ucp-select {
  width: 100%; height: 38px; appearance: none;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 0 32px 0 12px; font-size: 0.875rem; color: #111827;
  background: #fff; outline: none; cursor: pointer; transition: border-color 0.2s;
}
.ucp-select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,0.1); }
.ucp-select:disabled { opacity: 0.6; }
.ucp-select-chevron { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }

/* ── Space modes ── */
.ucp-space-modes { display: flex; gap: 10px; }
.ucp-space-mode {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 11px 8px; border: 1.5px solid #e5e7eb; border-radius: 11px;
  background: #fff; color: #6b7280; font-size: 0.8rem; font-weight: 600;
  cursor: pointer; transition: all 0.18s;
}
.ucp-space-mode:hover { border-color: #d1d5db; }
.ucp-space-mode.selected { border-color: #ff3131; background: rgba(255, 49, 49,0.06); color: #ff3131; }

/* ── Space checklist ── */
.ucp-space-list {
  max-height: 160px; overflow-y: auto;
  border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 4px 0;
}
.ucp-space-check {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 12px; cursor: pointer; transition: background 0.15s;
  font-size: 0.875rem; color: #374151;
}
.ucp-space-check:hover { background: #f9fafb; }
.ucp-space-check input[type="checkbox"] { accent-color: #ff3131; width: 14px; height: 14px; }

.ucp-hint { font-size: 0.75rem; color: #9ca3af; margin: 0; }
.ucp-hint--err { color: #ff3131; }
.ucp-link { background: none; border: none; cursor: pointer; color: #ff3131; font-weight: 600; font-size: 0.75rem; text-decoration: underline; padding: 0; }

/* ── Dark mode ── (racine ID #user-create-page ; header rouge + accents #ff3131
   conservés). */
#user-create-page.ucp--dark { background: #111827; }
.ucp--dark .ucp-left { background: #111827; border-right-color: #374151; }
.ucp--dark .ucp-right { background: #1a2332; }
.ucp--dark .ucp-right__header { border-bottom-color: #374151; }
.ucp--dark .ucp-right__sub { color: #9ca3af; }
.ucp--dark .ucp-right__footer { background: #1a2332; border-top-color: #374151; }
.ucp--dark .ucp-section-title { color: #f9fafb; }

/* Wizard : étapes */
.ucp--dark .ucp-step-dot { background: #1f2937; border-color: #374151; color: #9ca3af; }
.ucp--dark .ucp-step-label { color: #9ca3af; }
.ucp--dark .ucp-step.active .ucp-step-label,
.ucp--dark .ucp-step.done .ucp-step-label { color: #e5e7eb; }
.ucp--dark .ucp-step-line { background: #374151; }

/* Formulaire */
.ucp--dark .ucp-section { color: #9ca3af; }
.ucp--dark .ucp-section::after { background: #374151; }
.ucp--dark .ucp-label { color: #d1d5db; }
.ucp--dark .ucp-input,
.ucp--dark .ucp-select { background: #1f2937; border-color: #374151; color: #f9fafb; }
.ucp--dark .ucp-input::placeholder { color: #9ca3af; }
.ucp--dark .ucp-select-chevron { color: #9ca3af; }
.ucp--dark .ucp-space-mode { background: #1f2937; border-color: #374151; color: #d1d5db; }
.ucp--dark .ucp-space-mode:hover { border-color: #4b5563; }
.ucp--dark .ucp-space-list { border-color: #374151; }
.ucp--dark .ucp-space-check { color: #d1d5db; }
.ucp--dark .ucp-space-check:hover { background: #1f2937; }
.ucp--dark .ucp-hint { color: #9ca3af; }

/* Table (colonne gauche) */
.ucp--dark .ucp-table-wrap { background: #1a2332; border-color: #374151; }
.ucp--dark .ucp-table :deep(thead tr th) { background: #1f2937 !important; color: #9ca3af !important; border-bottom-color: #374151 !important; }
.ucp--dark .ucp-table :deep(tbody td) { color: #e5e7eb; }
.ucp--dark .ucp-user-name { color: #f9fafb; }
.ucp--dark .ucp-icon-btn { background: #374151; color: #d1d5db; }
.ucp--dark .ucp-icon-btn:hover { background: #4b5563; color: #f9fafb; }
.ucp--dark .ucp-empty__icon { background: #1f2937; color: #6b7280; }
.ucp--dark .ucp-empty__title { color: #f9fafb; }
.ucp--dark .ucp-empty__sub { color: #9ca3af; }

/* Badges statut (soft bg + texte foncé → voile + clair) */
.ucp--dark .ucp-badge--blue { background: rgba(9, 132, 227, 0.2); color: #74b9ff; }
.ucp--dark .ucp-badge--green { background: rgba(0, 184, 148, 0.2); color: #55efc4; }
.ucp--dark .ucp-badge--gray { background: #374151; color: #9ca3af; }

/* Boutons */
.ucp--dark .ucp-btn--ghost { background: #374151; color: #f9fafb; }
.ucp--dark .ucp-btn--ghost:hover:not(:disabled) { background: #4b5563; }
</style>
