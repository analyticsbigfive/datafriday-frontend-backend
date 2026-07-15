<template>
    <div>
        <Card class="flex flex-col h-full">
            <CardHeader class="sticky top-0 z-10 bg-white dark:bg-gray-950 shrink-0">
                <template   template v-if="isMobile">
                    <div class="flex flex-col gap-3">
                        <CardTitle>Market Price List</CardTitle>

                        <input
                        ref="fileInputRef"
                        type="file"
                        accept=".csv"
                        @change="handleImportCSV"
                        class="hidden"
                        />

                        <Button class="w-full" @click="onAdd">
                            <Plus class="w-4 h-4 mr-2" />
                            Add Market Price
                        </Button>

                        <div class="flex items-center gap-3">
                            <div class="relative flex-1">
                                <Search
                                class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
                                />
                                <Input
                                placeholder="Search..."
                                :value="searchQuery"
                                @input="onSearchChange($event.target.value)"
                                class="pl-9"
                                />
                            </div>

                            <DropdownMenu>
                                <DropdownMenuTrigger as-child>
                                <Button variant="outline" size="icon">
                                    <Filter class="w-4 h-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                align="end"
                                class="w-56 max-h-96 overflow-y-auto"
                                >
                                <div class="px-2 py-1.5 text-sm font-semibold">Type</div>
                                <DropdownMenuItem @click="onFilterChange('all')">
                                    All Types
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="onFilterChange('Food')">
                                    Food
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="onFilterChange('Beverage')">
                                    Beverage
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="onFilterChange('Packaging')">
                                    Packaging
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <div class="px-2 py-1.5 text-sm font-semibold">Category</div>
                                <DropdownMenuItem @click="onCategoryFilterChange('all')">
                                    All Categories
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    v-for="category in uniqueCategories"
                                    :key="category"
                                    @click="onCategoryFilterChange(category)"
                                >
                                    {{ category }}
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <div class="px-2 py-1.5 text-sm font-semibold">Supplier</div>
                                <DropdownMenuItem @click="onSupplierFilterChange('all')">
                                    All Suppliers
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    v-for="supplier in suppliers"
                                    :key="supplier.id"
                                    @click="onSupplierFilterChange(supplier.id)"
                                >
                                    {{ supplier.name }}
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <div class="px-2 py-1.5 text-sm font-semibold">Space</div>
                                <DropdownMenuItem @click="onSpaceFilterChange('all')">
                                    All Spaces
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    v-for="space in spaces"
                                    :key="space.id"
                                    @click="onSpaceFilterChange(space.id)"
                                >
                                    {{ space.name }}
                                </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

        <div class="text-sm text-gray-500 dark:text-gray-400">
          <span>
            {{ items.length }} item<span v-if="items.length !== 1">s</span>
          </span>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col gap-3">
        <!-- Top row: Title and action buttons -->
        <div class="flex items-center justify-between">
          <CardTitle>Market Price List</CardTitle>
          <div class="flex items-center gap-2">
            <Button variant="outline" @click="handleExportCSV">
              <Download class="w-4 h-4 mr-2" />
              Export CSV
            </Button>

            <Button
              variant="outline"
              @click="$refs.fileInputRef && $refs.fileInputRef.click()"
            >
              <FileUp class="w-4 h-4 mr-2" />
              Import CSV
            </Button>

            <input
              ref="fileInputRef"
              type="file"
              accept=".csv"
              @change="handleImportCSV"
              class="hidden"
            />
          </div>
        </div>

        <!-- Bottom row: Search, filters, and add button -->
        <div class="flex items-center gap-3">
          <div class="relative flex-1">
            <Search
              class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
            />
            <Input
              placeholder="Search..."
              :value="searchQuery"
              @input="onSearchChange($event.target.value)"
              class="pl-9"
            />
          </div>

          <Select :value="filterGoodType" @update:model-value="onFilterChange">
            <div class="relative inline-block w-36">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Food">Food</SelectItem>
                <SelectItem value="Beverage">Beverage</SelectItem>
                <SelectItem value="Packaging">Packaging</SelectItem>
            </SelectContent>
            </div>            
          </Select>

          <Select
            :value="filterCategory"
            @update:model-value="onCategoryFilterChange"
          >
            <div class="relative inline-block w-36">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem
                  v-for="category in uniqueCategories"
                  :key="category"
                  :value="category"
                >
                  {{ category }}
                </SelectItem>
              </SelectContent>
            </div>
            
          </Select>

          <Select
            :value="filterSupplier"
            @update:model-value="onSupplierFilterChange"
          >
            <div class="relative inline-block w-36">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                <SelectItem
                  v-for="supplier in suppliers"
                  :key="supplier.id"
                  :value="supplier.id"
                >
                  {{ supplier.name }}
                </SelectItem>
            </SelectContent>
            </div>
          </Select>

          <Select
            :value="filterSpace"
            @update:model-value="onSpaceFilterChange"
          >
            <div class="relative inline-block w-36">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Spaces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Spaces</SelectItem>
                <SelectItem
                  v-for="space in spaces"
                  :key="space.id"
                  :value="space.id"
                >
                  {{ space.name }}
                </SelectItem>
              </SelectContent>
            </div>
          </Select>

          <Button size="icon" @click="onAdd">
            <Plus class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </template>
  </CardHeader>

  <CardContent class="flex-1 overflow-hidden flex flex-col p-0">
    <div
      v-if="isLoading"
      class="flex items-center justify-center flex-1"
    >
      <div class="text-center">
        <div
          class="inline-block w-8 h-8 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin mb-2"
        />
        <p class="text-gray-500 dark:text-gray-400">
          Loading market prices...
        </p>
      </div>
    </div>

    <div
      v-else-if="items.length === 0"
      class="text-center py-12 text-gray-500 dark:text-gray-400"
    >
      <ImageIcon
        class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600"
      />
      <p>No market prices found</p>
      <p class="text-sm">
        Click \"Add\" to get started or import from CSV
      </p>
    </div>

    <MarketPriceHierarchicalTable
      v-else
      :items="items"
      :suppliers="suppliers"
      :filterSpace="filterSpace"
      :onEditItemName="onEditItemName"
      :onDeleteItemName="onDeleteItemName"
      :onEditSupplierItem="onEditSupplierItem"
      :onDeleteSupplierItem="onDeleteSupplierItem"
      :onAddSupplierItem="onAddSupplierItem"
    />
  </CardContent>
</Card>
    </div>
</template>

<script>
import Button from '../ui/button.vue';
import Card from '../ui/card.vue';
import CardHeader from '../ui/cardHeader.vue';
import CardTitle from '../ui/cardTitle.vue';
import CardContent from '../ui/cardContent.vue';
import Input from '../ui/input.vue';
import DropdownMenuContent from '../ui/dropdownMenuContent.vue'; 
import DropdownMenuItem from '../ui/dropdownMenuItem.vue';
import DropdownMenuSeparator from '../ui/dropdownMenuSeparator.vue';
import DropdownMenu from '../ui/dropdownMenu.vue';
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue'; 
import { Plus, Search, Filter, Download, FileUp, ImageIcon } from 'lucide-vue-next'
import Select from '../ui/select.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import MarketPriceHierarchicalTable from './MarketPriceHierarchicalTable.vue';
//import { toast } from 'sonner' // adapte à ton équivalent Vue si besoin

export default {
  name: 'NewMarketPriceView',
  components: {
    Button,Input,Card,CardHeader,CardTitle,CardContent,DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,
    Plus,Search,Filter,Download,FileUp,ImageIcon, Select,SelectTrigger,SelectValue,SelectContent,SelectItem, MarketPriceHierarchicalTable
  },
  props: {
    items: {
      type: Array,
      required: true,
    },
    allItems: {
      type: Array,
      required: true,
    },
    suppliers: {
      type: Array,
      required: true,
    },
    spaces: {
      type: Array,
      required: true,
    },
    isLoading: {
      type: Boolean,
      required: true,
    },

    onAdd: {
      type: Function,
      required: true,
    },
    onAddSupplierItem: {
      type: Function,
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
    onImport: {
      type: Function,
      required: true,
    },
    onDeduplicate: {
      type: Function,
      required: true,
    },

    searchQuery: {
      type: String,
      required: true,
    },
    onSearchChange: {
      type: Function,
      required: true,
    },

    filterGoodType: {
      type: String,
      required: true,
    },
    onFilterChange: {
      type: Function,
      required: true,
    },

    filterSupplier: {
      type: String,
      required: true,
    },
    onSupplierFilterChange: {
      type: Function,
      required: true,
    },

    filterCategory: {
      type: String,
      required: true,
    },
    onCategoryFilterChange: {
      type: Function,
      required: true,
    },

    filterSpace: {
      type: String,
      required: true,
    },
    onSpaceFilterChange: {
      type: Function,
      required: true,
    },
  },

  data() {
    return {
      isMobile: false,
      fileInputRef: null,
    }
  },

  computed: {
    uniqueCategories() {
      const categories = new Set()
      this.allItems.forEach(item => {
        if (item.category) categories.add(item.category)
      })
      return Array.from(categories).sort()
    },

    groupedItemNames() {
      const groups = new Map()

      this.allItems.forEach(item => {
        if (!groups.has(item.itemName)) {
          groups.set(item.itemName, {
            itemName: item.itemName,
            goodType: item.goodType,
            image: item.image,
            supplierItems: [],
          })
        }
        groups.get(item.itemName).supplierItems.push(item)
      })

      return Array.from(groups.values()).sort((a, b) =>
        a.itemName.localeCompare(b.itemName),
      )
    },
  },

  mounted() {
    this.updateIsMobile()
    // connecter le ref de l'input fichier à la propriété data
    this.fileInputRef = this.$refs.fileInputRef
    window.addEventListener('resize', this.updateIsMobile)
  },

  beforeUnmount() {
    window.removeEventListener('resize', this.updateIsMobile)
  },

  methods: {
    updateIsMobile() {
      this.isMobile = window.matchMedia('(max-width: 768px)').matches
    },

    handleExportCSV() {
      if (!this.allItems.length) {
        toast.error?.('No data to export')
        return
      }

      const headers = [
        'Supplier',
        'Item Name',
        'Supplier Item',
        'Good Type',
        'Unit',
        'Units Per Purchase',
        'Price',
        'Price Per Unit',
        'Packed Units',
        'Number of Units',
        'Dimensions (L/W/H)',
      ]

      const rows = this.allItems.map(item => {
        const dimensions =
          item.packingLength && item.packingWidth && item.packingHeight
            ? `${item.packingLength}/${item.packingWidth}/${item.packingHeight}`
            : ''

        return [
          (this.suppliers.find(s => s.id === item.supplier_id)?.name) ||
            'Unknown Supplier',
          item.itemName,
          item.supplierItem || '',
          item.goodType,
          item.unit,
          String(item.unitsPerPurchase),
          item.price.toFixed(2),
          item.pricePerUnit.toFixed(2),
          item.packedUnits != null ? String(item.packedUnits) : '',
          item.numberOfUnits != null ? String(item.numberOfUnits) : '',
          dimensions,
        ]
      })

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `market-prices-${new Date()
        .toISOString()
        .split('T')[0]}.csv`
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success?.('CSV exported successfully')
    },

    detectDelimiter(text) {
      const firstLine = text.split(/\r?\n/)[0]
      let commaCount = 0
      let semicolonCount = 0
      let inQuotes = false

      for (const char of firstLine) {
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (!inQuotes) {
          if (char === ',') commaCount++
          if (char === ';') semicolonCount++
        }
      }

      return semicolonCount > commaCount ? ';' : ','
    },

    parseCSVLine(line, delimiter = ',') {
      const result = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }

      result.push(current.trim())
      return result
    },

    handleImportCSV(event) {
      const file = event.target.files?.[0]
      if (!file) return

      const reader = new FileReader()

      reader.onload = e => {
        try {
          const text = e.target?.result
          if (typeof text !== 'string') {
            throw new Error('Invalid file content')
          }

          const lines = text.split(/\r?\n/).filter(line => line.trim())
          if (lines.length < 2) {
            toast.error?.('CSV file is empty or invalid')
            return
          }

          const delimiter = this.detectDelimiter(text)
          const headers = this.parseCSVLine(lines[0], delimiter)
          const rows = lines
            .slice(1)
            .map(line => this.parseCSVLine(line, delimiter))

          this.onImport(headers, rows)
        } catch (error) {
          console.error('Error parsing CSV:', error)
          toast.error?.('Failed to parse CSV file')
        }
      }

      reader.onerror = () => {
        toast.error?.('Failed to read CSV file')
      }

      reader.readAsText(file)

      const input = this.fileInputRef || this.$refs.fileInputRef
      if (input) {
        input.value = ''
      }
    },
  },
}
</script>