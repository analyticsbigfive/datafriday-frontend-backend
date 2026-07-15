<template>
  <div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Top bar si onClose -->
    <div
      v-if="onClose"
      class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between"
    >
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="onClose">
          <X class="w-5 h-5" />
        </Button>
        <h2 class="font-semibold">Event Types</h2>
      </div>

      <Button size="sm" @click="handleAddType">
        <Plus class="w-4 h-4 mr-2" />
        Add Event Type
      </Button>
    </div>

    <ScrollArea class="flex-1">
      <div v-if="!onClose" class="p-4">
        <Card>
          <CardHeader>
            <div :class="`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'}`">
              <CardTitle>Event Types Library</CardTitle>

              <div class="flex gap-2 flex-wrap">
                <!-- Clean Up Orphans -->
                <Button
                  v-if="orphanedCount > 0"
                  variant="outline"
                  class="text-orange-600 dark:text-orange-400 border-orange-600 dark:border-orange-400"
                  @click="handleCleanUpOrphans"
                >
                  <AlertTriangle class="w-4 h-4 mr-2" />
                  Clean Up {{ orphanedCount }} Orphan{{ orphanedCount !== 1 ? 's' : '' }}
                </Button>

                <!-- Export -->
                <Button variant="outline" @click="handleExportCSV">
                  <Download class="w-4 h-4 mr-2" />
                  Export CSV
                </Button>

                <!-- Import -->
                <Button variant="outline" @click="handleImportClick">
                  <Upload class="w-4 h-4 mr-2" />
                  Import CSV
                </Button>

                <!-- Add -->
                <Button @click="handleAddType">
                  <Plus class="w-4 h-4 mr-2" />
                  Add Event Type
                </Button>
              </div>
            </div>

            <!-- Search -->
            <div class="flex items-center gap-3 mt-4">
              <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  class="pl-9"
                  placeholder="Search event types..."
                  :value="searchQuery"
                  @input="onSearchInput"
                />
              </div>
            </div>

            <!-- Helper text -->
            <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {{ filteredTypes.length }} type{{ filteredTypes.length !== 1 ? 's' : '' }}
                <span
                  v-if="orphanedCount > 0"
                  class="ml-2 text-orange-600 dark:text-orange-400"
                >
                  - {{ orphanedCount }} orphaned (not used by any categories or events)
                </span>
              </span>
            </div>
          </CardHeader>

          <CardContent>
            <div class="max-h-[500px] overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-10">
                  <tr>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Name</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Categories</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Events</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Status</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  <tr
                    v-for="type in filteredTypes"
                    :key="type.id"
                    class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td class="px-4 py-3 dark:text-gray-200">{{ type.name }}</td>

                    <td class="px-4 py-3 dark:text-gray-200">
                      {{ getTypeUsageInfo(type.id) ? getTypeUsageInfo(type.id).categoryCount : '-' }}
                    </td>

                    <td class="px-4 py-3 dark:text-gray-200">
                      {{ getTypeUsageInfo(type.id) ? getTypeUsageInfo(type.id).eventCount : '-' }}
                    </td>

                    <td class="px-4 py-3">
                      <span
                        v-if="getTypeUsageInfo(type.id)?.isOrphaned"
                        class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                      >
                        <AlertTriangle class="w-3 h-3" />
                        Orphaned
                      </span>

                      <span
                        v-else
                        class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                      >
                        Active
                      </span>
                    </td>

                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="View details"
                          @click="handleShowTypeInfo(type.id)"
                        >
                          <Info class="w-4 h-4" />
                        </Button>

                        <Button variant="ghost" size="sm" @click="handleEditType(type)">
                          <Pencil class="w-4 h-4" />
                        </Button>

                        <Button variant="ghost" size="sm" @click="handleDeleteType(type.id)">
                          <Trash2 class="w-4 h-4 text-red-500 dark:text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>

                  <tr v-if="filteredTypes.length === 0">
                    <td colspan="5" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No event types yet. Click "Add Event Type" to create your first type.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".csv"
      class="hidden"
      @change="handleFileUpload"
    />

    <!-- Add/Edit Dialog -->
    <Dialog :open="showDialog" @openChange="setShowDialog">
      <DialogContent aria-describedby="event-type-form-description">
        <DialogHeader>
          <DialogTitle>{{ editingType?.name ? 'Edit Event Type' : 'Add Event Type' }}</DialogTitle>
          <DialogDescription id="event-type-form-description">
            Form to create or edit an event type
          </DialogDescription>
        </DialogHeader>

        <div v-if="editingType" class="space-y-4">
          <div>
            <Label>Type Name</Label>
            <Input
              placeholder="Enter type name"
              :value="editingType.name"
              @input="onEditTypeNameInput"
            />
          </div>

          <div class="flex gap-2 pt-4">
            <Button @click="handleSaveType">Save</Button>
            <Button variant="outline" @click="setShowDialog(false)">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Diagnostic Info Dialog -->
    <Dialog :open="showDiagnosticDialog" @openChange="setShowDiagnosticDialog">
      <DialogContent aria-describedby="event-type-info-description">
        <DialogHeader>
          <DialogTitle>Event Type Details: {{ selectedTypeForInfo?.name }}</DialogTitle>
          <DialogDescription id="event-type-info-description">
            Information about this event type's usage
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedTypeForInfo" class="space-y-4">
          <div>
            <Label>Status</Label>
            <div class="mt-2">
              <div
                v-if="selectedTypeForInfo.isOrphaned"
                class="flex items-center gap-2 text-orange-600 dark:text-orange-400"
              >
                <AlertTriangle class="w-5 h-5" />
                <span>This event type is orphaned (not used by any categories or events)</span>
              </div>

              <div
                v-else
                class="flex items-center gap-2 text-green-600 dark:text-green-400"
              >
                <Info class="w-5 h-5" />
                <span>This event type is actively being used</span>
              </div>
            </div>
          </div>

          <div>
            <Label>Categories ({{ selectedTypeForInfo.categoryCount }})</Label>
            <div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <ul
                v-if="selectedTypeForInfo.categories && selectedTypeForInfo.categories.length > 0"
                class="list-disc list-inside space-y-1"
              >
                <li v-for="(cat, idx) in selectedTypeForInfo.categories" :key="idx">
                  {{ cat }}
                </li>
              </ul>

              <p v-else class="text-gray-500 dark:text-gray-500">
                No categories linked to this type
              </p>
            </div>
          </div>

          <div>
            <Label>Events</Label>
            <div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <p>
                {{ selectedTypeForInfo.eventCount }} event{{ selectedTypeForInfo.eventCount !== 1 ? 's' : '' }}
                using this type
              </p>
            </div>
          </div>

          <div class="flex gap-2 pt-4">
            <Button @click="setShowDiagnosticDialog(false)">Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- CSV Import Dialog -->
    <CSVMappingDialog
      v-if="showImportDialog"
      :open="showImportDialog"
      :onOpenChange="setShowImportDialog"
      :csvHeaders="csvHeaders"
      :targetColumns="[{ key: 'name', label: 'Name', required: true }]"
      :onConfirm="handleImportConfirm"
      :onCancel="handleImportCancel"
    />
  </div>
</template>

<script>
import Button from '../ui/button.vue'
import Input  from '../ui/input.vue'
import ScrollArea from '../ui/scrollArea.vue'
import Label from '../ui/label.vue'
import Dialog from '../ui/dialog.vue'
import DialogContent from '../ui/dialogContent.vue'
import DialogHeader from '../ui/dialogHeader.vue'
import DialogTitle from '../ui/dialogTitle.vue'
import DialogDescription from '../ui/dialogDescription.vue'
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import { Plus, Trash2, X, Pencil, Search, Download, Upload, AlertTriangle, Info } from 'lucide-vue-next'
import * as eventApi from '../utils/eventApi.js'
import CSVMappingDialog  from './CSVMappingDialog.vue'
//import { toast } from 'sonner'
import { analyzeEventTypes, deleteOrphanedEventTypes } from '../utils/eventTypeDiagnostics.js'

export default {
  name: 'EventTypesView',

  components: {
    Button,
    Input,
    ScrollArea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    Label,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CSVMappingDialog,

    Plus,
    Trash2,
    X,
    Pencil,
    Search,
    Download,
    Upload,
    AlertTriangle,
    Info,
  },

  props: {
    onClose: { type: Function, required: false },
  },

  data() {
    return {
      eventTypes: [],
      editingType: null,
      showDialog: false,
      searchQuery: '',

      // mobile detection (simple)
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,

      // diagnostics
      typeUsage: [],
      showDiagnosticDialog: false,
      selectedTypeForInfo: null,

      // CSV import
      showImportDialog: false,
      csvHeaders: [],
      csvData: [],
      importFile: null,
    }
  },

  computed: {
    isMobile() {
      return this.windowWidth < 768
    },

    filteredTypes() {
      if (!this.searchQuery.trim()) return this.eventTypes
      const q = this.searchQuery.toLowerCase()
      return this.eventTypes.filter((t) => (t.name || '').toLowerCase().includes(q))
    },

    orphanedCount() {
      return (this.typeUsage || []).filter((u) => u.isOrphaned).length
    },
  },

  mounted() {
    this.loadEventTypes()
    this.loadTypeUsage()

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize)
    }
  },

  beforeUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize)
    }
  },

  methods: {
    onResize() {
      this.windowWidth = window.innerWidth
    },

    async loadEventTypes() {
      try {
        const types = await eventApi.getEventTypes()
        this.eventTypes = types
      } catch (error) {
        console.error('Failed to load event types:', error)
      }
    },

    async loadTypeUsage() {
      try {
        const usage = await analyzeEventTypes()
        this.typeUsage = usage
      } catch (error) {
        console.error('Failed to analyze event types:', error)
      }
    },

    onSearchInput(e) {
      this.searchQuery = e.target.value
    },

    handleAddType() {
      this.editingType = { id: crypto.randomUUID(), name: '' }
      this.showDialog = true
    },

    handleEditType(type) {
      this.editingType = type
      this.showDialog = true
    },

    onEditTypeNameInput(e) {
      if (!this.editingType) return
      this.editingType = { ...this.editingType, name: e.target.value }
    },

    async handleSaveType() {
      if (!this.editingType || !this.editingType.name.trim()) return

      try {
        const existingIndex = this.eventTypes.findIndex((t) => t.id === this.editingType.id)
        if (existingIndex >= 0) {
          await eventApi.updateEventType(this.editingType)
          const newTypes = [...this.eventTypes]
          newTypes[existingIndex] = this.editingType
          this.eventTypes = newTypes
        } else {
          await eventApi.createEventType(this.editingType)
          this.eventTypes = [...this.eventTypes, this.editingType]
        }

        this.showDialog = false
        this.editingType = null
        await this.loadTypeUsage()
      } catch (error) {
        console.error('Failed to save event type:', error)
      }
    },

    async handleDeleteType(typeId) {
      try {
        await eventApi.deleteEventType(typeId)
        this.eventTypes = this.eventTypes.filter((t) => t.id !== typeId)
        await this.loadTypeUsage()
      } catch (error) {
        console.error('Failed to delete event type:', error)
      }
    },

    async handleCleanUpOrphans() {
      try {
        const result = await deleteOrphanedEventTypes()

        if (result.deleted > 0) {
          toast.success(`Deleted ${result.deleted} orphaned event type${result.deleted !== 1 ? 's' : ''}`)
          await this.loadEventTypes()
          await this.loadTypeUsage()
        } else {
          toast.info('No orphaned event types found')
        }

        if (result.errors > 0) {
          toast.error(`Failed to delete ${result.errors} event type${result.errors !== 1 ? 's' : ''}`)
        }
      } catch (error) {
        console.error('Failed to clean up orphaned types:', error)
        toast.error('Failed to clean up orphaned types')
      }
    },

    handleShowTypeInfo(typeId) {
      const usage = (this.typeUsage || []).find((u) => u.id === typeId)
      if (usage) {
        this.selectedTypeForInfo = usage
        this.showDiagnosticDialog = true
      }
    },

    getTypeUsageInfo(typeId) {
      return (this.typeUsage || []).find((u) => u.id === typeId)
    },

    // --- CSV export/import ---
    handleExportCSV() {
      if (this.eventTypes.length === 0) {
        toast.error('No event types to export')
        return
      }

      const headers = ['Name']
      const rows = this.eventTypes.map((t) => [t.name])

      const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `event_types_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      toast.success('Event types exported successfully')
    },

    handleImportClick() {
      this.$refs.fileInputRef?.click()
    },

    parseCSV(text) {
      const lines = text.split('\n').filter((line) => line.trim())
      if (lines.length === 0) return { headers: [], rows: [] }

      const firstLine = lines[0]
      const separator = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','

      const headers = lines[0].split(separator).map((h) => h.trim().replace(/^"|"$/g, ''))

      const rows = lines.slice(1).map((line) => {
        const values = []
        let current = ''
        let inQuotes = false

        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') inQuotes = !inQuotes
          else if (char === separator && !inQuotes) {
            values.push(current.trim())
            current = ''
          } else current += char
        }
        values.push(current.trim())
        return values.map((v) => v.replace(/^"|"$/g, ''))
      })

      return { headers, rows }
    },

    handleFileUpload(e) {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        const text = String(event.target?.result || '')
        const { headers, rows } = this.parseCSV(text)

        if (headers.length === 0 || rows.length === 0) {
          toast.error('Invalid CSV file')
          return
        }

        this.importFile = file
        this.csvHeaders = headers
        this.csvData = rows
        this.showImportDialog = true
      }
      reader.readAsText(file)

      e.target.value = ''
    },

    async handleImportConfirm(mapping) {
      try {
        let importedCount = 0
        let duplicateCount = 0

        for (const row of this.csvData) {
          const rowData = {}

          Object.entries(mapping || {}).forEach(([targetField, csvColumn]) => {
            if (!csvColumn) return
            const columnIndex = this.csvHeaders.indexOf(csvColumn)
            if (columnIndex !== -1) rowData[targetField] = row[columnIndex]
          })

          if (!rowData.name || !String(rowData.name).trim()) continue

          const existingType = this.eventTypes.find(
            (t) => (t.name || '').toLowerCase().trim() === String(rowData.name).trim().toLowerCase()
          )

          if (existingType) {
            duplicateCount++
            continue
          }

          const newType = { id: crypto.randomUUID(), name: String(rowData.name).trim() }
          await eventApi.createEventType(newType)
          this.eventTypes = [...this.eventTypes, newType]
          importedCount++
        }

        this.showImportDialog = false
        this.importFile = null
        this.csvHeaders = []
        this.csvData = []

        if (importedCount > 0) {
          toast.success(
            `Successfully imported ${importedCount} event type${importedCount !== 1 ? 's' : ''}` +
              (duplicateCount > 0
                ? ` (${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped)`
                : '')
          )
        } else if (duplicateCount > 0) {
          toast.warning(
            `All ${duplicateCount} event type${duplicateCount !== 1 ? 's were' : ' was'} duplicate${duplicateCount !== 1 ? 's' : ''}`
          )
        } else {
          toast.error('No valid event types found in CSV')
        }

        await this.loadEventTypes()
        await this.loadTypeUsage()
      } catch (error) {
        console.error('Failed to import event types:', error)
        toast.error('Failed to import event types')
      }
    },

    handleImportCancel() {
      this.showImportDialog = false
      this.importFile = null
      this.csvHeaders = []
      this.csvData = []
    },

    // --- Dialog setters ---
    setShowDialog(open) {
      this.showDialog = open
      if (!open) this.editingType = null
    },

    setShowDiagnosticDialog(open) {
      this.showDiagnosticDialog = open
      if (!open) this.selectedTypeForInfo = null
    },

    setShowImportDialog(open) {
      this.showImportDialog = open
      if (!open) {
        this.importFile = null
        this.csvHeaders = []
        this.csvData = []
      }
    },
  },
}
</script>