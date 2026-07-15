<template>
    <Card>
      <CardHeader>
        <div :class="`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'}`">
          <div>
            <CardTitle>Suppliers</CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {{ suppliers.length }} supplier{{ suppliers.length !== 1 ? "s" : "" }}
            </p>
          </div>
 
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border rounded-md">
              <Button
                :variant="viewMode === 'table' ? 'default' : 'ghost'"
                size="icon"
                @click="viewMode = 'table'"
              >
                <LayoutList className="w-4 h-4" />
              </Button>
 
              <Button
                :variant="viewMode === 'card' ? 'default' : 'ghost'"
                size="icon"
                @click="viewMode = 'card'"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </div>
 
            <Button @click="handleAdd">
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          </div>
        </div>
 
        <div className="mt-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
            />
            <Input
              placeholder="Search suppliers..."
              className="pl-9"
              :value="searchQuery"
              @input="searchQuery = $event?.target?.value"
            />
          </div>
        </div>
      </CardHeader>
 
      <CardContent>
        <div
          v-if="filteredSuppliers.length === 0"
          className="text-center py-12 text-gray-500 dark:text-gray-400"
        >
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>No suppliers found</p>
          <p className="text-sm">Add your first supplier to get started</p>
        </div>
 
        <div v-else-if="viewMode === 'table'">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Tel</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Postcode</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
 
              <TableBody>
                <TableRow v-for="supplier in filteredSuppliers" :key="supplier.id">
                  <!-- Name -->
                  <TableCell>
                    <div
                      v-if="editingCell?.id === supplier.id && editingCell.field === 'name'"
                      className="flex items-center gap-1"
                    >
                      <Input
                        className="h-8"
                        :value="editValue"
                        autofocus
                        @input="editValue = $event?.target?.value"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        @click="handleCellSave(supplier)"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        @click="handleCellCancel"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
 
                    <div
                      v-else
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                      @click="handleCellEdit(supplier, 'name')"
                    >
                      {{ supplier.name }}
                    </div>
                  </TableCell>
 
                  <!-- Email -->
                  <TableCell>
                    <div
                      v-if="editingCell?.id === supplier.id && editingCell.field === 'email'"
                      className="flex items-center gap-1"
                    >
                      <Input
                        type="email"
                        className="h-8"
                        :value="editValue"
                        autofocus
                        @input="editValue = $event?.target?.value"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        @click="handleCellSave(supplier)"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        @click="handleCellCancel"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
 
                    <div
                      v-else
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                      @click="handleCellEdit(supplier, 'email')"
                    >
                      {{ supplier.email }}
                    </div>
                  </TableCell>
 
                  <!-- Tel -->
                  <TableCell>
                    <div
                      v-if="editingCell?.id === supplier.id && editingCell.field === 'tel'"
                      className="flex items-center gap-1"
                    >
                      <Input
                        className="h-8"
                        :value="editValue"
                        autofocus
                        @input="editValue = $event?.target?.value"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        @click="handleCellSave(supplier)"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        @click="handleCellCancel"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
 
                    <div
                      v-else
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                      @click="handleCellEdit(supplier, 'tel')"
                    >
                      {{ supplier.tel }}
                    </div>
                  </TableCell>
 
                  <!-- Address -->
                  <TableCell>
                    <div
                      v-if="editingCell?.id === supplier.id && editingCell.field === 'address'"
                      className="flex items-center gap-1"
                    >
                      <Input
                        className="h-8"
                        :value="editValue"
                        autofocus
                        @input="editValue = $event?.target?.value"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        @click="handleCellSave(supplier)"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        @click="handleCellCancel"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
 
                    <div
                      v-else
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                      @click="handleCellEdit(supplier, 'address')"
                    >
                      {{ supplier.address }}
                    </div>
                  </TableCell>
 
                  <!-- City -->
                  <TableCell>
                    <div
                      v-if="editingCell?.id === supplier.id && editingCell.field === 'city'"
                      className="flex items-center gap-1"
                    >
                      <Input
                        className="h-8"
                        :value="editValue"
                        autofocus
                        @input="editValue = $event?.target?.value"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        @click="handleCellSave(supplier)"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        @click="handleCellCancel"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
 
                    <div
                      v-else
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                      @click="handleCellEdit(supplier, 'city')"
                    >
                      {{ supplier.city }}
                    </div>
                  </TableCell>
 
                  <!-- Postcode -->
                  <TableCell>
                    <div
                      v-if="editingCell?.id === supplier.id && editingCell.field === 'postcode'"
                      className="flex items-center gap-1"
                    >
                      <Input
                        className="h-8"
                        :value="editValue"
                        autofocus
                        @input="editValue = $event?.target?.value"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        @click="handleCellSave(supplier)"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        @click="handleCellCancel"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
 
                    <div
                      v-else
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                      @click="handleCellEdit(supplier, 'postcode')"
                    >
                      {{ supplier.postcode }}
                    </div>
                  </TableCell>
 
                  <!-- Site -->
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">
                            {{ formatSiteDisplay(supplier.sites).display }}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{{ formatSiteDisplay(supplier.sites).full }}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
 
                  <!-- Actions -->
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" @click="handleEdit(supplier)">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="handleDeleteClick(supplier)">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
 
        <div v-else>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <Card v-for="supplier in filteredSuppliers" :key="supplier.id" className="overflow-hidden">
              <div className="relative">
                <ImageWithFallback
                  v-if="supplier.picture"
                  :src="supplier.picture"
                  :alt="supplier.name"
                  className="w-full h-48 object-cover"
                />
                <div
                  v-else
                  className="w-full h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                >
                  <Users className="w-16 h-16 text-gray-400 dark:text-gray-500" />
                </div>
 
                <!-- Top Overlay: Name, Edit, and Delete -->
                <div
                  className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-3 flex items-start justify-between"
                >
                  <h3 className="text-white font-semibold truncate flex-1">
                    {{ supplier.name }}
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/20"
                      @click="handleEdit(supplier)"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/20"
                      @click="handleDeleteClick(supplier)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
 
                <!-- Bottom Overlay: Email and City -->
                <div
                  className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3"
                >
                  <p className="text-white text-sm truncate">{{ supplier.email }}</p>
                  <p className="text-white text-sm truncate">{{ supplier.city }}</p>
                </div>
              </div>
 
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Tel:</span>
                    <span>{{ supplier.tel }}</span>
                  </div>
 
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Site:</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default truncate">
                            {{ formatSiteDisplay(supplier.sites).display }}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{{ formatSiteDisplay(supplier.sites).full }}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
 
    <AddEditSupplierDialog
      v-if="showDialog"
      :supplier="editingSupplier"
      :spaces="spaces"
      :onSave="handleSave"
      :onCancel="handleCancel"
    />
 
    <Dialog
      v-if="deleteConfirmation"
      :open="true"
      :onOpenChange="handleDeleteCancel"
    >
      <DialogContent aria-describedby="delete-supplier-description">
        <DialogHeader>
          <DialogTitle>Delete Supplier</DialogTitle>
          <DialogDescription id="delete-supplier-description">
            Are you sure you want to delete <strong>{{ deleteConfirmation.name }}</strong>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
 
        <div className="py-4">
          <Label for="delete-confirm">Type "delete" to confirm</Label>
          <Input
            id="delete-confirm"
            placeholder="delete"
            className="mt-2"
            :value="deleteInput"
            @input="deleteInput = $event?.target?.value"
          />
        </div>
 
        <DialogFooter>
          <Button variant="outline" @click="handleDeleteCancel">
            Cancel
          </Button>
          <Button
            variant="destructive"
            :disabled="(deleteInput || '').toLowerCase() !== 'delete'"
            @click="handleDeleteConfirm"
          >
            Delete Supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  
</template>

<script>
import {
  Plus,
  Search,
  LayoutGrid,
  LayoutList,
  Users,
  Check,
  X,
  Menu,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-vue-next";
import Label from "../ui/label.vue";
import Card from "../ui/card.vue";
import CardHeader from "../ui/cardHeader.vue";
import CardTitle from "../ui/cardTitle.vue";
import CardContent from "../ui/cardContent.vue";
import Button from "../ui/button.vue";
import Input from "../ui/input.vue";
import Table from "../ui/table.vue";
import TableHeader from "../ui/tableHeader.vue";
import TableBody from "../ui/tableBody.vue";
import TableRow from "../ui/tableRow.vue";
import TableHead from "../ui/tableHead.vue";
import TableCell from "../ui/tableCell.vue";
import Dialog from "../ui/dialog.vue";
import DialogContent from "../ui/dialogContent.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";
import DialogDescription from "../ui/dialogDescription.vue";
import DialogFooter from "../ui/dialogFooter.vue";
import Tooltip from "../ui/tooltip.vue";
import TooltipTrigger from "../ui/tooltipTrigger.vue";
import TooltipContent from "../ui/tooltipContent.vue";
import TooltipProvider from "../ui/tooltipProvider.vue";
import ImageWithFallback from "../figma/ImageWithFallBack.vue";
import AddEditSupplierDialog from "./AddEditSupplierDialog.vue";
export default {
  name: "SuppliersList",
  components: {
    Plus,
    Search,
    LayoutGrid,
    LayoutList,
    Users,
    Check,
    X,
    Pencil,
    Trash2,
    Menu,
    Loader2,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button,
    Input,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
    ImageWithFallback,
    AddEditSupplierDialog,
    Label
  },
  props: {
    suppliers: {
      type: Array,
      default: () => [],
    },
    spaces: {
      type: Array,
      default: () => [],
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
    // callbacks vers le parent (équivalents à onSave / onDelete dans React)
    onSave: {
      type: Function,
      default: null,
    },
    onDelete: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      searchQuery: "",
      showDialog: false,
      editingSupplier: null, // SupplierItem | null
      viewMode: "card", // "table" | "card"
      editingCell: null, // { id: string, field: string } | null
      editValue: "",
      deleteConfirmation: null, // { id: string, name: string } | null
      deleteInput: "",
    };
  },

  computed: {
    filteredSuppliers() {
      return (this.suppliers || []).filter((supplier) => {
        const q = (this.searchQuery || "").toLowerCase();

        return (
          (supplier.name || "").toLowerCase().includes(q) ||
          (supplier.email || "").toLowerCase().includes(q) ||
          (supplier.city || "").toLowerCase().includes(q)
        );
      });
    },
  },

  methods: {
    handleAdd() {
      this.editingSupplier = null;
      this.showDialog = true;
    },

    handleEdit(supplier) {
      this.editingSupplier = supplier;
      this.showDialog = true;
    },

    handleSave(supplier) {
      this.onSave(supplier);
      this.showDialog = false;
      this.editingSupplier = null;
    },

    handleCancel() {
      this.showDialog = false;
      this.editingSupplier = null;
    },

    getSiteNames(siteIds) {
      if (!siteIds || !Array.isArray(siteIds) || siteIds.length === 0) {
        return "All Sites";
      }

      const siteNames = siteIds
        .map((id) => this.spaces.find((s) => s.id === id)?.name || id)
        .filter((name) => name);

      return siteNames.length > 0 ? siteNames.join(", ") : "All Sites";
    },

    formatSiteDisplay(siteIds) {
      const allSiteIds = (this.spaces || []).map((s) => s.id);
      const isAllSites =
        !siteIds ||
        siteIds.length === 0 ||
        (siteIds.length === allSiteIds.length &&
          allSiteIds.every((id) => siteIds.includes(id)));

      if (isAllSites) {
        return { display: "All", full: "All Sites" };
      }

      const siteNames = siteIds
        .map((id) => this.spaces.find((s) => s.id === id)?.name || id)
        .filter((name) => name);

      const fullText = siteNames.join(", ");
      const truncated =
        fullText.length > 20 ? fullText.substring(0, 20) + "..." : fullText;

      return {
        display: `(${siteNames.length}) ${truncated}`,
        full: fullText,
      };
    },

    handleCellEdit(supplier, field) {
      this.editingCell = { id: supplier.id, field };
      this.editValue = supplier?.[field] || "";
    },

    handleCellSave(supplier) {
      if (this.editingCell) {
        const updatedSupplier = {
          ...supplier,
          [this.editingCell.field]: this.editValue,
        };

        this.onSave(updatedSupplier);
        this.editingCell = null;
        this.editValue = "";
      }
    },

    handleCellCancel() {
      this.editingCell = null;
      this.editValue = "";
    },

    handlePictureUpload(supplier, e) {
      const file = e?.target?.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const updatedSupplier = {
            ...supplier,
            picture: reader.result,
          };
          this.onSave(updatedSupplier);
        };
        reader.readAsDataURL(file);
      }
    },

    handleDeleteClick(supplier) {
      this.deleteConfirmation = { id: supplier.id, name: supplier.name };
      this.deleteInput = "";
    },

    handleDeleteConfirm() {
      if (
        this.deleteConfirmation &&
        (this.deleteInput || "").toLowerCase() === "delete"
      ) {
        this.onDelete(this.deleteConfirmation.id);
        this.deleteConfirmation = null;
        this.deleteInput = "";
      }
    },

    handleDeleteCancel() {
      this.deleteConfirmation = null;
      this.deleteInput = "";
    },
  },

  watch: {
    // Debug: Log spaces when they change
    spaces: {
      handler(newVal) {
        console.log("SuppliersList - Spaces prop updated:", newVal);
      },
      immediate: true,
    },
  },
};
</script>
