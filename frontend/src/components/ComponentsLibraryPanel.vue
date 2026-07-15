<template>
  <div>
    <Card>
      <CardHeader>
        <div :class="['flex', isMobile ? 'flex-col gap-3' : 'items-center justify-between']">
          <CardTitle>Components Library</CardTitle>

          <div class="flex gap-2">
            <!-- CSV Export -->
            <Button
              variant="outline"
              :size="isMobile ? 'default' : 'default'"
              @click="handleExportCSV"
            >
              <Download class="w-4 h-4 mr-2" />
              Export CSV
            </Button>

            <!-- Add Button -->
            <Button
              :size="isMobile ? 'default' : 'default'"
              @click="onAddNew"
            >
              <Plus class="w-4 h-4 mr-2" />
              Add Component
            </Button>
          </div>
        </div>

        <!-- Search and Filters -->
        <div class="flex items-center gap-3 mt-4">
          <div class="relative flex-1">
            <Search
              class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
            />
            <Input
              placeholder="Search by component name..."
              v-model="searchQuery"
              class="pl-9"
            />
          </div>

          <template v-if="isMobile">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="icon">
                  <Filter class="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-56">
                <DropdownMenuLabel>Category</DropdownMenuLabel>
                <DropdownMenuItem @click="filterCategory = 'all'">
                  All Categories
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterCategory = 'Food'">
                  Food
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterCategory = 'Beverage'">
                  Beverage
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuLabel>Type</DropdownMenuLabel>
                <DropdownMenuItem @click="filterComponentCategory = 'all'">
                  All Types
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Sauce'">
                  Sauce
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Meat'">
                  Meat
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Fish'">
                  Fish
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Veg'">
                  Veg
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Salad'">
                  Salad
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Biscuit'">
                  Biscuit
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Jus'">
                  Jus
                </DropdownMenuItem>
                <DropdownMenuItem @click="filterComponentCategory = 'Juice'">
                  Juice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>

          <template v-else>
            <Select
              :value="filterCategory"
              :onValueChange="value => (filterCategory = value)"
            >
              <div class="relative inline-block w-40">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Food">Food</SelectItem>
                  <SelectItem value="Beverage">Beverage</SelectItem>
                </SelectContent>
              </div>
            </Select>

            <Select
              :value="filterComponentCategory"
              :onValueChange="value => (filterComponentCategory = value)"
            >
              <div class="relative inline-block w-40">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Sauce">Sauce</SelectItem>
                  <SelectItem value="Meat">Meat</SelectItem>
                  <SelectItem value="Fish">Fish</SelectItem>
                  <SelectItem value="Veg">Veg</SelectItem>
                  <SelectItem value="Salad">Salad</SelectItem>
                  <SelectItem value="Biscuit">Biscuit</SelectItem>
                  <SelectItem value="Jus">Jus</SelectItem>
                  <SelectItem value="Juice">Juice</SelectItem>
                </SelectContent>
              </div>
            </Select>
          </template>
        </div>

        <!-- Helper text -->
        <div class="mt-3 text-sm text-gray-500">
          <span>
            {{ filteredComponents.length }}
            component<span v-if="filteredComponents.length !== 1">s</span>
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div class="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Units/Recipe</TableHead>
                <TableHead>Storage Type</TableHead>
                <TableHead>Unit Cost (€)</TableHead>
                <TableHead>Sub-Items</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              <TableRow
                v-if="filteredComponents.length === 0"
              >
                <TableCell
                  colSpan="9"
                  class="text-center py-8 text-gray-500 dark:text-gray-400"
                >
                  No components found. Add a component to get started.
                </TableCell>
              </TableRow>

              <TableRow
                v-else
                v-for="component in filteredComponents"
                :key="component.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <!-- Component Name -->
                <TableCell
                  class="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                  @click="handleCellClick(component, 'name')"
                >
                  <template
                    v-if="editingField && editingField.id === component.id && editingField.field === 'name'"
                  >
                    <Input
                      v-model="editValue"
                      @blur="handleCellBlur"
                      @keydown="handleKeyDown"
                      autofocus
                      class="h-8"
                    />
                  </template>
                  <template v-else>
                    <span>{{ component.name }}</span>
                  </template>
                </TableCell>

                <!-- Category -->
                <TableCell
                  class="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                  @click="handleCellClick(component, 'category')"
                >
                  <template
                    v-if="editingField && editingField.id === component.id && editingField.field === 'category'"
                  >
                    <Select
                      :value="editValue"
                      :onValueChange="value => { editValue = value; setTimeout(handleCellBlur, 0) }"
                    >
                      <div class="relative inline-block h-8">
                        <SelectTrigger class="h-8 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Food">Food</SelectItem>
                          <SelectItem value="Beverage">Beverage</SelectItem>
                        </SelectContent>
                      </div>
                    </Select>
                  </template>
                  <template v-else>
                    <Badge variant="secondary">
                      {{ component.category }}
                    </Badge>
                  </template>
                </TableCell>

                <!-- Component Category -->
                <TableCell
                  class="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                  @click="handleCellClick(component, 'componentCategory')"
                >
                  <template
                    v-if="editingField && editingField.id === component.id && editingField.field === 'componentCategory'"
                  >
                    <Select
                      :value="editValue"
                      :onValueChange="value => { editValue = value; setTimeout(handleCellBlur, 0) }"
                    >
                      <div class="relative inline-block h-8">
                        <SelectTrigger class="h-8 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sauce">Sauce</SelectItem>
                          <SelectItem value="Meat">Meat</SelectItem>
                          <SelectItem value="Fish">Fish</SelectItem>
                          <SelectItem value="Veg">Veg</SelectItem>
                          <SelectItem value="Salad">Salad</SelectItem>
                          <SelectItem value="Biscuit">Biscuit</SelectItem>
                          <SelectItem value="Jus">Jus</SelectItem>
                          <SelectItem value="Juice">Juice</SelectItem>
                        </SelectContent>
                      </div>
                    </Select>
                  </template>
                  <template v-else>
                    <Badge>
                      {{ component.componentCategory }}
                    </Badge>
                  </template>
                </TableCell>

                <!-- Unit -->
                <TableCell
                  class="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                  @click="handleCellClick(component, 'unit')"
                >
                  <template
                    v-if="editingField && editingField.id === component.id && editingField.field === 'unit'"
                  >
                    <Select
                      :value="editValue"
                      :onValueChange="value => { editValue = value; setTimeout(handleCellBlur, 0) }"
                    >
                      <div class="relative inline-block h-8">
                        <SelectTrigger class="h-8 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="liter">liter</SelectItem>
                          <SelectItem value="piece">piece</SelectItem>
                        </SelectContent>
                      </div>
                    </Select>
                  </template>
                  <template v-else>
                    <span>{{ component.unit }}</span>
                  </template>
                </TableCell>

                <!-- Number of Units Recipe -->
                <TableCell
                  class="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                  @click="handleCellClick(component, 'numberOfUnitsRecipe')"
                >
                  <template
                    v-if="editingField && editingField.id === component.id && editingField.field === 'numberOfUnitsRecipe'"
                  >
                    <Input
                      type="number"
                      step="0.001"
                      v-model="editValue"
                      @blur="handleCellBlur"
                      @keydown="handleKeyDown"
                      autofocus
                      class="h-8 w-24"
                    />
                  </template>
                  <template v-else>
                    <span>{{ component.numberOfUnitsRecipe.toFixed(3) }}</span>
                  </template>
                </TableCell>

                <!-- Storage Type -->
                <TableCell
                  class="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                  @click="handleCellClick(component, 'storageType')"
                >
                  <template
                    v-if="editingField && editingField.id === component.id && editingField.field === 'storageType'"
                  >
                    <Select
                      :value="editValue"
                      :onValueChange="value => { editValue = value; setTimeout(handleCellBlur, 0) }"
                    >
                      <div class="relative inline-block h-8">
                        <SelectTrigger class="h-8 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Dry">Dry</SelectItem>
                          <SelectItem value="Cold">Cold</SelectItem>
                          <SelectItem value="Freezer">Freezer</SelectItem>
                          <SelectItem value="Material">Material</SelectItem>
                          <SelectItem value="NA">NA</SelectItem>
                        </SelectContent>
                      </div>
                    </Select>
                  </template>
                  <template v-else>
                    <Badge variant="outline">
                      {{ component.storageType }}
                    </Badge>
                  </template>
                </TableCell>

                <!-- Unit Cost -->
                <TableCell>
                  <span class="font-medium">
                    €{{ (component.unitCost || 0).toFixed(2) }}
                  </span>
                </TableCell>

                <!-- Sub-Items -->
                <TableCell>
                  <div class="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      class="text-blue-600 hover:text-blue-700"
                      title="View sub-components"
                      @click="handleViewSubComponents(component)"
                    >
                      {{ component.subComponents.length }}
                      {{ ' item' + (component.subComponents.length !== 1 ? 's' : '') }}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      class="text-blue-600 hover:text-blue-700"
                      title="Edit in builder"
                      @click="onEditInBuilder(component)"
                    >
                      <Edit2 class="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>

                <!-- Actions -->
                <TableCell class="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    @click="onDelete(component.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- Sub-Components Dialog -->
    <Dialog
      v-if="showSubComponentsDialog && selectedComponent"
      :open="showSubComponentsDialog"
      :onOpenChange="val => (showSubComponentsDialog = val)"
    >
      <DialogContent
        class="max-w-4xl max-h-[85vh]"
        aria-describedby="sub-components-description"
      >
        <DialogHeader>
          <DialogTitle>
            Sub-Components: {{ selectedComponent.name }}
          </DialogTitle>
          <DialogDescription id="sub-components-description">
            View the ingredients and components that make up this component
          </DialogDescription>
        </DialogHeader>

        <div class="overflow-auto max-h-96">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Number of Units</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Cost (€)</TableHead>
                <TableHead>Storage Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-if="selectedComponent.subComponents.length === 0"
              >
                <TableCell
                  colSpan="7"
                  class="text-center py-8 text-gray-500"
                >
                  No sub-components
                </TableCell>
              </TableRow>
              <TableRow
                v-else
                v-for="sub in selectedComponent.subComponents"
                :key="sub.id"
              >
                <TableCell>{{ sub.name }}</TableCell>
                <TableCell>
                  <Badge :variant="sub.itemType === 'Component' ? 'default' : 'secondary'">
                    {{ sub.itemType }}
                  </Badge>
                </TableCell>
                <TableCell>{{ sub.category }}</TableCell>
                <TableCell>{{ (sub.numberOfUnits || 0).toFixed(3) }}</TableCell>
                <TableCell>{{ sub.unit }}</TableCell>
                <TableCell>€{{ (sub.cost || 0).toFixed(2) }}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {{ sub.storageType }}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            @click="showSubComponentsDialog = false"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script>
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import Button from '../ui/button.vue'
import Input from '../ui/input.vue'
import Table from '../ui/table.vue'
import TableBody from '../ui/tableBody.vue'
import TableCell from '../ui/tableCell.vue'
import TableHead from '../ui/tableHead.vue'
import TableHeader from '../ui/tableHeader.vue'
import TableRow from '../ui/tableRow.vue'
import Select from '../ui/select.vue'
import SelectContent from '../ui/selectContent.vue'
import SelectItem from '../ui/selectItem.vue'
import SelectTrigger from '../ui/selectTrigger.vue'
import SelectValue from '../ui/selectValue.vue'
import Dialog from '../ui/dialog.vue'
import DialogContent from '../ui/dialogContent.vue'
import DialogDescription from '../ui/dialogDescription.vue'
import DialogHeader from '../ui/dialogHeader.vue'
import DialogTitle from '../ui/dialogTitle.vue'
import DialogFooter from '../ui/dialogFooter.vue'
import Badge from '../ui/badge.vue'
import DropdownMenu from '../ui/dropdownMenu.vue'
import DropdownMenuContent from '../ui/dropdownMenuContent.vue'
import DropdownMenuItem from '../ui/dropdownMenuItem.vue'
import DropdownMenuLabel from '../ui/dropdownMenuLabel.vue'
import DropdownMenuSeparator from '../ui/dropdownMenuSeparator.vue'
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue'
import { Search, Plus, Trash2, Edit2, Download, Filter } from 'lucide-vue-next'
//import { toast } from 'sonner' // adapte au système de toast de ton projet

export default {
  name: 'ComponentsLibraryPanel',

  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Badge,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Search,
    Plus,
    Trash2,
    Edit2,
    Download,
    Filter,
  },

  props: {
    components: {
      type: Array,
      required: true,
    },
    ingredients: {
      type: Array,
      required: true,
    },
    onEdit: {
      type: Function,
      required: true,
    },
    onDelete: {
      type: Function,
      required: true,
    },
    onAddNew: {
      type: Function,
      required: true,
    },
    onEditInBuilder: {
      type: Function,
      required: true,
    },
    // équivalent de useIsMobile : soit tu passes cette prop depuis le parent,
    // soit tu remplaces par une détection via matchMedia comme pour NewMarketPriceView
    isMobile: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    return {
      searchQuery: '',
      filterCategory: 'all',
      filterComponentCategory: 'all',
      editingField: null, // { id, field } | null
      editValue: '',
      showSubComponentsDialog: false,
      selectedComponent: null,
    }
  },

  computed: {
    filteredComponents() {
      return this.components.filter(comp => {
        const matchesSearch =
          comp.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          (comp.description || '')
            .toLowerCase()
            .includes(this.searchQuery.toLowerCase())

        const matchesCategory =
          this.filterCategory === 'all' || comp.category === this.filterCategory

        const matchesComponentCategory =
          this.filterComponentCategory === 'all' ||
          comp.componentCategory === this.filterComponentCategory

        return matchesSearch && matchesCategory && matchesComponentCategory
      })
    },
  },

  methods: {
    handleCellClick(component, field) {
      this.editingField = { id: component.id, field }
      if (field === 'numberOfUnitsRecipe') {
        this.editValue = component[field].toString()
      } else {
        this.editValue = (component[field] || '').toString()
      }
    },

    handleCellBlur() {
      if (!this.editingField) return

      const component = this.components.find(
        c => c.id === this.editingField.id,
      )
      if (component) {
        let updatedValue = this.editValue

        if (this.editingField.field === 'numberOfUnitsRecipe') {
          updatedValue = parseFloat(this.editValue) || 0
        }

        const numberOfUnitsRecipe =
          this.editingField.field === 'numberOfUnitsRecipe'
            ? updatedValue
            : component.numberOfUnitsRecipe

        const updatedComponent = {
          ...component,
          [this.editingField.field]: updatedValue,
          unitCost: this.calculateUnitCost(component.subComponents, numberOfUnitsRecipe),
        }

        this.onEdit && this.onEdit(updatedComponent)
      }

      this.editingField = null
    },

    handleKeyDown(e) {
      if (e.key === 'Enter') {
        this.handleCellBlur()
      } else if (e.key === 'Escape') {
        this.editingField = null
      }
    },

    calculateUnitCost(subComponents, numberOfUnitsRecipe) {
      const totalCost = subComponents.reduce(
        (sum, sub) => sum + (sub.cost || 0),
        0,
      )
      return totalCost * numberOfUnitsRecipe
    },

    handleViewSubComponents(component) {
      this.selectedComponent = component
      this.showSubComponentsDialog = true
    },

    handleExportCSV() {
      if (!this.components.length) {
        toast.error?.('No data to export')
        return
      }

      const headers = [
        'Component Name',
        'Category',
        'Component Category',
        'Unit',
        'Number of Units Recipe',
        'Storage Type',
        'Unit Cost',
        'Description',
      ]

      const rows = this.components.map(comp => [
        comp.name,
        comp.category,
        comp.componentCategory,
        comp.unit,
        comp.numberOfUnitsRecipe.toFixed(3),
        comp.storageType,
        (comp.unitCost || 0).toFixed(2),
        comp.description || '',
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `components-${new Date().toISOString().split('T')[0]}.csv`,
      )
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success?.('CSV exported successfully')
    },
  },
}
</script>