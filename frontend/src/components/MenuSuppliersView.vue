<template>
  <div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Barre top optionnelle avec bouton de fermeture -->
    <div
      v-if="onClose"
      class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between"
    >
      <div class="flex items-center gap-4">
        <button
          class="inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-gray-700 hover:bg-gray-100 h-9 w-9"
          type="button"
          @click="onClose"
        >
          <XIcon class="w-5 h-5" />
        </button>
        <h2 class="font-semibold">Edit HR Suppliers</h2>
      </div>
      <button
        class="inline-flex items-center justify-center rounded-md bg-gray-900 text-white text-sm px-3 py-1.5 hover:bg-gray-800"
        type="button"
        @click="handleAddSupplier"
      >
        <PlusIcon class="w-4 h-4 mr-2" />
        Add Supplier
      </button>
    </div>

    <!-- Contenu principal -->
    <div class="flex-1 overflow-y-auto p-4">
      <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
        <!-- Header carte -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
          <div
            class="flex"
            :class="isMobile ? 'flex-col gap-3' : 'items-center justify-between'"
          >
            <h3 class="font-semibold text-gray-900 dark:text-gray-100">
              HR Suppliers Library
            </h3>
            <div class="flex gap-2">
              <button
                class="inline-flex items-center justify-center rounded-md bg-gray-900 text-white text-sm px-3 py-1.5 hover:bg-gray-800"
                type="button"
                @click="handleAddSupplier"
              >
                <PlusIcon class="w-4 h-4 mr-2" />
                Add Supplier
              </button>
            </div>
          </div>

          <!-- Recherche -->
          <div class="flex items-center gap-3 mt-4">
            <div class="relative flex-1">
              <SearchIcon
                class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
              />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search suppliers..."
                class="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
            <span>
              {{ filteredSuppliers.length }} supplier<span v-if="filteredSuppliers.length !== 1">s</span>
            </span>
          </div>
        </div>

        <!-- Tableau -->
        <div class="p-4 overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <tr>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Name</th>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Email</th>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Phone</th>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Contact Name</th>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Spaces</th>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Configurations</th>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Sectors</th>
                <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="supplier in filteredSuppliers"
                :key="supplier.id"
                class="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="px-4 py-3 dark:text-gray-300">{{ supplier.name }}</td>
                <td class="px-4 py-3 dark:text-gray-300">{{ supplier.email }}</td>
                <td class="px-4 py-3 dark:text-gray-300">{{ supplier.phone }}</td>
                <td class="px-4 py-3 dark:text-gray-300">{{ supplier.contactName }}</td>
                <td class="px-4 py-3 dark:text-gray-300">
                  {{ getSpaceNames(supplier.spaceIds) }}
                </td>
                <td class="px-4 py-3 dark:text-gray-300">
                  {{ getConfigNames(supplier.configurationIds) }}
                </td>
                <td class="px-4 py-3 dark:text-gray-300">
                  {{ getSectorsText(supplier.sectors) }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex gap-2">
                    <button
                      class="text-xs px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                      type="button"
                      @click="startEditSupplier(supplier)"
                    >
                      Edit
                    </button>
                    <button
                      class="text-xs px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                      type="button"
                      @click="handleDeleteSupplier(supplier.id)"
                    >
                      <Trash2Icon class="w-4 h-4 text-red-500 dark:text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredSuppliers.length === 0">
                <td
                  colspan="8"
                  class="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  No suppliers yet. Click \"Add Supplier\" to create your first supplier.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Dialog Add / Edit Supplier (version simple) -->
    <div
      v-if="showAddDialog"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        class="absolute inset-0 bg-black/40"
        @click="showAddDialog = false"
      ></div>
      <div
        class="relative z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
      >
        <h3 class="text-base font-semibold mb-4">
          {{ editingSupplier && editingSupplier.name ? 'Edit Supplier' : 'Add Supplier' }}
        </h3>

        <div v-if="editingSupplier" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Name *</label>
            <input
              v-model="editingSupplier.name"
              type="text"
              class="w-full border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder="Enter supplier name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Email Address</label>
            <input
              v-model="editingSupplier.email"
              type="email"
              class="w-full border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder="Enter email address"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Phone Number</label>
            <input
              v-model="editingSupplier.phone"
              type="tel"
              class="w-full border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder="Enter phone number"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Contact Name</label>
            <input
              v-model="editingSupplier.contactName"
              type="text"
              class="w-full border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder="Enter contact name"
            />
          </div>

          <!-- Spaces (simplifié : checkboxes) -->
          <div>
            <label class="block text-sm font-medium mb-1">Spaces *</label>
            <div class="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              <div class="flex items-center space-x-2">
                <input
                  id="all-spaces"
                  type="checkbox"
                  :checked="editingSupplier.spaceIds.length === spaces.length"
                  @change="toggleAllSpaces"
                />
                <label for="all-spaces" class="cursor-pointer text-sm">All Spaces</label>
              </div>
              <div
                v-for="space in spaces"
                :key="space.id"
                class="flex items-center space-x-2"
              >
                <input
                  :id="`space-${space.id}`"
                  type="checkbox"
                  :checked="editingSupplier.spaceIds.includes(space.id)"
                  @change="() => toggleSpace(space.id)"
                />
                <label :for="`space-${space.id}`" class="cursor-pointer text-sm">
                  {{ space.name }}
                </label>
              </div>
            </div>
          </div>

          <!-- Sectors (simplifié) -->
          <div>
            <label class="block text-sm font-medium mb-1">Sectors *</label>
            <div class="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              <div class="flex items-center space-x-2">
                <input
                  id="all-sectors"
                  type="checkbox"
                  :checked="editingSupplier.sectors.length === SECTORS.length"
                  @change="toggleAllSectors"
                />
                <label for="all-sectors" class="cursor-pointer text-sm">
                  All Sectors
                </label>
              </div>
              <div
                v-for="sector in SECTORS"
                :key="sector"
                class="flex items-center space-x-2"
              >
                <input
                  :id="`sector-${sector}`"
                  type="checkbox"
                  :checked="editingSupplier.sectors.includes(sector)"
                  @change="() => toggleSector(sector)"
                />
                <label :for="`sector-${sector}`" class="cursor-pointer text-sm">
                  {{ sector }}
                </label>
              </div>
            </div>
          </div>

          <div class="flex gap-2 pt-4 justify-end">
            <button
              class="inline-flex items-center justify-center rounded-md bg-gray-900 text-white text-sm px-3 py-1.5 hover:bg-gray-800"
              type="button"
              @click="handleSaveSupplier"
            >
              Save Supplier
            </button>
            <button
              class="inline-flex items-center justify-center rounded-md border border-gray-300 text-sm px-3 py-1.5 hover:bg-gray-50"
              type="button"
              @click="showAddDialog = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>

import { Plus, Trash2, X, Search } from 'lucide-vue-next'
import * as api from '../utils/mockAPI'
import * as hrApi from '../utils/mockAPI'

const SECTORS = ['F&B', 'Hospitality', 'Merch', 'Ticketing', 'Access', 'Kitchen', 'Entertainment']

export default {
  name: 'HRSuppliersView',
  props: {
    onClose: {
      type: Function,
      default: null
    }
  },
  components: {
    PlusIcon: Plus,
    Trash2Icon: Trash2,
    XIcon: X,
    SearchIcon: Search
  },
  data() {
    return {
      suppliers: [],
      spaces: [],
      configurations: {}, // { [spaceId]: Configuration[] } (si tu veux l'ajouter plus tard)
      editingSupplier: null,
      showAddDialog: false,
      searchQuery: '',
      isMobile: false // tu peux le brancher à un hook/useIsMobile plus tard
    }
  },
  computed: {
    filteredSuppliers() {
      const q = this.searchQuery.trim().toLowerCase()
      if (!q) return this.suppliers
      return this.suppliers.filter(s => {
        return (
          (s.name || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q) ||
          (s.contactName || '').toLowerCase().includes(q)
        )
      })
    }
  },
  mounted() {
    this.loadData()
  },
  methods: {
    async loadData() {
      try {
        const [spacesData, suppliersData] = await Promise.all([
          api.getAllSpaces(),
          hrApi.getAllHRSuppliers()
        ])
        this.spaces = spacesData
        this.suppliers = suppliersData
        // Si tu veux aussi charger les configurations :
        // this.configurations = ...
      } catch (e) {
        console.error('Failed to load HR suppliers data:', e)
      }
    },
    createNewSupplier() {
      return {
        id: crypto.randomUUID(),
        name: '',
        email: '',
        phone: '',
        contactName: '',
        spaceIds: [],
        configurationIds: [],
        sectors: []
      }
    },
    handleAddSupplier() {
      this.editingSupplier = this.createNewSupplier()
      this.showAddDialog = true
    },
    startEditSupplier(supplier) {
      this.editingSupplier = { ...supplier }
      this.showAddDialog = true
    },
    async handleSaveSupplier() {
      if (!this.editingSupplier) return
      try {
        const idx = this.suppliers.findIndex(s => s.id === this.editingSupplier.id)
        if (idx >= 0) {
          await hrApi.updateHRSupplier(this.editingSupplier)
          const arr = [...this.suppliers]
          arr[idx] = this.editingSupplier
          this.suppliers = arr
        } else {
          await hrApi.createHRSupplier(this.editingSupplier)
          this.suppliers = [...this.suppliers, this.editingSupplier]
        }
        this.showAddDialog = false
        this.editingSupplier = null
      } catch (e) {
        console.error('Failed to save supplier:', e)
      }
    },
    async handleDeleteSupplier(id) {
      try {
        await hrApi.deleteHRSupplier(id)
        this.suppliers = this.suppliers.filter(s => s.id !== id)
      } catch (e) {
        console.error('Failed to delete supplier:', e)
      }
    },
    toggleSpace(spaceId) {
      if (!this.editingSupplier) return
      const cur = this.editingSupplier.spaceIds || []
      const exists = cur.includes(spaceId)
      const next = exists ? cur.filter(id => id !== spaceId) : [...cur, spaceId]
      this.editingSupplier = { ...this.editingSupplier, spaceIds: next }
    },
    toggleAllSpaces() {
      if (!this.editingSupplier) return
      if (this.editingSupplier.spaceIds.length === this.spaces.length) {
        this.editingSupplier = { ...this.editingSupplier, spaceIds: [] }
      } else {
        this.editingSupplier = { ...this.editingSupplier, spaceIds: this.spaces.map(s => s.id) }
      }
    },
    toggleSector(sector) {
      if (!this.editingSupplier) return
      const cur = this.editingSupplier.sectors || []
      const exists = cur.includes(sector)
      const next = exists ? cur.filter(s => s !== sector) : [...cur, sector]
      this.editingSupplier = { ...this.editingSupplier, sectors: next }
    },
    toggleAllSectors() {
      if (!this.editingSupplier) return
      if (this.editingSupplier.sectors.length === SECTORS.length) {
        this.editingSupplier = { ...this.editingSupplier, sectors: [] }
      } else {
        this.editingSupplier = { ...this.editingSupplier, sectors: [...SECTORS] }
      }
    },
    getSpaceNames(spaceIds) {
      if (!spaceIds || !spaceIds.length) return ''
      if (spaceIds.length === this.spaces.length) return 'All'
      return spaceIds
        .map(id => this.spaces.find(s => s.id === id)?.name)
        .filter(Boolean)
        .join(', ')
    },
    getConfigNames(configIds) {
      // stub pour l’instant, tu peux reproduire la logique complète si besoin
      if (!configIds || !configIds.length) return ''
      return `${configIds.length} configuration(s)`
    },
    getSectorsText(sectors) {
      if (!sectors || !sectors.length) return ''
      if (sectors.length === SECTORS.length) return 'All'
      return sectors.join(', ')
    }
  },
  
}
</script>