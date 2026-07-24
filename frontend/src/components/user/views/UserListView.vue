  <template>
  <div id="user-list-page" :class="{ 'ul--dark': isDark }">

    <!-- ── Gradient Header ── -->
    <div class="ul-header">
      <div class="ul-header__icon"><Users :size="20" color="white" /></div>
      <div class="ul-header__body">
        <h1 class="ul-header__title">{{ t('userList.title') }}</h1>
        <p class="ul-header__sub">{{ t('userList.subtitle') }}</p>
      </div>
      <div class="ul-header__actions">
        <button v-if="canManageUsers" class="ul-hbtn ul-hbtn--ghost" @click="onImport">
          <Upload :size="15" />
          {{ t('userList.import') }}
        </button>
        <button class="ul-hbtn ul-hbtn--ghost" @click="onExport">
          <Download :size="15" />
          {{ t('userList.export') }}
        </button>
        <button v-if="canManageUsers" class="ul-hbtn ul-hbtn--white" @click="onAddUser">
          <UserPlus :size="15" />
          {{ t('userList.addUser') }}
        </button>
      </div>
    </div>

    <!-- ── Search bar (aligné sur MarketPriceListView) ── -->
    <div class="ul-searchbar">
      <div class="ul-searchbar__inner">
        <Search :size="17" class="ul-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="ul-searchbar__input"
          type="search"
          :placeholder="t('userList.searchPlaceholder')"
        />
        <div class="ul-filter-pills">
          <div class="ul-select-wrap">
            <select v-model="roleFilter" class="ul-filter-select">
              <option :value="null">{{ t('userList.allRoles') }}</option>
              <option v-for="r in roleFilterOptions" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
            <ChevronDown :size="13" class="ul-select-chevron" />
          </div>
        </div>
        <span class="ul-searchbar__count">
          {{ filteredUsers.length }} {{ filteredUsers.length === 1 ? t('userList.userFound') : t('userList.usersFound') }}
        </span>
        <button v-if="searchQuery || roleFilter" class="ul-searchbar__clear" @click="resetFilters">
          <X :size="15" />
        </button>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="ul-content">
      <div v-if="loadError" class="ul-error">
        <AlertTriangle :size="14" />
        {{ loadError }}
      </div>

      <div class="ul-table-wrap">
        <v-data-table
          :headers="tableHeaders"
          :items="filteredUsers"
          item-value="id"
          density="comfortable"
          :loading="loading"
          class="ul-table"
        >
          <template #loading>
            <div class="ul-loading"><div class="ul-spinner" /></div>
          </template>

          <template #no-data>
            <div class="ul-empty">
              <div class="ul-empty__icon"><Users :size="32" /></div>
              <p class="ul-empty__title">{{ t('userList.emptyTitle') }}</p>
              <p class="ul-empty__sub">{{ t('userList.emptySubtitle') }}</p>
              <button v-if="canManageUsers" class="ul-btn ul-btn--primary mt-4" @click="onAddUser">
                <UserPlus :size="15" />
                {{ t('userList.addUser') }}
              </button>
            </div>
          </template>

          <template #item.name="{ item }">
            <div class="ul-user-cell">
              <div class="ul-user-avatar">{{ getInitials(item) }}</div>
              <div class="ul-user-info">
                <span class="ul-user-name">{{ getFullName(item) }}</span>
                <span v-if="item.email" class="ul-user-email">{{ item.email }}</span>
              </div>
            </div>
          </template>

          <template #item.email="{ item }">
            <span class="ul-text-muted">{{ item.email || '—' }}</span>
          </template>

          <template #item.role="{ item }">
            <span v-if="item.role?.name || item.roleName" class="ul-badge ul-badge--role">
              {{ item.role?.name || item.roleName }}
            </span>
            <span v-else class="ul-empty-cell">—</span>
          </template>

          <template #item.status="{ item }">
            <span
              v-if="(item.status || item.raw?.status) === 'active'"
              class="ul-badge ul-badge--active"
              :title="lastSeenLabel(item)"
            >{{ t('userList.statusActive') }}</span>
            <span v-else-if="(item.status || item.raw?.status) === 'pending'" class="ul-badge ul-badge--pending">
              {{ t('userList.statusPending') }}
            </span>
            <span v-else class="ul-empty-cell">—</span>
          </template>

          <template #item.createdAt="{ item }">
            <span class="ul-date">{{ formatDate(item.createdAt) }}</span>
          </template>

          <template #item.actions="{ item }">
            <div v-if="canManageUsers" class="ul-actions">
              <button
                v-if="(item.status || item.raw?.status) === 'pending'"
                class="ul-icon-btn"
                :title="t('userList.reinvite')"
                :disabled="reinvitingId === (item.id || item.raw?.id)"
                @click.stop="reinvite(item)"
              >
                <Send :size="14" />
              </button>
              <button class="ul-icon-btn" :title="t('userList.colActions')" @click.stop="openEditDrawer(item)">
                <Pencil :size="14" />
              </button>
              <button class="ul-icon-btn ul-icon-btn--danger" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="14" />
              </button>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="4000" location="top right">
      {{ snackbar.text }}
    </v-snackbar>

    <UserEditDrawer
      v-model="editDrawer"
      :initial-data="selectedUser"
      :is-dark="isDark"
      @saved="onSaved"
    />

    <UserDeleteDialog
      v-model="deleteDialog"
      :item-name="getFullName(deleteTarget)"
      :loading="deleteLoading"
      :error="deleteError"
      :is-dark="isDark"
      @confirm="confirmDelete"
    />

    <input ref="importInput" type="file" accept=".csv" style="display:none" @change="onImportFile" />
  </div>
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { Search, Download, Upload, UserPlus, Pencil, Trash2, Users, Send, X, ChevronDown, AlertTriangle } from 'lucide-vue-next';
import { deleteUser, reinviteUser } from '@/api/endpoints/user.api';
import UserEditDrawer from '../drawers/UserEditDrawer.vue';
import UserDeleteDialog from '../dialogs/UserDeleteDialog.vue';

export default {
  name: 'UserListView',
  components: { Search, Download, Upload, UserPlus, Pencil, Trash2, Users, Send, X, ChevronDown, AlertTriangle, UserEditDrawer, UserDeleteDialog },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      loading: false,
      rolesLoading: false,
      loadError: '',
      searchQuery: '',
      roleFilter: null,
      editDrawer: false,
      selectedUser: null,
      deleteDialog: false,
      deleteLoading: false,
      deleteError: '',
      deleteTarget: null,
      reinvitingId: null,
      snackbar: { show: false, text: '', color: 'success' },
    };
  },
  computed: {
    users() {
      return this.$store.getters['users/users'];
    },
    canManageUsers() {
      return this.$store.getters['auth/can']('org.users.manage');
    },
    roles() {
      return this.$store.getters['roles/roles'] || [];
    },
    roleFilterOptions() {
      return this.roles;
    },
    tableHeaders() {
      return [
        { title: this.t('userList.colName'), key: 'name', sortable: true },
        { title: this.t('userList.colPhone'), key: 'phone', sortable: false },
        { title: this.t('userList.colRole'), key: 'role', sortable: false },
        { title: 'Statut', key: 'status', sortable: false, width: 120 },
        { title: this.t('userList.colCreated'), key: 'createdAt', width: 130 },
        { title: '', key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    filteredUsers() {
      const q = (this.searchQuery || '').toLowerCase().trim();
      return this.users.filter((u) => {
        const fullName = this.getFullName(u).toLowerCase();
        const email = (u.email || '').toLowerCase();
        const matchesSearch = !q || fullName.includes(q) || email.includes(q);
        const matchesRole = !this.roleFilter || (u.roleId === this.roleFilter || u.role?.id === this.roleFilter);
        return matchesSearch && matchesRole;
      });
    },
  },
  mounted() {
    this.loadUsers();
    this.loadRoles();
  },
  methods: {
    async loadRoles() {
      this.rolesLoading = true;
      try { await this.$store.dispatch('roles/fetchRoles'); }
      finally { this.rolesLoading = false; }
    },
    async loadUsers() {
      this.loading = true;
      this.loadError = '';
      try {
        await this.$store.dispatch('users/fetchUsers');
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || 'Failed to load users';
      } finally {
        this.loading = false;
      }
    },
    getFullName(user) {
      if (!user) return '';
      return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '—';
    },
    getInitials(user) {
      if (!user) return '?';
      const f = (user.firstName || '')[0] || '';
      const l = (user.lastName || '')[0] || '';
      return (f + l).toUpperCase() || (user.email || '?')[0].toUpperCase();
    },
    formatDate(value) {
      if (!value) return '—';
      try { return new Date(value).toLocaleDateString('fr-FR'); } catch { return String(value); }
    },
    resetFilters() { this.searchQuery = ''; this.roleFilter = null; },
    onAddUser() { this.$router.push({ path: '/users/create' }); },
    openEditDrawer(item) {
      this.selectedUser = item?.raw ?? item;
      this.editDrawer = true;
    },
    openDeleteDialog(item) {
      this.deleteError = '';
      this.deleteLoading = false;
      this.deleteTarget = item?.raw ?? item;
      this.deleteDialog = true;
    },
    onSaved() { this.$store.dispatch('users/fetchUsers', { forceRefresh: true }); },
    lastSeenLabel(user) {
      const ts = user?.lastSignInAt || user?.raw?.lastSignInAt;
      if (!ts) return this.t('userList.statusActive');
      try { return `${this.t('userList.lastSeen')} ${new Date(ts).toLocaleString('fr-FR')}`; }
      catch { return this.t('userList.statusActive'); }
    },
    async reinvite(item) {
      const raw = item?.raw ?? item;
      const id = raw?.id || raw?._id;
      if (!id) return;
      this.reinvitingId = id;
      try {
        await reinviteUser(id);
        this.snackbar = { show: true, color: 'success', text: this.t('userList.reinviteSuccess') };
        await this.$store.dispatch('users/fetchUsers', { forceRefresh: true });
      } catch (e) {
        this.snackbar = { show: true, color: 'error', text: e?.response?.data?.message || e?.message || this.t('userList.reinviteError') };
      } finally {
        this.reinvitingId = null;
      }
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = 'Identifiant manquant'; return; }
        await deleteUser(id);
        await this.$store.dispatch('users/removeUser', id);
        this.deleteDialog = false;
        this.deleteTarget = null;
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || 'Échec de la suppression';
      } finally {
        this.deleteLoading = false;
      }
    },
    onExport() {
      const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Role'];
      const rows = this.users.map((u) => [
        u.firstName || '', u.lastName || '', u.email || '', u.phone || '', u.role?.name || u.roleName || '',
      ]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    },
    onImport() { this.$refs.importInput.click(); },
    onImportFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const lines = e.target.result.split('\n').slice(1).filter(Boolean);
        const users = lines.map((line) => {
          const [firstName, lastName, email, phone, roleName] = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
          return { firstName, lastName, email, phone, roleName };
        });
        this.$router.push({ path: '/users/create', query: { import: JSON.stringify(users) } });
      };
      reader.readAsText(file);
      event.target.value = '';
    },
  },
};
</script>

<style scoped>
#user-list-page {
  height: calc(100% - var(--v-layout-top, 64px));
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f9fafb;
}

/* ── Header dégradé ── */
.ul-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 24px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
}
.ul-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ul-header__body { flex: 1; min-width: 0; }
.ul-header__title { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 2px; }
.ul-header__sub { font-size: 12px; color: rgba(255, 255, 255, 0.72); margin: 0; }
.ul-header__actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.ul-hbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 14px; height: 34px; border-radius: 50px;
  font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s;
}
.ul-hbtn--ghost {
  background: rgba(255, 255, 255, 0.15); color: #fff;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
}
.ul-hbtn--ghost:hover { background: rgba(255, 255, 255, 0.25); }
.ul-hbtn--white { background: #fff; color: #ff3131; font-weight: 700; }
.ul-hbtn--white:hover { background: #fef2f2; box-shadow: 0 2px 8px rgba(255, 49, 49, 0.2); }

/* ── Search bar (aligné sur MarketPriceListView) ── */
.ul-searchbar {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.ul-searchbar__inner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 28px; flex-wrap: wrap;
}
.ul-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.ul-searchbar__input {
  flex: 1; min-width: 140px; border: none; outline: none;
  background: transparent; font-size: 14px; color: #111827; font-family: inherit;
}
.ul-searchbar__input::placeholder { color: #9ca3af; }

.ul-filter-pills { display: flex; gap: 8px; flex-wrap: wrap; }
.ul-select-wrap { position: relative; display: flex; align-items: center; }
.ul-filter-select {
  appearance: none;
  border: 1.5px solid #e5e7eb; border-radius: 100px;
  padding: 5px 30px 5px 12px;
  font-size: 12.5px; font-weight: 500; color: #374151;
  background: #f9fafb; cursor: pointer; outline: none;
  transition: border-color 0.18s;
}
.ul-filter-select:focus { border-color: #ff3131; }
.ul-select-chevron {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: #9ca3af; pointer-events: none;
}

.ul-searchbar__count { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.ul-searchbar__clear {
  background: none; border: none; padding: 2px;
  cursor: pointer; color: #9ca3af;
  display: flex; align-items: center; border-radius: 4px;
}
.ul-searchbar__clear:hover { color: #ff3131; }

/* ── Content ── */
.ul-content { flex: 1; padding: 20px 24px 32px; min-height: 0; }

.ul-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; margin-bottom: 16px;
  background: rgba(255, 49, 49, 0.08); border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 10px; font-size: 13px; color: #ff3131;
}

/* ── Table ── */
.ul-table-wrap {
  background: #fff; border-radius: 16px;
  border: 1px solid #e5e7eb; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.ul-table :deep(thead tr th) {
  background: #f9fafb !important;
  font-size: 11px !important; font-weight: 700 !important;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: #6b7280 !important; border-bottom: 1px solid #e5e7eb !important;
}
.ul-table :deep(tbody td) {
  padding-top: 12px !important; padding-bottom: 12px !important;
  border-bottom: 1px solid #f3f4f6 !important;
  font-size: 13.5px; color: #374151;
}
.ul-table :deep(tbody tr:last-child td) { border-bottom: none !important; }
.ul-table :deep(tbody tr:hover td) { background: #fafafa !important; }

/* ── Cellule utilisateur ── */
.ul-user-cell { display: flex; align-items: center; gap: 10px; }
.ul-user-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; color: #fff; flex-shrink: 0;
}
.ul-user-info { display: flex; flex-direction: column; gap: 1px; }
.ul-user-name { font-size: 13.5px; font-weight: 600; color: #111827; }
.ul-user-email { font-size: 11.5px; color: #9ca3af; }

/* ── Badges ── */
.ul-badge {
  display: inline-flex; align-items: center;
  padding: 2px 10px; border-radius: 20px;
  font-size: 11.5px; font-weight: 600;
}
.ul-badge--role { background: rgba(255, 49, 49, 0.08); color: #b91c1c; }
.ul-badge--active { background: rgba(16, 185, 129, 0.1); color: #059669; }
.ul-badge--pending { background: rgba(245, 158, 11, 0.1); color: #d97706; }

.ul-empty-cell { font-size: 13.5px; color: #d1d5db; }
.ul-text-muted { font-size: 13px; color: #6b7280; }
.ul-date { font-size: 12.5px; color: #6b7280; }

/* ── Actions ── */
.ul-actions { display: flex; justify-content: flex-end; gap: 4px; }
.ul-icon-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: #f3f4f6; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #6b7280; transition: all 0.15s;
}
.ul-icon-btn:hover { background: #e5e7eb; color: #374151; }
.ul-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ul-icon-btn--danger:hover { background: rgba(255, 49, 49, 0.1); color: #ff3131; }

/* ── Bouton générique ── */
.ul-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; height: 38px; border-radius: 50px;
  font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s;
}
.ul-btn--primary { background: #ff3131; color: #fff; }
.ul-btn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, 0.35); }

/* ── États ── */
.ul-loading { padding: 40px; display: flex; justify-content: center; }
.ul-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid #e5e7eb; border-top-color: #ff3131;
  animation: ul-spin 0.7s linear infinite;
}
@keyframes ul-spin { to { transform: rotate(360deg); } }

.ul-empty { padding: 56px 24px; text-align: center; }
.ul-empty__icon {
  width: 64px; height: 64px; border-radius: 16px;
  background: #f3f4f6; color: #9ca3af;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 14px;
}
.ul-empty__title { font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 6px; }
.ul-empty__sub { font-size: 13.5px; color: #6b7280; margin: 0; }

/* ── Dark mode ── (racine #user-list-page → sélecteur combiné pour battre la
   spécificité de l'ID sur le fond ; header rouge conservé). */
#user-list-page.ul--dark { background: #111827; }
.ul--dark .ul-searchbar { background: #1a2332; border-bottom-color: #374151; }
.ul--dark .ul-searchbar__input { color: #f3f4f6; }
.ul--dark .ul-filter-select { background: #1f2937; border-color: #374151; color: #e5e7eb; }
.ul--dark .ul-table-wrap { background: #1a2332; border-color: #374151; }
.ul--dark .ul-table :deep(thead tr th) { background: #1f2937 !important; color: #9ca3af !important; border-bottom-color: #374151 !important; }
.ul--dark .ul-table :deep(tbody td) { color: #e5e7eb; border-bottom-color: #374151 !important; }
.ul--dark .ul-table :deep(tbody tr:hover td) { background: #1f2937 !important; }
.ul--dark .ul-user-name { color: #f9fafb; }
.ul--dark .ul-icon-btn { background: #374151; color: #d1d5db; }
.ul--dark .ul-icon-btn:hover { background: #4b5563; color: #f9fafb; }
.ul--dark .ul-empty__icon { background: #1f2937; color: #6b7280; }
.ul--dark .ul-empty__title { color: #f9fafb; }
/* Badges statut : soft bg + texte foncé (calibrés fond clair) → voile + clair. */
.ul--dark .ul-badge--active { background: rgba(16, 185, 129, 0.18); color: #6ee7b7; }
.ul--dark .ul-badge--pending { background: rgba(245, 158, 11, 0.18); color: #fcd34d; }
</style>
