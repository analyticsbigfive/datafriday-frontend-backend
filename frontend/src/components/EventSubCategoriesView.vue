<template>
  <div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Header with close button -->
    <div v-if="onClose" class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="onClose">
          <X class="w-5 h-5" />
        </Button>
        <h2 class="font-semibold">Event Subcategories</h2>
      </div>
      <Button @click="handleAddSubcategory" size="sm">
        <Plus class="w-4 h-4 mr-2" />
        Add Event Subcategory
      </Button>
    </div>

    <ScrollArea class="flex-1">
      <!-- Main content when no onClose prop -->
      <div v-if="!onClose" class="p-4">
        <Card>
          <CardHeader>
            <div :class="`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'}`">
              <CardTitle>Event Subcategories Library</CardTitle>
              <div class="flex gap-2">
                <!-- Export CSV Button -->
                <Button @click="handleExportCSV" :size="isMobile ? 'default' : 'default'" variant="outline">
                  <Download class="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <!-- Import CSV Button -->
                <Button @click="handleImportClick" :size="isMobile ? 'default' : 'default'" variant="outline">
                  <Upload class="w-4 h-4 mr-2" />
                  Import CSV
                </Button>
                <!-- Add Button -->
                <Button @click="handleAddSubcategory" :size="isMobile ? 'default' : 'default'">
                  <Plus class="w-4 h-4 mr-2" />
                  Add Event Subcategory
                </Button>
              </div>
            </div>

            <!-- Search and Filters -->
            <div class="flex items-center gap-3 mt-4">
              <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder="Search event subcategories..."
                  :value="searchQuery"
                  @input="searchQuery = $event.target.value"
                  class="pl-9"
                />
              </div>
              
              <!-- Mobile filters -->
              <DropdownMenu v-if="isMobile">
                <DropdownMenuTrigger as-child>
                  <Button variant="outline" size="icon">
                    <Filter class="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-56">
                  <DropdownMenuLabel>Event Type</DropdownMenuLabel>
                  <DropdownMenuItem @click="filterEventType = 'all'">
                    All Types
                  </DropdownMenuItem>
                  <DropdownMenuItem v-for="type in eventTypes" :key="type.id" @click="filterEventType = type.id">
                    {{ type.name }}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuLabel>Event Category</DropdownMenuLabel>
                  <DropdownMenuItem @click="filterEventCategory = 'all'">
                    All Categories
                  </DropdownMenuItem>
                  <DropdownMenuItem v-for="category in getFilteredCategories()" :key="category.id" @click="filterEventCategory = category.id">
                    {{ category.name }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <!-- Desktop filters -->
              <template v-else>
                <Select :value="filterEventType" @value-change="filterEventType = $event">
                  <SelectTrigger class="w-40">
                    <SelectValue placeholder="Event Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem v-for="type in eventTypes" :key="type.id" :value="type.id">{{ type.name }}</SelectItem>
                  </SelectContent>
                </Select>
                <Select :value="filterEventCategory" @value-change="filterEventCategory = $event">
                  <SelectTrigger class="w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem v-for="category in getFilteredCategories()" :key="category.id" :value="category.id">{{ category.name }}</SelectItem>
                  </SelectContent>
                </Select>
              </template>
            </div>

            <!-- Helper text -->
            <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {{ filteredSubcategories.length }} subcategor{{ filteredSubcategories.length !== 1 ? 'ies' : 'y' }}
              </span>
            </div>
          </CardHeader>

          <CardContent>
            <div class="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-10">
                  <tr>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Name</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Event Category</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Event Type</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="subcategory in filteredSubcategories" :key="subcategory.id" class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-4 py-3 dark:text-gray-200">{{ subcategory.name }}</td>
                    <td class="px-4 py-3 dark:text-gray-200">{{ getCategoryName(subcategory.eventCategoryId) }}</td>
                    <td class="px-4 py-3 dark:text-gray-200">{{ getEventTypeName(subcategory.eventCategoryId) }}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="handleEditSubcategory(subcategory)"
                        >
                          <Pencil class="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="handleDeleteSubcategory(subcategory.id)"
                        >
                          <Trash2 class="w-4 h-4 text-red-500 dark:text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredSubcategories.length === 0">
                    <td colspan="4" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No event subcategories yet. Click "Add Event Subcategory" to create your first subcategory.
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
      @change="handleFileUpload"
      class="hidden"
    />

    <!-- Add/Edit Dialog -->
    <Dialog :open="showDialog" @open-change="showDialog = $event">
      <DialogContent aria-describedby="event-subcategory-form-description">
        <DialogHeader>
          <DialogTitle>{{ editingSubcategory?.name ? 'Edit Event Subcategory' : 'Add Event Subcategory' }}</DialogTitle>
          <DialogDescription id="event-subcategory-form-description">
            Form to create or edit an event subcategory
          </DialogDescription>
        </DialogHeader>

        <div v-if="editingSubcategory" class="space-y-4">
          <div>
            <Label>Subcategory Name</Label>
            <Input
              :value="editingSubcategory.name"
              @input="editingSubcategory.name = $event.target.value"
              placeholder="Enter subcategory name"
            />
          </div>

          <div>
            <Label>Event Category</Label>
            <select
              :value="editingSubcategory.eventCategoryId"
              @change="editingSubcategory.eventCategoryId = $event.target.value"
              class="w-full px-3 py-2 border rounded-md"
            >
              <option value="">Select Event Category</option>
              <option v-for="category in eventCategories" :key="category.id" :value="category.id">{{ category.name }}</option>
            </select>
          </div>

          <div class="flex gap-2 pt-4">
            <Button @click="handleSaveSubcategory">Save</Button>
            <Button variant="outline" @click="showDialog = false">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- CSV Import Dialog -->
    <CSVMappingDialog
      v-if="showImportDialog"
      :open="showImportDialog"
      @open-change="showDialog = $event"
      :csvHeaders="csvHeaders"
      :targetColumns="[
        { key: 'name', label: 'Name', required: true },
        { key: 'eventCategory', label: 'Event Category', required: true },
        { key: 'eventType', label: 'Event Type', required: false }
      ]"
      @confirm="handleImportConfirm"
      @cancel="handleImportCancel"
    />
  </div>
</template>
<script>
import Button from '../ui/button.vue';
import Input from '../ui/input.vue';
import ScrollArea from '../ui/scrollArea.vue';
import Dialog from '../ui/dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import Label from '../ui/label.vue';
import Card from '../ui/card.vue';
import CardContent from '../ui/cardContent.vue';
import CardHeader from '../ui/cardHeader.vue';
import CardTitle from '../ui/cardTitle.vue';
import Select from '../ui/select.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';
import DropdownMenu from '../ui/dropdownMenu.vue';
import DropdownMenuContent from '../ui/dropdownMenuContent.vue';
import DropdownMenuItem from '../ui/dropdownMenuItem.vue';
import DropdownMenuLabel from '../ui/dropdownMenuLabel.vue';
import DropdownMenuSeparator from '../ui/dropdownMenuSeparator.vue';
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue';
import CSVMappingDialog from './CSVMappingDialog.vue';
import { Plus, Trash2, X, Pencil, Search, Filter, Download, Upload } from 'lucide-vue-next';
import * as eventApi from '../utils/eventApi.js';
//import { toast } from 'sonner';
export default {
  name: 'EventSubcategoriesView',
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    CSVMappingDialog,
    Plus,
    Trash2,
    X,
    Pencil,
    Search,
    Filter,
    Download,
    Upload
  },
  props: {
    onClose: {
      type: Function,
      default: null
    }
  },
  data() {
    return {
      eventSubcategories: [],
      eventCategories: [],
      eventTypes: [],
      editingSubcategory: null,
      showDialog: false,
      searchQuery: '',
      filterEventCategory: 'all',
      filterEventType: 'all',
      fileInputRef: null,
      showImportDialog: false,
      csvHeaders: [],
      csvData: [],
      importFile: null,
      isMobile: false
    };
  },
  computed: {
    filteredSubcategories() {
      return this.eventSubcategories.filter(subcategory => {
        // Search filter
        if (this.searchQuery.trim()) {
          const query = this.searchQuery.toLowerCase();
          const subcategoryName = subcategory.name.toLowerCase();
          const categoryName = this.getCategoryName(subcategory.eventCategoryId).toLowerCase();
          const typeName = this.getEventTypeName(subcategory.eventCategoryId).toLowerCase();
          
          const matchesSearch = (
            subcategoryName.includes(query) ||
            categoryName.includes(query) ||
            typeName.includes(query)
          );
          
          if (!matchesSearch) return false;
        }
        
        // Event Category filter
        if (this.filterEventCategory !== 'all' && subcategory.eventCategoryId !== this.filterEventCategory) {
          return false;
        }
        
        // Event Type filter
        if (this.filterEventType !== 'all') {
          const typeId = this.getEventTypeId(subcategory.eventCategoryId);
          if (typeId !== this.filterEventType) return false;
        }
        
        return true;
      });
    }
  },
  mounted() {
    this.updateMobileStatus();
    window.addEventListener('resize', this.updateMobileStatus);
    this.loadData();
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateMobileStatus);
  },
  methods: {
    updateMobileStatus() {
      this.isMobile = window.innerWidth < 768;
    },
    async loadData() {
      try {
        const [subcategories, categories, types] = await Promise.all([
          eventApi.getEventSubcategories(),
          eventApi.getEventCategories(),
          eventApi.getEventTypes(),
        ]);
        this.eventSubcategories = subcategories;
        this.eventCategories = categories;
        this.eventTypes = types;
      } catch (error) {
        console.error('Failed to load event subcategories:', error);
      }
    },
    handleAddSubcategory() {
      this.editingSubcategory = { 
        id: crypto.randomUUID(), 
        name: '', 
        eventCategoryId: ''
      };
      this.showDialog = true;
    },
    handleEditSubcategory(subcategory) {
      this.editingSubcategory = subcategory;
      this.showDialog = true;
    },
    async handleSaveSubcategory() {
      if (!this.editingSubcategory || !this.editingSubcategory.name.trim() || !this.editingSubcategory.eventCategoryId) return;
      try {
        const existingIndex = this.eventSubcategories.findIndex(s => s.id === this.editingSubcategory.id);
        if (existingIndex >= 0) {
          await eventApi.updateEventSubcategory(this.editingSubcategory);
          this.eventSubcategories[existingIndex] = this.editingSubcategory;
        } else {
          await eventApi.createEventSubcategory(this.editingSubcategory);
          this.eventSubcategories.push(this.editingSubcategory);
        }
        this.showDialog = false;
        this.editingSubcategory = null;
      } catch (error) {
        console.error('Failed to save event subcategory:', error);
      }
    },
    async handleDeleteSubcategory(subcategoryId) {
      try {
        await eventApi.deleteEventSubcategory(subcategoryId);
        this.eventSubcategories = this.eventSubcategories.filter(s => s.id !== subcategoryId);
        toast.success('Subcategory deleted successfully');
      } catch (error) {
        console.error('Failed to delete event subcategory:', error);
        toast.error(`Failed to delete subcategory: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
    getCategoryName(categoryId) {
      return this.eventCategories.find(c => c.id === categoryId)?.name || '';
    },
    getEventTypeName(categoryId) {
      const category = this.eventCategories.find(c => c.id === categoryId);
      if (!category) return '';
      return this.eventTypes.find(t => t.id === category.eventTypeId)?.name || '';
    },
    getEventTypeId(categoryId) {
      const category = this.eventCategories.find(c => c.id === categoryId);
      return category?.eventTypeId || '';
    },
    // Get filtered categories based on selected type
    getFilteredCategories() {
      if (this.filterEventType === 'all') {
        return this.eventCategories;
      }
      return this.eventCategories.filter(cat => cat.eventTypeId === this.filterEventType);
    },
    // Export event subcategories to CSV
    handleExportCSV() {
      if (this.eventSubcategories.length === 0) {
        toast.error('No event subcategories to export');
        return;
      }
      const headers = ['Name', 'Event Category', 'Event Type'];
      const rows = this.eventSubcategories.map(subcategory => [
        subcategory.name,
        this.getCategoryName(subcategory.eventCategoryId),
        this.getEventTypeName(subcategory.eventCategoryId)
      ]);
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `event_subcategories_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast.success('Event subcategories exported successfully');
    },
    // Handle file selection for import
    handleImportClick() {
      this.fileInputRef?.click();
    },
    // Parse CSV file (support both comma and semicolon separators)
    parseCSV(text) {
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) return { headers: [], rows: [] };
      // Detect separator (comma or semicolon)
      const firstLine = lines[0];
      const separator = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
      // Parse headers
      const headers = lines[0].split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
      // Parse rows
      const rows = lines.slice(1).map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === separator && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        return values.map(v => v.replace(/^"|"$/g, ''));
      });
      return { headers, rows };
    },
    // Handle file upload
    handleFileUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        const { headers, rows } = this.parseCSV(text);
        if (headers.length === 0 || rows.length === 0) {
          toast.error('Invalid CSV file');
          return;
        }
        this.importFile = file;
        this.csvHeaders = headers;
        this.csvData = rows;
        this.showImportDialog = true;
      };
      reader.readAsText(file);
      // Reset input
      e.target.value = '';
    },
    // Handle CSV mapping confirmation
    async handleImportConfirm(mapping) {
      try {
        let importedCount = 0;
        let duplicateCount = 0;
        for (const row of this.csvData) {
          const rowData = {};
          // Map CSV columns to event subcategory fields
          Object.entries(mapping).forEach(([targetField, csvColumn]) => {
            if (csvColumn && csvColumn !== '') {
              const columnIndex = this.csvHeaders.indexOf(csvColumn);
              if (columnIndex !== -1) {
                rowData[targetField] = row[columnIndex];
              }
            }
          });
          // Skip if name is missing
          if (!rowData.name || !rowData.name.trim()) {
            continue;
          }
          // Find or create event type
          let eventType = this.eventTypes.find(t => 
            t.name.toLowerCase().trim() === rowData.eventType?.trim().toLowerCase()
          );
          if (!eventType && rowData.eventType) {
            // Create new event type
            eventType = {
              id: crypto.randomUUID(),
              name: rowData.eventType.trim()
            };
            await eventApi.createEventType(eventType);
            this.eventTypes.push(eventType);
          }
          if (!eventType) continue;
          // Find or create event category
          let eventCategory = this.eventCategories.find(c => 
            c.name.toLowerCase().trim() === rowData.eventCategory?.trim().toLowerCase() &&
            c.eventTypeId === eventType.id
          );
          if (!eventCategory && rowData.eventCategory) {
            // Create new event category
            eventCategory = {
              id: crypto.randomUUID(),
              name: rowData.eventCategory.trim(),
              eventTypeId: eventType.id
            };
            await eventApi.createEventCategory(eventCategory);
            this.eventCategories.push(eventCategory);
          }
          if (!eventCategory) continue;
          // Check for duplicates
          const existingSubcategory = this.eventSubcategories.find(s => 
            s.name.toLowerCase().trim() === rowData.name.trim().toLowerCase() &&
            s.eventCategoryId === eventCategory.id
          );
          if (existingSubcategory) {
            duplicateCount++;
            continue;
          }
          // Create new event subcategory
          const newSubcategory = {
            id: crypto.randomUUID(),
            name: rowData.name.trim(),
            eventCategoryId: eventCategory.id
          };
          await eventApi.createEventSubcategory(newSubcategory);
          this.eventSubcategories.push(newSubcategory);
          importedCount++;
        }
        this.showImportDialog = false;
        this.importFile = null;
        this.csvHeaders = [];
        this.csvData = [];
        if (importedCount > 0) {
          toast.success(`Successfully imported ${importedCount} event subcategor${importedCount !== 1 ? 'ies' : 'y'}${duplicateCount > 0 ? ` (${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped)` : ''}`);
        } else if (duplicateCount > 0) {
          toast.warning(`All ${duplicateCount} event subcategor${duplicateCount !== 1 ? 'ies were' : 'y was'} duplicate${duplicateCount !== 1 ? 's' : ''}`);
        } else {
          toast.error('No valid event subcategories found in CSV');
        }
        await this.loadData();
      } catch (error) {
        console.error('Failed to import event subcategories:', error);
        toast.error('Failed to import event subcategories');
      }
    },
    handleImportCancel() {
      this.showImportDialog = false;
      this.importFile = null;
      this.csvHeaders = [];
      this.csvData = [];
    }
  }
};
</script>