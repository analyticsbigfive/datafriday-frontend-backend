<template>
  <Dialog :open="open" @open-change="onOpenChange">
    <DialogContent class="max-w-3xl max-h-[90vh] flex flex-col" aria-describedby="csv-mapping-description">
      <DialogHeader>
        <DialogTitle>Map CSV Columns</DialogTitle>
        <DialogDescription id="csv-mapping-description">
          Match each CSV column to the corresponding field in the database. 
          Required fields are marked with an asterisk (*).
        </DialogDescription>
      </DialogHeader>

      <!-- Supplier Picker -->
      <div v-if="suppliers && suppliers.length > 0" class="border-b pb-4">
        <div class="space-y-2">
          <Label for="supplier-select" class="text-sm">
            Apply Supplier to All Rows (Optional)
          </Label>
          <Select :value="selectedSupplierId" @value-change="setSelectedSupplierId">
            <SelectTrigger id="supplier-select">
              <SelectValue placeholder="Select a supplier for all items..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span class="text-gray-500 italic">No supplier selected - use CSV column</span>
              </SelectItem>
              <SelectItem v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">
                {{ supplier.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p v-if="selectedSupplierId && selectedSupplierId !== '__none__'" class="text-xs text-gray-600">
            All imported items will use "{{ getSupplierName(selectedSupplierId) }}" as the supplier
          </p>
        </div>
      </div>

      <ScrollArea class="h-[400px] pr-4">
        <div class="space-y-4 py-4 pr-2">
          <div v-for="targetCol in targetColumns" :key="targetCol.key" class="grid grid-cols-[minmax(150px,1fr),auto,minmax(200px,1fr)] gap-4 items-center">
            <!-- Target Column -->
            <div class="flex items-center gap-2">
              <Label class="text-sm">
                {{ targetCol.label }}
                <span v-if="targetCol.required" class="text-red-500 ml-1">*</span>
              </Label>
              <CheckCircle2 v-if="isMapped(targetCol.key)" class="w-4 h-4 text-green-500" />
            </div>

            <!-- Arrow -->
            <div class="text-gray-400">←</div>

            <!-- CSV Column Select -->
            <div class="flex items-center gap-2">
              <Select
                :value="mapping[targetCol.key] || ''"
                @value-change="(value) => handleMappingChange(targetCol.key, value)"
              >
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Select CSV column..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N/A">
                    <span class="text-gray-500 italic">N/A (Don't import)</span>
                  </SelectItem>
                  <SelectItem v-for="header in csvHeaders" :key="header" :value="header">
                    {{ header }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Badge v-if="isSuggested(targetCol.key)" variant="outline" class="text-xs whitespace-nowrap">
                Saved
              </Badge>
            </div>
          </div>
        </div>
      </ScrollArea>

      <!-- Errors and Warnings -->
      <div v-if="errors.length > 0" class="bg-red-50 border border-red-200 rounded-md p-3 max-h-[600px] overflow-y-auto">
        <div class="flex items-start gap-2">
          <AlertCircle class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div class="flex-1">
            <p class="text-sm text-red-800">Please fix the following issues:</p>
            <ul class="list-disc list-inside text-sm text-red-700 mt-1">
              <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Status Summary -->
      <div class="bg-gray-50 border border-gray-200 rounded-md p-3">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600">
            Mapped: {{ mappedCount }} of {{ csvHeaders.length }} CSV columns
          </span>
          <span class="text-gray-600">
            Required fields: {{ satisfiedRequiredCount }} of {{ totalRequiredCount }}
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">
          Cancel
        </Button>
        <Button 
          @click="handleConfirm" 
          :disabled="!isValid || !allFieldsSet"
        >
          Import Data
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script>
import Dialog from '../ui//dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogFooter from '../ui/dialogFooter.vue';
import Select from '../ui/select.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';
import Button from '../ui/button.vue';
import Label from '../ui/label.vue';
import ScrollArea from '../ui/scrollArea.vue';
import Badge from '../ui/badge.vue';
import { AlertCircle, CheckCircle2 } from 'lucide-vue-next';

export default {
  name: 'CSVMappingDialog',
  components: {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Button,
    Label,
    ScrollArea,
    Badge,
    AlertCircle,
    CheckCircle2
  },
  props: {
    open: {
      type: Boolean,
      required: true
    },
    onOpenChange: {
      type: Function,
      required: true
    },
    csvHeaders: {
      type: Array,
      required: true
    },
    targetColumns: {
      type: Array,
      required: true
    },
    onConfirm: {
      type: Function,
      required: true
    },
    onCancel: {
      type: Function,
      required: true
    },
    savedMapping: {
      type: Object,
      default: () => ({})
    },
    suppliers: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      mapping: {},
      errors: [],
      selectedSupplierId: '__none__'
    };
  },
  computed: {
    isValid() {
      return this.errors.length === 0;
    },
    allFieldsSet() {
      return this.targetColumns.every(col => {
        const currentMapping = this.mapping[col.key];
        // Supplier can be skipped if a supplier is selected from dropdown
        if (col.key === 'supplier' && this.selectedSupplierId && this.selectedSupplierId !== '__none__') {
          return true;
        }
        return currentMapping && currentMapping !== '';
      });
    },
    mappedCount() {
      return Object.values(this.mapping).filter(v => v && v !== 'N/A').length;
    },
    totalRequiredCount() {
      return this.targetColumns.filter(col => col.required).length;
    },
    satisfiedRequiredCount() {
      return this.targetColumns.filter(col => {
        const currentMapping = this.mapping[col.key];
        if (col.key === 'supplier' && this.selectedSupplierId && this.selectedSupplierId !== '__none__') {
          return true; // Count as satisfied if supplier selected
        }
        return col.required && currentMapping && currentMapping !== 'N/A' && currentMapping !== '';
      }).length;
    }
  },
  watch: {
    open: {
      handler() {
        if (this.open && this.csvHeaders.length > 0) {
          this.initializeMapping();
        }
      },
      immediate: true
    },
    mapping: {
      handler() {
        this.validateMapping();
      },
      deep: true
    },
    targetColumns: {
      handler() {
        this.validateMapping();
      },
      deep: true
    },
    selectedSupplierId() {
      this.validateMapping();
    }
  },
  methods: {
    // Smart column matching function
    suggestMapping(csvHeader, targetColumns) {
      const normalizedCsvHeader = csvHeader.toLowerCase().trim();
      
      // Exact match patterns - order matters! More specific patterns should come first
      const exactMatches = {
        // Event-related fields (more specific patterns first)
        'location': ['location'],
        'space': ['space', 'venue'],
        'configuration': ['configuration', 'config', 'setup'],
        'eventDate': ['event date', 'eventdate', 'date'],
        'eventName': ['event name', 'eventname', 'event'],
        'eventType': ['event type', 'eventtype', 'type'],
        'eventCategory': ['event category', 'eventcategory', 'category'],
        'eventSubcategory': ['event subcategory', 'eventsubcategory', 'subcategory', 'sub-category', 'sub category'],
        'performerName': ['performer name', 'performername', 'performer'],
        'homeTeamName': ['home team name', 'hometeamname', 'home team'],
        'visitingTeam': ['visiting team', 'visitingteam', 'away team', 'awayteam'],
        'sponsor': ['sponsor', 'sponsor name'],
        'numberOfSessions': ['number of sessions', 'numberofsessions', 'sessions count', 'session count'],
        'sessions': ['sessions (doors|show)', 'sessions', 'session times'],
        'hasOpeningAct': ['has opening act', 'hasopeningact', 'opening act'],
        'openingActName': ['opening act name', 'openingactname'],
        'hasIntermission': ['has intermission', 'hasintermission', 'intermission'],
        // Inventory fields
        'supplier': ['supplier', 'supplier name', 'vendor', 'vendor name'],
        'goodType': ['good type', 'goodtype', 'product type'],
        'unit': ['unit', 'units', 'measure', 'measurement', 'uom', 'unit of measure'],
        'unitsPerPurchase': ['units per purchase', 'unitsperpurchase', 'quantity', 'qty', 'pack size', 'purchase quantity'],
        'price': ['price', 'cost', 'amount', 'purchase price', 'unit price'],
        'packedUnits': ['packed units', 'packedunits', 'pack units', 'units in pack'],
        'numberOfUnits': ['number of units', 'numberofunits', 'num units', '# units', 'count'],
        'dimensions': ['dimensions', 'size', 'packing dimensions', 'pack dimensions'],
        'itemName': ['item name', 'itemname', 'product', 'product name', 'item', 'description'],
        // Generic name field (least specific, should be last)
        'name': ['name'],
        // Has Home Team field
        'hasHomeTeam': ['has home team', 'hashometeam', 'home team'],
      };

      // Check for exact matches first
      for (const [targetKey, patterns] of Object.entries(exactMatches)) {
        // Only consider this target key if it exists in targetColumns
        if (!targetColumns.some(col => col.key === targetKey)) continue;
        
        if (patterns.some(pattern => normalizedCsvHeader === pattern)) {
          return targetKey;
        }
      }

      // Check for partial matches (only for more specific fields, not 'name')
      const partialMatchFields = ['location', 'space', 'configuration', 'eventDate', 'eventName', 'eventType', 'eventCategory', 'eventSubcategory', 'performerName', 'homeTeamName', 'visitingTeam', 'sponsor', 'hasHomeTeam', 'supplier', 'goodType', 'unit', 'itemName'];
      for (const [targetKey, patterns] of Object.entries(exactMatches)) {
        // Only consider this target key if it exists in targetColumns and is in partialMatchFields
        if (!targetColumns.some(col => col.key === targetKey)) continue;
        if (!partialMatchFields.includes(targetKey)) continue;
        
        if (patterns.some(pattern => normalizedCsvHeader.includes(pattern) || pattern.includes(normalizedCsvHeader))) {
          return targetKey;
        }
      }

      return null;
    },

    // Initialize mapping with suggestions
    initializeMapping() {
      const initialMapping = {};
      
      // First, try to use saved mapping if available
      if (this.savedMapping) {
        // Validate saved mapping against current CSV headers
        Object.entries(this.savedMapping).forEach(([targetCol, csvCol]) => {
          if (this.csvHeaders.includes(csvCol)) {
            initialMapping[targetCol] = csvCol;
          }
        });
      }
      
      // Fill in any unmapped columns with suggestions
      this.csvHeaders.forEach(csvHeader => {
        const suggestion = this.suggestMapping(csvHeader, this.targetColumns);
        if (suggestion && !Object.values(initialMapping).includes(csvHeader)) {
          // Only suggest if this target column hasn't been mapped yet
          if (!initialMapping[suggestion]) {
            initialMapping[suggestion] = csvHeader;
          }
        }
      });
      
      this.mapping = initialMapping;
    },

    // Validate mapping
    validateMapping() {
      const newErrors = [];
      
      this.targetColumns.forEach(col => {
        const currentMapping = this.mapping[col.key];
        const isEmpty = !currentMapping || currentMapping === '';
        
        // All fields must be explicitly set to either a CSV column or "N/A"
        // Supplier is only required if no supplier is selected from dropdown
        if (col.key === 'supplier') {
          if ((!this.selectedSupplierId || this.selectedSupplierId === '__none__') && isEmpty) {
            newErrors.push(`${col.label} must be mapped to a CSV column or select "N/A (Don't import)"`);
          }
        } else if (isEmpty) {
          // Any field (required or not) must have a value - either CSV column or N/A
          newErrors.push(`${col.label} must be mapped to a CSV column or select "N/A (Don't import)"`);
        }
      });

      // Check for duplicate mappings (excluding N/A and empty values)
      // Allow 'space' and 'location' to map to the same column
      const mappedValues = Object.entries(this.mapping)
        .filter(([key, value]) => value && value !== 'N/A' && value !== '')
        .filter(([key]) => !(key === 'space' || key === 'location')); // Exclude space and location from duplicate check
      
      const duplicateValues = mappedValues.map(([, value]) => value);
      const duplicates = duplicateValues.filter((item, index) => duplicateValues.indexOf(item) !== index);
      
      if (duplicates.length > 0) {
        newErrors.push(`Duplicate mappings detected: ${[...new Set(duplicates)].join(', ')}`);
      }

      this.errors = newErrors;
    },

    handleMappingChange(targetColumn, csvColumn) {
      this.mapping = {
        ...this.mapping,
        [targetColumn]: csvColumn,
      };
    },

    handleConfirm() {
      if (this.errors.length === 0) {
        // Filter out N/A mappings
        const finalMapping = Object.fromEntries(
          Object.entries(this.mapping).filter(([, value]) => value !== 'N/A')
        );
        this.onConfirm(finalMapping, this.selectedSupplierId);
      }
    },

    handleCancel() {
      this.onCancel();
    },

    isMapped(targetKey) {
      const currentMapping = this.mapping[targetKey];
      return currentMapping && currentMapping !== 'N/A';
    },

    isSuggested(targetKey) {
      return this.savedMapping?.[targetKey] === this.mapping[targetKey];
    },

    getSupplierName(supplierId) {
      const supplier = this.suppliers.find(s => s.id === supplierId);
      return supplier ? supplier.name : '';
    },

    setSelectedSupplierId(value) {
      this.selectedSupplierId = value;
    }
  }
};
</script>
