<template>
    <div class="overflow-x-auto flex-1 flex flex-col">
  <div class="inline-block min-w-full align-middle flex-1 flex flex-col">
    <div class="flex-1 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-12"></TableHead>
            <TableHead class="w-16">Image</TableHead>
            <TableHead class="min-w-[200px]">Item Name</TableHead>
            <TableHead class="w-24">Recipe Unit</TableHead>
            <TableHead class="w-32">Purchase Unit Conversion</TableHead>
            <TableHead class="w-32">Good Type</TableHead>
            <TableHead class="w-32">Category</TableHead>
            <TableHead class="w-28 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="showSections">
            <!-- Available Items Section -->
            <template v-if="availableItems.length > 0">
              <TableRow
                class="bg-green-100 dark:bg-green-950 hover:bg-green-200 dark:hover:bg-green-900 border-t border-b border-gray-300 dark:border-gray-700"
                :style="{ borderTopWidth: '1px', borderBottomWidth: '1px' }"
              >
                <TableCell colSpan="8" class="py-2 px-0">
                  <button
                    @click="showAvailableSection = !showAvailableSection"
                    class="w-full flex items-center justify-between px-4 py-2 font-semibold text-green-900 dark:text-green-100 hover:bg-green-50 dark:hover:bg-green-900 transition-colors border-none outline-none focus:outline-none"
                  >
                    <span>
                      Available in Selected Space ({{ availableItems.length }})
                    </span>
                    <ChevronDown
                      v-if="showAvailableSection"
                      class="w-5 h-5"
                    />
                    <ChevronRight
                      v-else
                      class="w-5 h-5"
                    />
                  </button>
                </TableCell>
              </TableRow>

              <template v-if="showAvailableSection">
                <!-- à adapter selon ta structure de group -->
                <template
                  v-for="group in availableItems"
                  :key="group.itemName"
                >
                  <!-- remplace ceci par ton propre rendu de groupe -->
                  <!-- par ex: <MarketPriceItemGroup :group="group" :is-available="true" /> -->
                </template>
              </template>
            </template>

            <!-- Not Available Items Section -->
            <template v-if="notAvailableItems.length > 0">
              <TableRow
                class="bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 border-t border-b border-gray-300 dark:border-gray-700"
                :style="{ borderTopWidth: '1px', borderBottomWidth: '1px' }"
              >
                <TableCell colSpan="8" class="py-2 px-0">
                  <button
                    @click="showNotAvailableSection = !showNotAvailableSection"
                    class="w-full flex items-center justify-between px-4 py-2 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-none outline-none focus:outline-none"
                  >
                    <span>
                      Not Available in Selected Space ({{ notAvailableItems.length }})
                    </span>
                    <ChevronDown
                      v-if="showNotAvailableSection"
                      class="w-5 h-5"
                    />
                    <ChevronRight
                      v-else
                      class="w-5 h-5"
                    />
                  </button>
                </TableCell>
              </TableRow>

              <template v-if="showNotAvailableSection">
                <template
                  v-for="group in notAvailableItems"
                  :key="group.itemName"
                >
                  <!-- par ex: <MarketPriceItemGroup :group="group" :is-available="false" /> -->
                </template>
              </template>
            </template>
          </template>

          <template v-else>
            <!-- Show all items when no space filter is active -->
            <template
              v-for="group in availableItems"
              :key="group.itemName"
            >
              <!-- par ex: <MarketPriceItemGroup :group="group" :is-available="true" /> -->
            </template>
          </template>
        </TableBody>
      </Table>
    </div>
  </div>
</div>
</template>

<script>
import Table from '../ui/table.vue'
import TableBody from '../ui/tableBody.vue'
import TableCell from '../ui/tableCell.vue'
import TableHead from '../ui/tableHead.vue'
import TableHeader from '../ui/tableHeader.vue'
import TableRow from '../ui/tableRow.vue'

import Button from '../ui/button.vue'
import Badge from '../ui/badge.vue'
// À adapter : si tu as un équivalent Vue pour ImageWithFallback, importe-le ici
// import ImageWithFallback from '../figma/ImageWithFallback.vue'

import { Pencil, Trash2, ChevronRight, ChevronDown, Image as ImageIcon, Plus } from 'lucide-vue-next'

export default {
  name: 'MarketPriceHierarchicalTable',

  components: {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Button,
    Badge,
    // ImageWithFallback,
    Pencil,
    Trash2,
    ChevronRight,
    ChevronDown,
    ImageIcon,
    Plus,
  },

  props: {
    items: {
      type: Array,
      required: true,
    },
    suppliers: {
      type: Array,
      required: true,
    },
    filterSpace: {
      type: String,
      required: true,
    },
    onEditItemName: {
      type: Function,
      required: true,
    },
    onDeleteItemName: {
      type: Function,
      required: true,
    },
    onEditSupplierItem: {
      type: Function,
      required: true,
    },
    onDeleteSupplierItem: {
      type: Function,
      required: true,
    },
    onAddSupplierItem: {
      type: Function,
      required: true,
    },
  },

  data() {
    return {
      // équivalent des useState
      expandedItemNames: new Set(),      // Set<string>
      showAvailableSection: true,
      showNotAvailableSection: true,
    }
  },

  computed: {
    // Map fournisseur pour accès O(1)
    supplierMap() {
      const map = new Map()
      this.suppliers.forEach(supplier => {
        map.set(supplier.id, supplier)
      })
      return map
    },

    // renvoie une fonction comme dans useMemo(() => (item) => ...)
    isItemAvailableInSpace() {
      return (item) => {
        if (this.filterSpace === 'all') return true

        const supplier = this.supplierMap.get(item.supplier_id)
        if (!supplier) return false

        // si pas de sites: tous les espaces, sinon on check l'id de l'espace
        return supplier.sites.length === 0 || supplier.sites.includes(this.filterSpace)
      }
    },

    // Grouping + tri disponibles / non-disponibles
    availableItems() {
      const available = new Map()
      const notAvailable = new Map()

      this.items.forEach(item => {
        const isAvailable = this.isItemAvailableInSpace(item)
        const targetMap = isAvailable ? available : notAvailable

        if (!targetMap.has(item.itemName)) {
          targetMap.set(item.itemName, {
            itemName: item.itemName,
            goodType: item.goodType,
            category: item.category,
            recipeUnit: item.recipeUnit,
            purchaseUnitConversion: item.purchaseUnitConversion,
            image: item.image,
            supplierItems: [],
          })
        }
        targetMap.get(item.itemName).supplierItems.push(item)
      })

      const sortedAvailable = Array.from(available.values()).sort((a, b) =>
        a.itemName.localeCompare(b.itemName),
      )
      const sortedNotAvailable = Array.from(notAvailable.values()).sort((a, b) =>
        a.itemName.localeCompare(b.itemName),
      )

      // on renvoie seulement la partie « available » ici ;
      // pour notAvailableItems on fait un computed séparé
      this._notAvailableItemsCache = sortedNotAvailable
      return sortedAvailable
    },

    notAvailableItems() {
      // récupéré du cache peu élégant mais simple,
      // sinon il faudrait factoriser la logique dans une méthode commune
      if (this._notAvailableItemsCache) {
        return this._notAvailableItemsCache
      }

      const notAvailable = new Map()
      this.items.forEach(item => {
        const isAvailable = this.isItemAvailableInSpace(item)
        if (!isAvailable) {
          if (!notAvailable.has(item.itemName)) {
            notAvailable.set(item.itemName, {
              itemName: item.itemName,
              goodType: item.goodType,
              category: item.category,
              recipeUnit: item.recipeUnit,
              purchaseUnitConversion: item.purchaseUnitConversion,
              image: item.image,
              supplierItems: [],
            })
          }
          notAvailable.get(item.itemName).supplierItems.push(item)
        }
      })

      return Array.from(notAvailable.values()).sort((a, b) =>
        a.itemName.localeCompare(b.itemName),
      )
    },

    // équivalent const showSections = filterSpace !== 'all'
    showSections() {
      return this.filterSpace !== 'all'
    },
  },

  methods: {
    toggleExpanded(itemName) {
      const next = new Set(this.expandedItemNames)
      if (next.has(itemName)) {
        next.delete(itemName)
      } else {
        next.add(itemName)
      }
      this.expandedItemNames = next
    },

    isGroupExpanded(group) {
      return this.expandedItemNames.has(group.itemName)
    },

    handleAddSupplierItem(group) {
      this.onAddSupplierItem && this.onAddSupplierItem(group.itemName)
    },

    handleEditItemName(group) {
      this.onEditItemName &&
        this.onEditItemName(group.itemName, group.goodType, group.image)
    },

    handleDeleteItemName(group) {
      this.onDeleteItemName && this.onDeleteItemName(group.itemName)
    },

    handleEditSupplierItem(item) {
      this.onEditSupplierItem && this.onEditSupplierItem(item)
    },

    handleDeleteSupplierItem(id) {
      this.onDeleteSupplierItem && this.onDeleteSupplierItem(id)
    },

    formatRecipeUnitCost(purchaseUnitConversion, pricePerUnit) {
      if (!purchaseUnitConversion) return '-'
      const value = (purchaseUnitConversion * pricePerUnit).toFixed(2)
      return `$${value}`
    },

    formatPackagingInfo(item) {
      const parts = []

      if (item.packedUnits && item.numberOfUnits) {
        parts.push(`${item.packedUnits} ${item.unit} × ${item.numberOfUnits}`)
      }

      if (item.packingLength && item.packingWidth && item.packingHeight) {
        parts.push(
          `${item.packingLength}/${item.packingWidth}/${item.packingHeight} cm`,
        )
      }

      if (parts.length === 0) return '-'
      return parts.join('\n')
    },

    formatTimestamp(timestamp) {
      if (!timestamp) return '-'
      return new Date(timestamp).toLocaleString()
    },
  },
}
</script>