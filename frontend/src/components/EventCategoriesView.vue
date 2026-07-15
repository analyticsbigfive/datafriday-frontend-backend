<template>
  <div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Header with close button -->
    <div v-if="onClose" class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="onClose">
          <X class="w-5 h-5" />
        </Button>
        <h2 class="font-semibold">Event Categories</h2>
      </div>
      <Button @click="handleAddCategory" size="sm">
        <Plus class="w-4 h-4 mr-2" />
        Add Event Category
      </Button>
    </div>

    <ScrollArea class="flex-1">
      <!-- Main content when no onClose prop -->
      <div v-if="!onClose" class="p-4">
        <Card>
          <CardHeader>
            <div :class="`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'}`">
              <CardTitle>Event Categories Library</CardTitle>
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
                <Button @click="handleAddCategory" :size="isMobile ? 'default' : 'default'">
                  <Plus class="w-4 h-4 mr-2" />
                  Add Event Category
                </Button>
              </div>
            </div>

            <!-- Search and Filters -->
            <div class="flex items-center gap-3 mt-4">
              <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder="Search event categories..."
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
                  
                  <DropdownMenuLabel>Has Home Team</DropdownMenuLabel>
                  <DropdownMenuItem @click="filterHasHomeTeam = 'all'">
                    All
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="filterHasHomeTeam = 'yes'">
                    Yes
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="filterHasHomeTeam = 'no'">
                    No
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
                <Select :value="filterHasHomeTeam" @value-change="filterHasHomeTeam = $event">
                  <SelectTrigger class="w-40">
                    <SelectValue placeholder="Has Home Team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </template>
            </div>

            <!-- Helper text -->
            <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {{ filteredCategories.length }} categor{{ filteredCategories.length !== 1 ? 'ies' : 'y' }}
              </span>
            </div>
          </CardHeader>

          <CardContent>
            <div class="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0">
                  <tr>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Name</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Event Type</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Has Home Team</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="category in filteredCategories" :key="category.id" class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-4 py-3 dark:text-gray-200">{{ category.name }}</td>
                    <td class="px-4 py-3 dark:text-gray-200">{{ getEventTypeName(category.eventTypeId) }}</td>
                    <td class="px-4 py-3 dark:text-gray-200">{{ category.hasHomeTeam ? 'Yes' : 'No' }}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="handleEditCategory(category)"
                        >
                          <Pencil class="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="handleDeleteCategory(category.id)"
                        >
                          <Trash2 class="w-4 h-4 text-red-500 dark:text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredCategories.length === 0">
                    <td colspan="4" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No event categories yet. Click "Add Event Category" to create your first category.
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
      <DialogContent aria-describedby="event-category-form-description">
        <DialogHeader>
          <DialogTitle>{{ editingCategory?.name ? 'Edit Event Category' : 'Add Event Category' }}</DialogTitle>
          <DialogDescription id="event-category-form-description">
            Form to create or edit an event category
          </DialogDescription>
        </DialogHeader>

        <div v-if="editingCategory" class="space-y-4">
          <div>
            <Label>Category Name</Label>
            <Input
              :value="editingCategory.name"
              @input="editingCategory.name = $event.target.value"
              placeholder="Enter category name"
            />
          </div>

          <div>
            <Label>Event Type</Label>
            <select
              :value="editingCategory.eventTypeId"
              @change="editingCategory.eventTypeId = $event.target.value"
              class="w-full px-3 py-2 border rounded-md"
            >
              <option value="">Select Event Type</option>
              <option v-for="type in eventTypes" :key="type.id" :value="type.id">{{ type.name }}</option>
            </select>
          </div>

          <div class="flex items-center space-x-2">
            <Checkbox
              id="hasHomeTeam"
              :checked="editingCategory.hasHomeTeam || false"
              @checked-change="editingCategory.hasHomeTeam = $event"
            />
            <Label for="hasHomeTeam">Has Home Team</Label>
          </div>

          <div class="flex gap-2 pt-4">
            <Button @click="handleSaveCategory">Save</Button>
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
        { key: 'eventType', label: 'Event Type', required: true },
        { key: 'hasHomeTeam', label: 'Has Home Team', required: false }
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
import Checkbox from '../ui/checkbox.vue';
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
import useIsMobile  from '../ui/useMobile.js';
import * as eventApi from '../utils/eventApi.js';
//import { toast } from 'sonner';

export default {
  name: 'EventCategoriesView',
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
    Checkbox,
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
      eventCategories: [],
      eventTypes: [],
      editingCategory: null,
      showDialog: false,
      searchQuery: '',
      filterEventType: 'all',
      filterHasHomeTeam: 'all',
      fileInputRef: null,
      showImportDialog: false,
      csvHeaders: [],
      csvData: [],
      importFile: null,
      isMobile: false
    };
  },
  computed: {
    filteredCategories() {
      return this.eventCategories.filter(category => {
        // Search filter
        if (this.searchQuery.trim()) {
          const query = this.searchQuery.toLowerCase();
          const categoryName = category.name.toLowerCase();
          const typeName = this.getEventTypeName(category.eventTypeId).toLowerCase();
          const hasHomeTeam = category.hasHomeTeam ? 'yes' : 'no';
          
          const matchesSearch = (
            categoryName.includes(query) ||
            typeName.includes(query) ||
            hasHomeTeam.includes(query)
          );
          
          if (!matchesSearch) return false;
        }
        
        // Event Type filter
        if (this.filterEventType !== 'all' && category.eventTypeId !== this.filterEventType) {
          return false;
        }
        
        // Has Home Team filter
        if (this.filterHasHomeTeam !== 'all') {
          const hasHomeTeam = category.hasHomeTeam || false;
          if (this.filterHasHomeTeam === 'yes' && !hasHomeTeam) return false;
          if (this.filterHasHomeTeam === 'no' && hasHomeTeam) return false;
        }
        
        return true;
      });
    }
  },
  mounted() {
    //this.isMobile = useIsMobile;
    this.loadData();
  },
  methods: {
    async loadData() {
      try {
        const [categories, types, events] = await Promise.all([
          eventApi.getEventCategories(),
          eventApi.getEventTypes(),
          eventApi.getAllEvents(),
        ]);
        
        // Detect and remove duplicates
        const cleanedCategories = await this.removeDuplicateCategories(categories, events);
        
        this.eventCategories = cleanedCategories;
        this.eventTypes = types;
      } catch (error) {
        console.error('Failed to load event categories:', error);
      }
    },

    // Function to detect and remove duplicate categories
    async removeDuplicateCategories(categories, events) {
      // Get all category IDs that are referenced by events
      const referencedCategoryIds = new Set(
        events.map(event => event.eventCategoryId).filter(Boolean)
      );

      console.log('Referenced category IDs:', Array.from(referencedCategoryIds));

      // Group categories by name + eventTypeId to find duplicates
      const categoryGroups = new Map();
      
      categories.forEach(category => {
        const key = `${category.name.toLowerCase()}|${category.eventTypeId}`;
        if (!categoryGroups.has(key)) {
          categoryGroups.set(key, []);
        }
        categoryGroups.get(key).push(category);
      });

      // Process each group to keep only one category
      const categoriesToKeep = [];
      const categoriesToDelete = [];

      for (const [key, group] of categoryGroups.entries()) {
        if (group.length === 1) {
          // No duplicates, keep this category
          categoriesToKeep.push(group[0]);
        } else {
          // Duplicates found
          console.log(`Found ${group.length} duplicates for: ${key}`);
          
          // Find the category that is referenced by events
          const referencedCategory = group.find(cat => referencedCategoryIds.has(cat.id));
          
          if (referencedCategory) {
            // Keep the referenced one
            categoriesToKeep.push(referencedCategory);
            // Mark others for deletion
            group.forEach(cat => {
              if (cat.id !== referencedCategory.id) {
                categoriesToDelete.push(cat.id);
              }
            });
            console.log(`Keeping referenced category: ${referencedCategory.id}, deleting: ${group.filter(c => c.id !== referencedCategory.id).map(c => c.id).join(', ')}`);
          } else {
            // None are referenced, keep the first one
            categoriesToKeep.push(group[0]);
            // Mark others for deletion
            group.slice(1).forEach(cat => {
              categoriesToDelete.push(cat.id);
            });
            console.log(`No references found, keeping first: ${group[0].id}, deleting: ${group.slice(1).map(c => c.id).join(', ')}`);
          }
        }
      }

      // Delete duplicate categories from the database
      if (categoriesToDelete.length > 0) {
        console.log(`Deleting ${categoriesToDelete.length} duplicate categories...`);
        
        for (const categoryId of categoriesToDelete) {
          try {
            await eventApi.deleteEventCategory(categoryId);
            console.log(`Deleted duplicate category: ${categoryId}`);
          } catch (error) {
            console.error(`Failed to delete duplicate category ${categoryId}:`, error);
          }
        }
        
        toast.success(`Removed ${categoriesToDelete.length} duplicate categor${categoriesToDelete.length !== 1 ? 'ies' : 'y'}`);
      }

      return categoriesToKeep;
    },

    handleAddCategory() {
      this.editingCategory = { 
        id: crypto.randomUUID(), 
        name: '', 
        eventTypeId: '',
        hasHomeTeam: false
      };
      this.showDialog = true;
    },

    handleEditCategory(category) {
      this.editingCategory = category;
      this.showDialog = true;
    },

    async handleSaveCategory() {
      if (!this.editingCategory || !this.editingCategory.name.trim() || !this.editingCategory.eventTypeId) return;

      try {
        const existingIndex = this.eventCategories.findIndex(c => c.id === this.editingCategory.id);
        if (existingIndex >= 0) {
          await eventApi.updateEventCategory(this.editingCategory);
          this.eventCategories[existingIndex] = this.editingCategory;
        } else {
          await eventApi.createEventCategory(this.editingCategory);
          this.eventCategories.push(this.editingCategory);
        }
        this.showDialog = false;
        this.editingCategory = null;
      } catch (error) {
        console.error('Failed to save event category:', error);
      }
    },

    async handleDeleteCategory(categoryId) {
      try {
        await eventApi.deleteEventCategory(categoryId);
        this.eventCategories = this.eventCategories.filter(c => c.id !== categoryId);
      } catch (error) {
        console.error('Failed to delete event category:', error);
      }
    },

    getEventTypeName(typeId) {
      return this.eventTypes.find(t => t.id === typeId)?.name || '';
    },

    // Export event categories to CSV
    handleExportCSV() {
      if (this.eventCategories.length === 0) {
        toast.error('No event categories to export');
        return;
      }

      const headers = ['Name', 'Event Type', 'Has Home Team'];

      const rows = this.eventCategories.map(category => [
        category.name,
        this.getEventTypeName(category.eventTypeId),
        category.hasHomeTeam ? 'Yes' : 'No'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `event_categories_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast.success('Event categories exported successfully');
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

          // Map CSV columns to event category fields
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

          // Parse hasHomeTeam
          const hasHomeTeam = rowData.hasHomeTeam?.toLowerCase() === 'yes';

          // Check for duplicates
          const existingCategory = this.eventCategories.find(c => 
            c.name.toLowerCase().trim() === rowData.name.trim().toLowerCase() &&
            c.eventTypeId === eventType.id
          );

          if (existingCategory) {
            duplicateCount++;
            continue;
          }

          // Create new event category
          const newCategory = {
            id: crypto.randomUUID(),
            name: rowData.name.trim(),
            eventTypeId: eventType.id,
            hasHomeTeam: hasHomeTeam
          };

          await eventApi.createEventCategory(newCategory);
          this.eventCategories.push(newCategory);
          importedCount++;
        }

        this.showImportDialog = false;
        this.importFile = null;
        this.csvHeaders = [];
        this.csvData = [];

        if (importedCount > 0) {
          toast.success(`Successfully imported ${importedCount} event categor${importedCount !== 1 ? 'ies' : 'y'}${duplicateCount > 0 ? ` (${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped)` : ''}`);
        } else if (duplicateCount > 0) {
          toast.warning(`All ${duplicateCount} event categor${duplicateCount !== 1 ? 'ies were' : 'y was'} duplicate${duplicateCount !== 1 ? 's' : ''}`);
        } else {
          toast.error('No valid event categories found in CSV');
        }

        await this.loadData();
      } catch (error) {
        console.error('Failed to import event categories:', error);
        toast.error('Failed to import event categories');
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