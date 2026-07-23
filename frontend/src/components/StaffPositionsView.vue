<template>
  <!-- h-full (et non h-screen) : hauteur fixée par le parent (HrView), cf. HRSuppliersView. -->
  <div class="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
    <div
      v-if="onClose"
      class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between"
    >
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="onClose">
          <X class="w-5 h-5" />
        </Button>
        <h2 class="font-semibold">Edit Staff Positions</h2>
      </div>
      <Button @click="handleAddPosition" size="sm">
        <Plus class="w-4 h-4 mr-2" />
        Add Position
      </Button>
    </div>

    <ScrollArea class="flex-1">
      <div v-if="!onClose" class="p-4">
        <Card>
          <CardHeader>
            <div
              class="flex"
              :class="isMobile ? 'flex-col gap-3' : 'items-center justify-between'"
            >
              <CardTitle>Staff Positions Library</CardTitle>
              <div class="flex gap-2">
                <Button
                  @click="handleExportCSV"
                  :size="isMobile ? 'default' : 'default'"
                  variant="outline"
                >
                  <Download class="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  @click="handleImportClick"
                  :size="isMobile ? 'default' : 'default'"
                  variant="outline"
                >
                  <Upload class="w-4 h-4 mr-2" />
                  Import CSV
                </Button>
                <Button
                  @click="handleAddPosition"
                  :size="isMobile ? 'default' : 'default'"
                >
                  <Plus class="w-4 h-4 mr-2" />
                  Add Position
                </Button>
              </div>
            </div>

            <div class="flex items-center gap-3 mt-4">
              <div class="relative flex-1">
                <Search
                  class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
                />
                <Input
                  placeholder="Search positions..."
                  v-model="searchQuery"
                  class="pl-9"
                />
              </div>
            </div>

            <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {{ filteredPositions.length }} position<span
                  v-if="filteredPositions.length !== 1"
                  >s</span
                >
              </span>
            </div>
          </CardHeader>

          <CardContent>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead
                  class="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700"
                >
                  <tr>
                    <th
                      class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300"
                    >
                      Supplier
                    </th>
                    <th
                      class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300"
                    >
                      Sector
                    </th>
                    <th
                      class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300"
                    >
                      Position Name
                    </th>
                    <th
                      class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300"
                    >
                      Rate Per Hour (€)
                    </th>
                    <th
                      class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="position in filteredPositions"
                    :key="position.id"
                    class="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td class="px-4 py-3 dark:text-gray-300">
                      {{ getSupplierName(position.supplierId) }}
                    </td>
                    <td class="px-4 py-3 dark:text-gray-300">
                      {{ position.sector }}
                    </td>
                    <td class="px-4 py-3 dark:text-gray-300">
                      {{ position.positionName }}
                    </td>
                    <td class="px-4 py-3 dark:text-gray-300">
                      €{{ position.ratePerHour.toFixed(2) }}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="
                            () => {
                              editingPosition = { ...position };
                              showAddDialog = true;
                            }
                          "
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="handleDeletePosition(position.id)"
                        >
                          <Trash2
                            class="w-4 h-4 text-red-500 dark:text-red-400"
                          />
                        </Button>
                      </div>
                    </td>
                  </tr>

                  <tr v-if="filteredPositions.length === 0">
                    <td
                      :colspan="5"
                      class="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      No positions yet. Click "Add Position" to create your
                      first position.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>

    <!-- Add/Edit Position Dialog -->
    <Dialog :open="showAddDialog" @openChange="val => (showAddDialog = val)">
      <DialogContent
        class="max-w-2xl max-h-[90vh] overflow-y-auto"
        aria-describedby="edit-position-description"
      >
        <DialogHeader>
          <DialogTitle>
            {{ editingPosition && editingPosition.positionName
              ? 'Edit Position'
              : 'Add Position' }}
          </DialogTitle>
          <DialogDescription id="edit-position-description">
            Form to create or edit staff position information
          </DialogDescription>
        </DialogHeader>

        <div v-if="editingPosition" class="space-y-4">
          <div>
            <Label>Supplier *</Label>
            <Select
              :value="editingPosition.supplierId"
              @update:modelValue="val => updateEditingPosition({ supplierId: val })"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="supplier in suppliers"
                  :key="supplier.id"
                  :value="supplier.id"
                >
                  {{ supplier.name }}
                </SelectItem>
                <div
                  v-if="suppliers.length === 0"
                  class="px-2 py-1.5 text-sm text-gray-500"
                >
                  No suppliers available
                </div>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Sector *</Label>
            <Select
              :value="editingPosition.sector"
              @update:modelValue="val =>
                updateEditingPosition({ sector: val, positionName: '' })"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="sector in SECTORS"
                  :key="sector"
                  :value="sector"
                >
                  {{ sector }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="editingPosition.sector">
            <Label>Position Name *</Label>
            <div class="flex gap-2">
              <Select
                :value="editingPosition.positionName"
                @update:modelValue="handlePositionNameSelect"
              >
                <SelectTrigger class="flex-1">
                  <SelectValue placeholder="Select position name" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="pn in getFilteredPositionNames(editingPosition.sector)"
                    :key="pn.id"
                    :value="pn.name"
                  >
                    {{ pn.name }}
                  </SelectItem>
                  <SelectItem value="__add_new__">
                    + Add New Position
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Rate Per Hour (€) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              :value="editingPosition.ratePerHour"
              @input="e =>
                updateEditingPosition({
                  ratePerHour: parseFloat(e.target.value) || 0,
                })"
              placeholder="0.00"
            />
          </div>

          <div class="flex gap-2 pt-4">
            <Button @click="handleSavePosition">Save Position</Button>
            <Button variant="outline" @click="showAddDialog = false">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Add Position Name Dialog -->
    <Dialog
      :open="showAddPositionNameDialog"
      @openChange="val => (showAddPositionNameDialog = val)"
    >
      <DialogContent aria-describedby="add-position-name-description">
        <DialogHeader>
          <DialogTitle>Add Position Name</DialogTitle>
          <DialogDescription id="add-position-name-description">
            Add a new position name for {{ newPositionNameSector }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <Label>Position Name *</Label>
            <Input
              v-model="newPositionNameText"
              placeholder="Enter position name"
            />
          </div>
          <div class="flex gap-2">
            <Button @click="handleAddPositionName">Add</Button>
            <Button
              variant="outline"
              @click="showAddPositionNameDialog = false"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- CSV Import Dialog -->
    <CSVMappingDialog
      :open="showImportDialog"
      @openChange="val => (showImportDialog = val)"
      :csvHeaders="csvHeaders"
      :targetColumns="[
        { key: 'supplierId', label: 'Supplier', required: true },
        { key: 'sector', label: 'Sector', required: true },
        { key: 'positionName', label: 'Position Name', required: true },
        { key: 'ratePerHour', label: 'Rate Per Hour (€)', required: false },
      ]"
      @confirm="handleImportConfirm"
      @cancel="
        () => {
          showImportDialog = false;
          csvHeaders = [];
          csvData = [];
        }
      "
    />

    <input
      type="file"
      ref="fileInputRef"
      @change="handleFileUpload"
      accept=".csv"
      class="hidden"
    />
  </div>
</template>

<script>
import Button from '../ui/button.vue';
import Input from '../ui/input.vue';
import ScrollArea  from '../ui/scrollArea.vue';
import Dialog from '../ui/dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import Label  from '../ui/label.vue';
import { Plus, Trash2, X, Search, Download, Upload } from 'lucide-vue-next';
import * as hrApi from '../utils/hrApi';
import Card from '../ui/card.vue';
import CardContent from '../ui/cardContent.vue';
import CardHeader from '../ui/cardHeader.vue';
import CardTitle from '../ui/cardTitle.vue';
import Select from '../ui/select.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';
import CSVMappingDialog from './CSVMappingDialog.vue';

// Shim : le prototype importait `toast` de 'sonner' (lib React, jamais installée
// côté Vue) en laissant les appels en place → ReferenceError au premier save/export
// (BUG-231). Retours non bloquants via console en attendant la refonte.
const toast = {
  success: (msg) => console.info('[HR]', msg),
  info: (msg) => console.info('[HR]', msg),
  error: (msg) => console.error('[HR]', msg),
};

const SECTORS = [
  'F&B',
  'Hospitality',
  'Merch',
  'Ticketing',
  'Access',
  'Kitchen',
  'Entertainment',
];

const MOBILE_BREAKPOINT = 768;

export default {
  name: 'StaffPositionsView',
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
    Plus,
    Trash2,
    X,
    Search,
    Download,
    Upload,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    CSVMappingDialog,
  },
  props: {
    onClose: {
      type: Function,
      required: false,
    },
  },
  data() {
    return {
      // Exposé au template (v-for sectors) : une const de module n'est PAS
      // visible depuis un template Options API (BUG-231, cf. HRSuppliersView).
      SECTORS,
      positions: [],
      positionNames: [],
      suppliers: [],
      editingPosition: null,
      showAddDialog: false,
      showAddPositionNameDialog: false,
      searchQuery: '',
      newPositionNameText: '',
      newPositionNameSector: '',
      isMobile: false,

      showImportDialog: false,
      csvHeaders: [],
      csvData: [],

      _mobileMql: null,
    };
  },
  computed: {
    filteredPositions() {
      return this.positions.filter(position => {
        if (this.searchQuery.trim()) {
          const query = this.searchQuery.toLowerCase();
          return (
            position.supplierId.toLowerCase().includes(query) ||
            position.sector.toLowerCase().includes(query) ||
            position.positionName.toLowerCase().includes(query) ||
            position.ratePerHour.toString().includes(query)
          );
        }
        return true;
      });
    },
  },
  mounted() {
    this.loadData();

    this._mobileMql = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    );
    const update = () => {
      this.isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    };
    this._onMobileChange = update;
    this._mobileMql.addEventListener('change', this._onMobileChange);
    update();
  },
  beforeUnmount() {
    if (this._mobileMql && this._onMobileChange) {
      this._mobileMql.removeEventListener('change', this._onMobileChange);
    }
  },
  methods: {
    async loadData() {
      try {
        const [positionsData, positionNamesData, suppliersData] =
          await Promise.all([
            hrApi.getAllStaffPositions(),
            hrApi.getAllPositionNames(),
            hrApi.getAllHRSuppliers(),
          ]);

        this.positions = positionsData;
        this.positionNames = positionNamesData;
        this.suppliers = suppliersData;
      } catch (error) {
        console.error('Failed to load staff positions data:', error);
      }
    },

    createNewPosition() {
      return {
        id: crypto.randomUUID(),
        supplierId: '',
        sector: '',
        positionName: '',
        ratePerHour: 0,
      };
    },

    handleAddPosition() {
      this.editingPosition = this.createNewPosition();
      this.showAddDialog = true;
    },

    async handleSavePosition() {
      if (!this.editingPosition) return;

      try {
        const existingIndex = this.positions.findIndex(
          p => p.id === this.editingPosition.id,
        );
        if (existingIndex >= 0) {
          await hrApi.updateStaffPosition(this.editingPosition);
          const newPositions = [...this.positions];
          newPositions[existingIndex] = this.editingPosition;
          this.positions = newPositions;
        } else {
          await hrApi.createStaffPosition(this.editingPosition);
          this.positions = [...this.positions, this.editingPosition];
        }
        this.showAddDialog = false;
        this.editingPosition = null;
        toast.success('Position saved successfully');
      } catch (error) {
        console.error('Failed to save position:', error);
        toast.error('Failed to save position');
      }
    },

    async handleDeletePosition(positionId) {
      try {
        await hrApi.deleteStaffPosition(positionId);
        this.positions = this.positions.filter(p => p.id !== positionId);
        toast.success('Position deleted successfully');
      } catch (error) {
        console.error('Failed to delete position:', error);
        toast.error('Failed to delete position');
      }
    },

    async handleAddPositionName() {
      if (!this.newPositionNameText.trim() || !this.newPositionNameSector)
        return;

      try {
        const newPositionName = {
          id: crypto.randomUUID(),
          name: this.newPositionNameText,
          sector: this.newPositionNameSector,
        };
        await hrApi.createPositionName(newPositionName);
        this.positionNames = [...this.positionNames, newPositionName];

        if (this.editingPosition) {
          this.updateEditingPosition({ positionName: newPositionName.name });
        }

        this.newPositionNameText = '';
        this.newPositionNameSector = '';
        this.showAddPositionNameDialog = false;
        toast.success('Position name added successfully');
      } catch (error) {
        console.error('Failed to add position name:', error);
        toast.error('Failed to add position name');
      }
    },

    updateEditingPosition(updates) {
      if (!this.editingPosition) return;
      this.editingPosition = { ...this.editingPosition, ...updates };
    },

    getFilteredPositionNames(sector) {
      return this.positionNames.filter(pn => pn.sector === sector);
    },

    getSupplierName(supplierId) {
      const supplier = this.suppliers.find(s => s.id === supplierId);
      return supplier ? supplier.name : supplierId;
    },

    handleExportCSV() {
      if (this.positions.length === 0) {
        toast.error('No positions to export');
        return;
      }

      const headers = ['Supplier', 'Sector', 'Position Name', 'Rate Per Hour (€)'];

      const rows = this.positions.map(position => [
        position.supplierId,
        position.sector,
        position.positionName,
        position.ratePerHour.toFixed(2),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `staff_positions_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast.success('Positions exported successfully');
    },

    handleImportClick() {
      const input = this.$refs.fileInputRef;
      if (input && input.click) {
        input.click();
      }
    },

    parseCSV(text) {
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) return { headers: [], rows: [] };

      const firstLine = lines[0];
      const separator =
        firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

      const headers = lines[0]
        .split(separator)
        .map(h => h.trim().replace(/^"|"$/g, ''));

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

    handleFileUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = event => {
        const text = event.target?.result;
        const { headers, rows } = this.parseCSV(String(text));

        if (headers.length === 0 || rows.length === 0) {
          toast.error('Invalid CSV file');
          return;
        }

        this.csvHeaders = headers;
        this.csvData = rows;
        this.showImportDialog = true;
      };
      reader.readAsText(file);

      e.target.value = '';
    },

    async handleImportConfirm(mapping) {
      try {
        let importedCount = 0;
        let duplicateCount = 0;

        for (const row of this.csvData) {
          const rowData = {};

          Object.entries(mapping).forEach(([targetField, csvColumn]) => {
            if (csvColumn && csvColumn !== '') {
              const columnIndex = this.csvHeaders.indexOf(csvColumn);
              if (columnIndex !== -1) {
                rowData[targetField] = row[columnIndex];
              }
            }
          });

          if (!rowData.supplierId || !rowData.sector || !rowData.positionName)
            continue;

          if (
            !this.positionNames.find(
              pn =>
                pn.name.toLowerCase() ===
                  String(rowData.positionName).toLowerCase() &&
                pn.sector === rowData.sector,
            )
          ) {
            const newPositionName = {
              id: crypto.randomUUID(),
              name: rowData.positionName,
              sector: rowData.sector,
            };
            await hrApi.createPositionName(newPositionName);
            this.positionNames = [...this.positionNames, newPositionName];
          }

          const newPosition = {
            id: crypto.randomUUID(),
            supplierId: rowData.supplierId,
            sector: rowData.sector,
            positionName: rowData.positionName,
            ratePerHour: parseFloat(rowData.ratePerHour) || 0,
          };

          const isDuplicate = this.positions.some(
            existing =>
              existing.supplierId.toLowerCase() ===
                newPosition.supplierId.toLowerCase() &&
              existing.sector === newPosition.sector &&
              existing.positionName.toLowerCase() ===
                newPosition.positionName.toLowerCase(),
          );

          if (isDuplicate) {
            duplicateCount++;
            continue;
          }

          await hrApi.createStaffPosition(newPosition);
          this.positions = [...this.positions, newPosition];
          importedCount++;
        }

        this.showImportDialog = false;
        this.csvHeaders = [];
        this.csvData = [];

        if (importedCount > 0) {
          toast.success(
            `Imported ${importedCount} position(s)${
              duplicateCount > 0
                ? `, skipped ${duplicateCount} duplicate(s)`
                : ''
            }`,
          );
        } else if (duplicateCount > 0) {
          toast.info(`All ${duplicateCount} position(s) already exist`);
        } else {
          toast.error('No positions were imported');
        }
      } catch (error) {
        console.error('Failed to import positions:', error);
        toast.error('Failed to import positions');
      }
    },

    handlePositionNameSelect(value) {
      if (!this.editingPosition) return;

      if (value === '__add_new__') {
        this.newPositionNameSector = this.editingPosition.sector;
        this.showAddPositionNameDialog = true;
      } else {
        this.updateEditingPosition({ positionName: value });
      }
    },
  },
};
</script>