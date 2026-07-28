<template>
  <!-- h-full (et non h-screen) : la hauteur est fixée par le parent (HrView
       sous l'app-bar 64px) ; h-screen débordait de la hauteur du header. -->
  <div class="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
    <div
      v-if="onClose"
      class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between"
    >
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="onClose">
          <X class="w-5 h-5" />
        </Button>
        <h2 class="font-semibold">Edit HR Suppliers</h2>
      </div>
      <Button @click="handleAddSupplier" size="sm">
        <Plus class="w-4 h-4 mr-2" />
        Add Supplier
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
              <CardTitle>HR Suppliers Library</CardTitle>
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
                  @click="handleAddSupplier"
                  :size="isMobile ? 'default' : 'default'"
                >
                  <Plus class="w-4 h-4 mr-2" />
                  Add Supplier
                </Button>
              </div>
            </div>

            <div class="flex items-center gap-3 mt-4">
              <div class="relative flex-1">
                <Search
                  class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
                />
                <Input
                  placeholder="Search suppliers..."
                  v-model="searchQuery"
                  class="pl-9"
                />
              </div>
            </div>

            <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {{ filteredSuppliers.length }} supplier
                <span v-if="filteredSuppliers.length !== 1">s</span>
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
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Name
                    </th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Email
                    </th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Phone
                    </th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Contact Name
                    </th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Spaces
                    </th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Configurations
                    </th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Sectors
                    </th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="supplier in filteredSuppliers"
                    :key="supplier.id"
                    class="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td class="px-4 py-3 dark:text-gray-300">
                      {{ supplier.name }}
                    </td>
                    <td class="px-4 py-3 dark:text-gray-300">
                      {{ supplier.email }}
                    </td>
                    <td class="px-4 py-3 dark:text-gray-300">
                      {{ supplier.phone }}
                    </td>
                    <td class="px-4 py-3 dark:text-gray-300">
                      {{ supplier.contactName }}
                    </td>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="
                            () => {
                              setEditingSupplier(supplier);
                              setShowAddDialog(true);
                            }
                          "
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="handleDeleteSupplier(supplier.id)"
                        >
                          <Trash2 class="w-4 h-4 text-red-500 dark:text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>

                  <tr v-if="filteredSuppliers.length === 0">
                    <td
                      :colspan="8"
                      class="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      No suppliers yet. Click "Add Supplier" to create your first
                      supplier.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>

    <!-- Add/Edit Supplier Dialog -->
    <Dialog :open="showAddDialog" @openChange="val => setShowAddDialog(val)">
      <DialogContent
        class="max-w-2xl max-h-[90vh] overflow-y-auto"
        aria-describedby="edit-supplier-description"
      >
        <DialogHeader>
          <DialogTitle>
            {{ editingSupplier && editingSupplier.name ? 'Edit Supplier' : 'Add Supplier' }}
          </DialogTitle>
          <DialogDescription id="edit-supplier-description">
            Form to create or edit HR supplier information
          </DialogDescription>
        </DialogHeader>

        <div v-if="editingSupplier" class="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input
              :value="editingSupplier.name"
              @input="e => updateEditingSupplier({ name: e.target.value })"
              placeholder="Enter supplier name"
            />
          </div>

          <div>
            <Label>Email Address</Label>
            <Input
              type="email"
              :value="editingSupplier.email"
              @input="e => updateEditingSupplier({ email: e.target.value })"
              placeholder="Enter email address"
            />
          </div>

          <div>
            <Label>Phone Number</Label>
            <Input
              type="tel"
              :value="editingSupplier.phone"
              @input="e => updateEditingSupplier({ phone: e.target.value })"
              placeholder="Enter phone number"
            />
          </div>

          <div>
            <Label>Contact Name</Label>
            <Input
              :value="editingSupplier.contactName"
              @input="e => updateEditingSupplier({ contactName: e.target.value })"
              placeholder="Enter contact name"
            />
          </div>

          <div>
            <Label>Spaces *</Label>
            <div class="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              <div class="flex items-center space-x-2">
                <Checkbox
                  id="all-spaces"
                  :checked="editingSupplier.spaceIds.length === spaces.length"
                  @update:checked="toggleAllSpaces"
                />
                <Label for="all-spaces" class="cursor-pointer">All Spaces</Label>
              </div>
              <div
                v-for="space in spaces"
                :key="space.id"
                class="flex items-center space-x-2"
              >
                <Checkbox
                  :id="`space-${space.id}`"
                  :checked="editingSupplier.spaceIds.includes(space.id)"
                  @update:checked="() => toggleSpace(space.id)"
                />
                <Label :for="`space-${space.id}`" class="cursor-pointer">
                  {{ space.name }}
                </Label>
              </div>
            </div>
          </div>

          <div v-if="editingSupplier.spaceIds.length > 0">
            <Label>Configurations *</Label>
            <div class="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              <div class="flex items-center space-x-2">
                <Checkbox
                  id="all-configs"
                  :checked="
                    editingSupplier.configurationIds.length ===
                    editingSupplier.spaceIds.flatMap(spaceId => configurations[spaceId] || []).length
                  "
                  @update:checked="toggleAllConfigurations"
                />
                <Label for="all-configs" class="cursor-pointer">
                  All Configurations
                </Label>
              </div>

              <div v-for="spaceId in editingSupplier.spaceIds" :key="spaceId">
                <div class="text-sm font-medium text-gray-500 mt-2 mb-1">
                  {{ spaces.find(s => s.id === spaceId)?.name }}
                </div>
                <div
                  v-for="config in configurations[spaceId] || []"
                  :key="config.id"
                  class="flex items-center space-x-2 ml-4"
                >
                  <Checkbox
                    :id="`config-${config.id}`"
                    :checked="editingSupplier.configurationIds.includes(config.id)"
                    @update:checked="() => toggleConfiguration(config.id)"
                  />
                  <Label :for="`config-${config.id}`" class="cursor-pointer">
                    {{ config.name }}
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label>Sectors *</Label>
            <div class="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              <div class="flex items-center space-x-2">
                <Checkbox
                  id="all-sectors"
                  :checked="editingSupplier.sectors.length === SECTORS.length"
                  @update:checked="toggleAllSectors"
                />
                <Label for="all-sectors" class="cursor-pointer">
                  All Sectors
                </Label>
              </div>
              <div
                v-for="sector in SECTORS"
                :key="sector"
                class="flex items-center space-x-2"
              >
                <Checkbox
                  :id="`sector-${sector}`"
                  :checked="editingSupplier.sectors.includes(sector)"
                  @update:checked="() => toggleSector(sector)"
                />
                <Label :for="`sector-${sector}`" class="cursor-pointer">
                  {{ sector }}
                </Label>
              </div>
            </div>
          </div>

          <div class="flex gap-2 pt-4">
            <Button @click="handleSaveSupplier">Save Supplier</Button>
            <Button variant="outline" @click="() => setShowAddDialog(false)">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- CSV Import Dialog -->
    <CSVMappingDialog
      :open="showImportDialog"
      @openChange="val => setShowImportDialog(val)"
      :csvHeaders="csvHeaders"
      :targetColumns="[
        { key: 'name', label: 'Name', required: true },
        { key: 'email', label: 'Email', required: false },
        { key: 'phone', label: 'Phone', required: false },
        { key: 'contactName', label: 'Contact Name', required: false },
        { key: 'spaces', label: 'Spaces', required: false },
        { key: 'configurations', label: 'Configurations', required: false },
        { key: 'sectors', label: 'Sectors', required: false },
      ]"
      @confirm="handleImportConfirm"
      @cancel="
        () => {
          setShowImportDialog(false);
          setCsvHeaders([]);
          setCsvData([]);
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
import  Button  from '../ui/button.vue';
import Input from '../ui/input.vue';
import ScrollArea from '../ui/scrollArea.vue';
import Dialog from '../ui/dialog.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import DialogContent from '../ui/dialogContent.vue';
import Label  from '../ui/label.vue';
import Checkbox  from '../ui/checkbox.vue';
import { Plus, Trash2, X, Search, Download, Upload } from 'lucide-vue-next';
// API moderne (NestJS) — l'ancien `utils/api.js` pointait sur l'Edge Function
// Supabase du prototype KV (`make-server-…`), morte : liste des espaces toujours vide.
import { getSpacesLight, getSpaceConfigurations } from '../api/endpoints/space.api';
import * as hrApi from '../utils/hrApi';
import Card  from '../ui/card.vue';
import CardContent  from '../ui/cardContent.vue';
import CardHeader  from '../ui/cardHeader.vue';
import CardTitle  from '../ui/cardTitle.vue';
import useIsMobile from '../ui/useMobile';
import CSVMappingDialog from './CSVMappingDialog.vue';

// Shim : le prototype importait `toast` de 'sonner' (lib React, jamais installée
// côté Vue) en laissant les appels en place → ReferenceError au premier save/export
// (BUG-231). Retours non bloquants via console en attendant la refonte.
const toast = {
  success: (msg) => console.info('[HR]', msg),
  info: (msg) => console.info('[HR]', msg),
  error: (msg) => console.error('[HR]', msg),
};

const SECTORS = ['F&B', 'Hospitality', 'Merch', 'Ticketing', 'Access', 'Kitchen', 'Entertainment'];

export default {
  name: 'HRSuppliersView',
  mixins: [useIsMobile],
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
      // Exposé au template (:checked All Sectors, v-for) : une const de module
      // n'est PAS visible depuis un template Options API → `SECTORS.length`
      // crashait à l'ouverture du dialog (BUG-231).
      SECTORS,
      suppliers: /** @type {hrApi.HRSupplier[]} */ ([]),
      spaces: [],
      configurations: {}, // { [spaceId]: Configuration[] }
      editingSupplier: /** @type {hrApi.HRSupplier | null} */ (null),
      showAddDialog: false,
      searchQuery: '',
      isMobile: false,

      // CSV Import/Export
      showImportDialog: false,
      csvHeaders: [],
      csvData: [],
    };
  },
  computed: {
    filteredSuppliers() {
      return this.suppliers.filter(supplier => {
        if (this.searchQuery.trim()) {
          const query = this.searchQuery.toLowerCase();
          return (
            supplier.name.toLowerCase().includes(query) ||
            supplier.email.toLowerCase().includes(query) ||
            supplier.phone.toLowerCase().includes(query) ||
            supplier.contactName.toLowerCase().includes(query)
          );
        }
        return true;
      });
    },
  },
  mounted() {
    this.loadData();
  },
  methods: {
    async loadData() {
      try {
        const [spacesData, suppliersData] = await Promise.all([
          getSpacesLight(),
          hrApi.getAllHRSuppliers(),
        ]);

        this.spaces = Array.isArray(spacesData) ? spacesData : [];
        this.suppliers = Array.isArray(suppliersData) ? suppliersData : [];

        // Configurations en parallèle (l'ancien for…await séquentiel = N appels
        // en série, BUG-231) ; un échec par espace retombe sur [].
        const entries = await Promise.all(
          this.spaces.map(async (space) => {
            try {
              return [space.id, await getSpaceConfigurations(space.id)];
            } catch (error) {
              console.warn(`Could not load configurations for space ${space.id}.`);
              return [space.id, []];
            }
          })
        );
        this.configurations = Object.fromEntries(entries);
      } catch (error) {
        console.error('Failed to load HR suppliers data:', error);
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
        sectors: [],
      };
    },

    handleAddSupplier() {
      this.editingSupplier = this.createNewSupplier();
      this.showAddDialog = true;
    },

    async handleSaveSupplier() {
      if (!this.editingSupplier) return;

      try {
        const existingIndex = this.suppliers.findIndex(
          s => s.id === this.editingSupplier.id
        );
        if (existingIndex >= 0) {
          await hrApi.updateHRSupplier(this.editingSupplier);
          const newSuppliers = [...this.suppliers];
          newSuppliers[existingIndex] = this.editingSupplier;
          this.suppliers = newSuppliers;
        } else {
          await hrApi.createHRSupplier(this.editingSupplier);
          this.suppliers = [...this.suppliers, this.editingSupplier];
        }
        this.showAddDialog = false;
        this.editingSupplier = null;
        toast.success('Supplier saved successfully');
      } catch (error) {
        console.error('Failed to save supplier:', error);
        toast.error('Failed to save supplier');
      }
    },

    async handleDeleteSupplier(supplierId) {
      try {
        await hrApi.deleteHRSupplier(supplierId);
        this.suppliers = this.suppliers.filter(s => s.id !== supplierId);
        toast.success('Supplier deleted successfully');
      } catch (error) {
        console.error('Failed to delete supplier:', error);
        toast.error('Failed to delete supplier');
      }
    },

    updateEditingSupplier(updates) {
      if (!this.editingSupplier) return;
      this.editingSupplier = { ...this.editingSupplier, ...updates };
    },

    toggleSpace(spaceId) {
      if (!this.editingSupplier) return;

      const spaceIds = this.editingSupplier.spaceIds.includes(spaceId)
        ? this.editingSupplier.spaceIds.filter(id => id !== spaceId)
        : [...this.editingSupplier.spaceIds, spaceId];

      const configurationIds = spaceIds.includes(spaceId)
        ? this.editingSupplier.configurationIds
        : this.editingSupplier.configurationIds.filter(configId => {
            const config = (this.configurations[spaceId] || []).find(
              c => c.id === configId
            );
            return !config;
          });

      this.updateEditingSupplier({ spaceIds, configurationIds });
    },

    toggleAllSpaces() {
      if (!this.editingSupplier) return;

      if (this.editingSupplier.spaceIds.length === this.spaces.length) {
        this.updateEditingSupplier({ spaceIds: [], configurationIds: [] });
      } else {
        this.updateEditingSupplier({ spaceIds: this.spaces.map(s => s.id) });
      }
    },

    toggleConfiguration(configId) {
      if (!this.editingSupplier) return;

      const configurationIds = this.editingSupplier.configurationIds.includes(
        configId
      )
        ? this.editingSupplier.configurationIds.filter(id => id !== configId)
        : [...this.editingSupplier.configurationIds, configId];

      this.updateEditingSupplier({ configurationIds });
    },

    toggleAllConfigurations() {
      if (!this.editingSupplier) return;

      const allConfigs = this.editingSupplier.spaceIds.flatMap(spaceId =>
        (this.configurations[spaceId] || []).map(c => c.id)
      );

      if (this.editingSupplier.configurationIds.length === allConfigs.length) {
        this.updateEditingSupplier({ configurationIds: [] });
      } else {
        this.updateEditingSupplier({ configurationIds: allConfigs });
      }
    },

    toggleSector(sector) {
      if (!this.editingSupplier) return;

      const sectors = this.editingSupplier.sectors.includes(sector)
        ? this.editingSupplier.sectors.filter(s => s !== sector)
        : [...this.editingSupplier.sectors, sector];

      this.updateEditingSupplier({ sectors });
    },

    toggleAllSectors() {
      if (!this.editingSupplier) return;

      if (this.editingSupplier.sectors.length === SECTORS.length) {
        this.updateEditingSupplier({ sectors: [] });
      } else {
        this.updateEditingSupplier({ sectors: [...SECTORS] });
      }
    },

    getSpaceNames(spaceIds) {
      if (spaceIds.length === this.spaces.length) return 'All';
      return spaceIds
        .map(id => this.spaces.find(s => s.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    },

    getConfigNames(configIds) {
      const allConfigs = Object.values(this.configurations).flatMap(
        configs => configs
      );
      if (configIds.length === allConfigs.length) return 'All';

      return configIds
        .map(id => {
          for (const spaceId in this.configurations) {
            const config = this.configurations[spaceId].find(c => c.id === id);
            if (config) return config.name;
          }
          return null;
        })
        .filter(Boolean)
        .join(', ');
    },

    getSectorsText(sectors) {
      if (sectors.length === SECTORS.length) return 'All';
      return sectors.join(', ');
    },

    handleExportCSV() {
      if (this.suppliers.length === 0) {
        toast.error('No suppliers to export');
        return;
      }

      const headers = [
        'Name',
        'Email',
        'Phone',
        'Contact Name',
        'Spaces',
        'Configurations',
        'Sectors',
      ];

      const rows = this.suppliers.map(supplier => [
        supplier.name,
        supplier.email,
        supplier.phone,
        supplier.contactName,
        this.getSpaceNames(supplier.spaceIds),
        this.getConfigNames(supplier.configurationIds),
        this.getSectorsText(supplier.sectors),
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
      link.download = `hr_suppliers_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast.success('Suppliers exported successfully');
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

          if (!rowData.name) continue;

          const parseMultiSelect = (value, allItems, getValue) => {
            if (!value) return [];
            if (value.toLowerCase() === 'all')
              return allItems.map(item => item.id);
            return value
              .split(',')
              .map(name => {
                const trimmed = name.trim();
                const found = allItems.find(
                  item =>
                    getValue(item).toLowerCase() === trimmed.toLowerCase()
                );
                return found?.id;
              })
              .filter(Boolean);
          };

          const spaceIds = parseMultiSelect(
            rowData.spaces || '',
            this.spaces,
            s => s.name
          );

          const sectors =
            rowData.sectors?.toLowerCase() === 'all'
              ? [...SECTORS]
              : (rowData.sectors || '')
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean);

          let configurationIds = [];
          if (rowData.configurations) {
            if (rowData.configurations.toLowerCase() === 'all') {
              configurationIds = spaceIds.flatMap(spaceId =>
                (this.configurations[spaceId] || []).map(c => c.id)
              );
            } else {
              const configNames = rowData.configurations
                .split(',')
                .map(n => n.trim());
              configurationIds = spaceIds.flatMap(spaceId => {
                const spaceConfigs = this.configurations[spaceId] || [];
                return configNames
                  .map(name => {
                    const found = spaceConfigs.find(
                      c => c.name.toLowerCase() === name.toLowerCase()
                    );
                    return found?.id;
                  })
                  .filter(Boolean);
              });
            }
          }

          const newSupplier = {
            id: crypto.randomUUID(),
            name: rowData.name,
            email: rowData.email || '',
            phone: rowData.phone || '',
            contactName: rowData.contactName || '',
            spaceIds,
            configurationIds,
            sectors,
          };

          const isDuplicate = this.suppliers.some(
            existing =>
              existing.name.toLowerCase() === newSupplier.name.toLowerCase() &&
              existing.email.toLowerCase() === newSupplier.email.toLowerCase()
          );

          if (isDuplicate) {
            duplicateCount++;
            continue;
          }

          await hrApi.createHRSupplier(newSupplier);
          this.suppliers = [...this.suppliers, newSupplier];
          importedCount++;
        }

        this.showImportDialog = false;
        this.csvHeaders = [];
        this.csvData = [];

        if (importedCount > 0) {
          toast.success(
            `Imported ${importedCount} supplier(s)${
              duplicateCount > 0
                ? `, skipped ${duplicateCount} duplicate(s)`
                : ''
            }`
          );
        } else if (duplicateCount > 0) {
          toast.info(`All ${duplicateCount} supplier(s) already exist`);
        } else {
          toast.error('No suppliers were imported');
        }
      } catch (error) {
        console.error('Failed to import suppliers:', error);
        toast.error('Failed to import suppliers');
      }
    },
  },
};
</script>