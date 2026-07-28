<template>
  <div class="rl-root" :class="{'rl--dark': isDark}">

    <!-- Zone fixe : header + toolbar -->
    <div class="rl-sticky-top">

      <!-- Header dégradé -->
      <div class="rl-header">
        <div class="rl-header__content">
          <div class="rl-header__left">
            <div class="rl-header__icon"><Crown :size="22" color="white" /></div>
            <div>
              <h1 class="rl-header__title">{{ t('roleList.title') }}</h1>
              <p class="rl-header__sub">{{ t('roleList.subtitle') }}</p>
            </div>
          </div>
          <button v-can="'org.roles.manage'" class="rl-btn rl-btn--add" @click="openCreateDrawer">
            <Plus :size="16" />
            {{ t('roleList.addRole') }}
          </button>
        </div>
      </div>

      <!-- Recherche (aligné sur MarketPriceListView) -->
      <div class="rl-searchbar">
        <div class="rl-searchbar__inner">
          <Search :size="17" class="rl-searchbar__icon" />
          <input
            v-model="searchQuery"
            class="rl-searchbar__input"
            type="search"
            :placeholder="t('roleList.searchPlaceholder')"
          />
          <span class="rl-searchbar__count">{{ filteredRoles.length }} {{ locale === 'fr' ? 'rôles' : 'roles' }}</span>
          <button v-if="searchQuery" class="rl-searchbar__clear" @click="searchQuery = ''">
            <X :size="15" />
          </button>
        </div>
      </div>
    </div><!-- /rl-sticky-top -->

    <!-- Contenu -->
    <div class="rl-content">

      <v-progress-linear
        v-if="loading"
        indeterminate
        color="#ff3131"
        height="3"
        rounded
        class="mb-6"
      />

      <!-- Erreur de chargement -->
      <div v-if="loadError" class="rl-alert-error mb-6">
        <AlertTriangle :size="15" />
        {{ loadError }}
      </div>

      <!-- État vide -->
      <div v-if="!loading && filteredRoles.length === 0" class="rl-empty">
        <div class="rl-empty__icon" :class="{'rl-empty__icon--dark': isDark}">
          <ShieldOff :size="40" />
        </div>
        <h3 class="rl-empty__title">
          {{ searchQuery ? t('roleList.noResults') : t('roleList.emptyTitle') }}
        </h3>
        <p class="rl-empty__sub">
          {{ searchQuery ? t('roleList.noResultsSubtitle') : t('roleList.emptySubtitle') }}
        </p>
        <button
          v-if="!searchQuery"
          v-can="'org.roles.manage'"
          class="rl-btn rl-btn--add mt-2"
          @click="openCreateDrawer"
        >
          <Plus :size="16" />
          {{ t('roleList.addRole') }}
        </button>
      </div>

      <!-- Grille de cartes -->
      <div v-else class="rl-grid">
        <div
          v-for="role in filteredRoles"
          :key="role.id"
          class="rl-card"
          :class="{'rl-card--dark': isDark}"
        >
          <!-- Top : icône + actions -->
          <div class="rl-card__top">
            <div class="rl-card__icon" :class="{'rl-card__icon--dark': isDark}">
              <Crown :size="18" />
            </div>
            <div class="rl-card__actions">
              <button
                class="rl-action-btn"
                :title="t('roleList.edit')"
                @click.stop="openEditDrawer(role)"
              >
                <Pencil :size="14" />
              </button>
              <button
                v-if="!role.isSystem"
                class="rl-action-btn rl-action-btn--delete"
                :title="t('roleList.delete')"
                @click.stop="openDeleteDialog(role)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>

          <!-- Nom + description -->
          <div class="rl-card__body">
            <div class="rl-card__name">
              {{ role.name }}
              <span v-if="role.isSystem" class="rl-badge">{{ t('roleList.systemBadge') }}</span>
            </div>
            <div v-if="role.description" class="rl-card__desc">{{ role.description }}</div>
          </div>

          <!-- Permissions -->
          <div class="rl-card__footer" :class="{'rl-card__footer--dark': isDark}">
            <div class="rl-perm-label">
              <ShieldCheck :size="12" />
              {{ rolePermissions(role).length }} {{ t('roleList.permissions') }}
            </div>
            <div v-if="rolePermissions(role).length > 0" class="rl-chips">
              <span
                v-for="perm in rolePermissions(role).slice(0, 3)"
                :key="perm.id || perm"
                class="rl-chip"
              >
                {{ perm.name || perm }}
              </span>
              <span v-if="rolePermissions(role).length > 3" class="rl-chip rl-chip--more">
                +{{ rolePermissions(role).length - 3 }}
              </span>
            </div>
            <div v-else class="rl-no-perm">{{ t('roleList.noPermissions') }}</div>
          </div>
        </div>
      </div>

    </div>

    <RoleFormDrawer
      v-model="formDrawer"
      :mode="formMode"
      :initial-data="selectedRole"
      :is-dark="isDark"
      @saved="onSaved"
    />

    <RoleDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :is-dark="isDark"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { Plus, Pencil, Trash2, Crown, ShieldCheck, ShieldOff, Search, X, AlertTriangle } from 'lucide-vue-next';
import { deleteRole } from '@/api/endpoints/role.api';
import RoleFormDrawer from '../drawers/RoleFormDrawer.vue';
import RoleDeleteDialog from '../dialogs/RoleDeleteDialog.vue';

export default {
  name: 'RoleListView',
  components: { Plus, Pencil, Trash2, Crown, ShieldCheck, ShieldOff, Search, X, AlertTriangle, RoleFormDrawer, RoleDeleteDialog },
  setup() {
    const theme = useTheme();
    const { t, locale } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, locale, isDark };
  },
  data() {
    return {
      loading: false,
      loadError: '',
      searchQuery: '',

      formDrawer: false,
      formMode: 'create',
      selectedRole: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: '',
      deleteTarget: null,
    };
  },
  computed: {
    roles() {
      return this.$store.getters['roles/roles'];
    },
    filteredRoles() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      if (!q) return this.roles;
      return this.roles.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q)
      );
    },
  },
  mounted() {
    this.loadRoles();
  },
  methods: {
    async loadRoles() {
      this.loading = true;
      this.loadError = '';
      try {
        await this.$store.dispatch('roles/fetchRoles');
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || 'Failed to load roles';
      } finally {
        this.loading = false;
      }
    },
    rolePermissions(role) {
      return Array.isArray(role.permissions) ? role.permissions : [];
    },
    openCreateDrawer() {
      this.formMode = 'create';
      this.selectedRole = null;
      this.formDrawer = true;
    },
    openEditDrawer(role) {
      this.formMode = 'edit';
      this.selectedRole = role;
      this.formDrawer = true;
    },
    openDeleteDialog(role) {
      this.deleteError = '';
      this.deleteLoading = false;
      this.deleteTarget = role;
      this.deleteDialog = true;
    },
    onSaved() {
      this.$store.dispatch('roles/fetchRoles', { forceRefresh: true });
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = 'Identifiant manquant'; return; }
        await deleteRole(id);
        await this.$store.dispatch('roles/removeRole', id);
        this.deleteDialog = false;
        this.deleteTarget = null;
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || 'Échec de la suppression';
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.rl-root {
  background: #f6f7fb;
  min-height: 100vh;
}

/* ── Conteneur fixe ── */
.rl-sticky-top {
  position: sticky;
  top: 0;
  z-index: 10;
}

/* ── Header ── */
.rl-header {
  background: #ff3131;
  padding: 28px 28px 24px;
}

.rl-header__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.rl-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.rl-header__icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rl-header__title {
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  color: #fff;
  margin: 0;
  line-height: 1.2;
}

.rl-header__sub {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.72);
  margin: 3px 0 0;
}

/* ── Bouton Add ── */
.rl-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 20px;
  height: 40px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.rl-btn--add {
  background: #fff;
  color: #ff3131;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.rl-btn--add:hover {
  background: #fff8f8;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
  transform: translateY(-1px);
}

/* ── Search bar (aligné sur MarketPriceListView) ── */
.rl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.rl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
  flex-wrap: wrap;
}
.rl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.rl-searchbar__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--fs-md);
  color: #111827;
  font-family: inherit;
}
.rl-searchbar__input::placeholder { color: #9ca3af; }
.rl-searchbar__count { font-size: var(--fs-sm); color: #9ca3af; white-space: nowrap; }
.rl-searchbar__clear {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.rl-searchbar__clear:hover { color: #ff3131; }

/* ── Contenu ── */
.rl-content {
  padding: 28px;
}

/* ── Erreur ── */
.rl-alert-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(255, 49, 49, 0.07);
  border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 10px;
  font-size: 0.875rem;
  color: #ff3131;
}

/* ── État vide ── */
.rl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
}

.rl-empty__icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: #f3f4f6;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

.rl-empty__icon--dark { background: #1f2937; color: #6b7280; }

.rl-empty__title {
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  color: #111827;
  margin-bottom: 8px;
}

.rl-empty__sub {
  font-size: 0.875rem;
  color: #6b7280;
  max-width: 360px;
  line-height: 1.5;
  margin: 0;
}

/* ── Grille ── */
.rl-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

@media (max-width: 1200px) {
  .rl-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 700px) {
  .rl-grid { grid-template-columns: 1fr; }
}

/* ── Carte ── */
.rl-card {
  background: #fff;
  border: 1.5px solid #e5e7eb;
  border-radius: 16px;
  padding: 18px 18px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s;
  overflow: hidden;
}

.rl-card:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
  border-color: #d1d5db;
}

.rl-card--dark {
  background: #1a2332;
  border-color: #374151;
}

/* Top */
.rl-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rl-card__icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(255, 49, 49, 0.1);
  color: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rl-card__icon--dark { background: rgba(255, 49, 49, 0.18); }

.rl-card__actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.rl-card:hover .rl-card__actions { opacity: 1; }

.rl-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: none;
  cursor: pointer;
  color: #9ca3af;
  transition: background 0.15s, color 0.15s;
}

.rl-action-btn:hover { background: #f3f4f6; color: #374151; }
.rl-action-btn--delete:hover { background: rgba(255, 49, 49, 0.08); color: #ff3131; }

/* Body */
.rl-card__body { flex: 1; }

.rl-card__name {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rl-card--dark .rl-card__name { color: #f9fafb; }

.rl-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: #f3f4f6;
  border-radius: 50px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rl-card--dark .rl-badge { background: #374151; color: #9ca3af; }

.rl-card__desc {
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Footer */
.rl-card__footer {
  border-top: 1px solid #f3f4f6;
  padding: 12px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rl-card__footer--dark { border-top-color: #374151; }

.rl-perm-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
}

.rl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.rl-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(255, 49, 49, 0.07);
  border: 1px solid rgba(255, 49, 49, 0.15);
  border-radius: 50px;
  font-size: 0.7rem;
  font-weight: 500;
  color: #ff3131;
  font-family: 'Courier New', monospace;
}

.rl-chip--more {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #6b7280;
}

.rl-no-perm {
  font-size: 0.75rem;
  color: #9ca3af;
  font-style: italic;
}

/* ── Dark mode ── */
.rl--dark.rl-root { background: #111827; }
.rl--dark .rl-searchbar { background: #1a2332; border-bottom-color: #374151; }
.rl--dark .rl-searchbar__input { color: #f3f4f6; }
.rl--dark .rl-empty__title { color: #f9fafb; }
.rl--dark .rl-empty__sub { color: #9ca3af; }
.rl--dark .rl-card__desc { color: #9ca3af; }
/* Hover d'action : le gris clair #f3f4f6 tranchait en blanc sur la carte sombre. */
.rl--dark .rl-action-btn:hover { background: #374151; color: #e5e7eb; }
/* Chip « +N » : pastille grise claire → grise sombre. */
.rl--dark .rl-chip--more { background: #374151; border-color: #4b5563; color: #9ca3af; }
</style>
