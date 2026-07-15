<template>
  <div>
    <div :class="isMobile ? 'flex flex-col gap-2 w-full' : 'flex items-center gap-2'">
      <div :class="isMobile ? 'flex items-center justify-between w-full gap-2' : 'flex items-center gap-2'">
        <Input
          :value="configName"
          @input="handleNameChange"
          @blur="handleNameBlur"
          @focus="isEditing = true"
          @keydown="handleNameKeyDown"
          placeholder="Add configuration title"
          :class="`h-8 bg-white border-none shadow-none p-0 pl-2 focus-visible:ring-0 focus-visible:ring-offset-0 ${
            isMobile ? 'flex-1' : 'w-52'
          }`"
          :style="{ fontSize: isMobile ? '1rem' : '0.8rem' }"
        />
        
        <Input
          :value="capacity"
          @input="handleCapacityChange"
          placeholder="Capacity"
          type="text"
          inputmode="numeric"
          :class="`h-8 bg-white border-none shadow-none p-0 pl-2 focus-visible:ring-0 focus-visible:ring-offset-0 ${isMobile ? 'w-24' : 'w-16'}`"
          :style="{ fontSize: isMobile ? '1rem' : '0.8rem' }"
        />
        
        <DropdownMenu :open="menuOpen" @update:open="menuOpen = $event">
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="h-8 w-8 flex-shrink-0">
              <Folder class="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="start" 
            :class="isMobile ? 'w-screen ml-0' : 'w-64'"
            :side-offset="isMobile ? 8 : 4"
          >
            <DropdownMenuItem @click="handleSave">
              Save
            </DropdownMenuItem>
            <DropdownMenuItem @click="onDuplicate">
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleNewConfig">
              New configuration
            </DropdownMenuItem>
            <DropdownMenuItem 
              v-if="currentConfigId"
              @click="handleDeleteClick"
              class="text-red-600 focus:text-red-600"
            >
              <Trash2 class="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
            
            <template v-if="configurations.length > 0">
              <DropdownMenuSeparator />
              <div class="max-h-64 overflow-y-auto">
                <DropdownMenuItem
                  v-for="config in configurations"
                  :key="config.id"
                  @click="handleLoadConfig(config.id)"
                  :class="config.id === currentConfigId ? 'bg-gray-100' : ''"
                >
                  <span class="flex-1 truncate">
                    {{ config.name }}
                    <span v-if="config.id === currentConfigId && hasUnsavedChanges" class="text-orange-600 ml-1">*</span>
                  </span>
                  <span v-if="config.capacity !== undefined" class="ml-2 text-gray-500">
                    {{ config.capacity }}
                  </span>
                </DropdownMenuItem>
              </div>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- Unsaved Changes Warning -->
    <AlertDialog :open="showUnsavedWarning" @update:open="showUnsavedWarning = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes in the current configuration. If you continue, your changes will be lost. Do you want to save first?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            @click="handleConfirmAction"
            class="bg-red-600 hover:bg-red-700"
          >
            Discard Changes
          </AlertDialogAction>
          <AlertDialogAction
            @click="handleConfirmActionWithSave"
          >
            Save and Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Delete Warning -->
    <AlertDialog :open="showDeleteWarning" @update:open="showDeleteWarning = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Configuration</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this configuration? This action cannot be undone. A new configuration will be created.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            @click="handleConfirmDelete"
            class="bg-red-600 hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script>
import Input  from '../ui/input.vue'
import Button from '../ui/button.vue'

import DropdownMenu from '../ui/dropdownMenu.vue'
import DropdownMenuContent from '../ui/dropdownMenuContent.vue'
import DropdownMenuItem from '../ui/dropdownMenuItem.vue'
import DropdownMenuSeparator from '../ui/dropdownMenuSeparator.vue'
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue'
import AlertDialog from '../ui/alertDialog.vue'
import AlertDialogAction from '../ui/alertDialogAction.vue'
import AlertDialogCancel from '../ui/alertDialogCancel.vue'
import AlertDialogContent from '../ui/alertDialogContent.vue'
import AlertDialogDescription from '../ui/alertDialogDescription.vue'
import AlertDialogFooter from '../ui/alertDialogFooter.vue'
import AlertDialogHeader from '../ui/alertDialogHeader.vue'
import AlertDialogTitle from '../ui/alertDialogTitle.vue'
import { Folder, Trash2 } from 'lucide-vue-next'

export default {
  name: 'ConfigurationControl',
  components: {
    Input,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Folder,
    Trash2
  },
  props: {
    configurations: {
      type: Array,
      default: () => []
    },
    currentConfigId: {
      type: String,
      default: null
    },
    hasUnsavedChanges: {
      type: Boolean,
      default: false
    },
    onSave: {
      type: Function,
      required: true
    },
    onLoad: {
      type: Function,
      required: true
    },
    onNew: {
      type: Function,
      required: true
    },
    onDuplicate: {
      type: Function,
      required: true
    },
    onRename: {
      type: Function,
      required: true
    },
    onDelete: {
      type: Function,
      required: true
    }
  },
  emits: ['save', 'load', 'new', 'duplicate', 'rename', 'delete'],
  data() {
    return {
      configName: '',
      capacity: '',
      showUnsavedWarning: false,
      showDeleteWarning: false,
      pendingAction: null,
      isEditing: false,
      menuOpen: false,
      isMobile: false // Ajuste selon ton hook useIsMobile
    }
  },
  computed: {
    currentConfig() {
      return this.configurations.find(c => c.id === this.currentConfigId) || null
    }
  },
  mounted() {
    // Update the displayed name and capacity when the current config changes
    this.updateDisplayedValues()
  },
  watch: {
    currentConfig() {
      this.updateDisplayedValues()
    }
  },
  methods: {
    updateDisplayedValues() {
      if (this.currentConfig) {
        this.configName = this.currentConfig.name
        this.capacity = this.currentConfig.capacity?.toString() || ''
      } else {
        this.configName = ''
        this.capacity = ''
      }
    },
    handleNameChange(newName) {
      this.configName = newName
    },
    handleNameBlur() {
      this.isEditing = false
      if (this.currentConfig && this.configName.trim() && this.configName !== this.currentConfig.name) {
        this.onRename(this.configName.trim())
      } else if (!this.currentConfig && this.configName.trim()) {
        // Save as new configuration with the entered name
        this.onSave(this.configName.trim())
      }
    },
    handleNameKeyDown(e) {
      if (e.key === 'Enter') {
        e.target.blur()
      } else if (e.key === 'Escape') {
        this.configName = this.currentConfig?.name || ''
        this.isEditing = false
      }
    },
    handleSave() {
      const capacityNumber = this.capacity.trim() ? parseInt(this.capacity.trim(), 10) : undefined
      if (this.currentConfig) {
        this.onSave(this.currentConfig.name, capacityNumber)
      } else {
        const nameToSave = this.configName.trim() || 'Untitled configuration'
        this.onSave(nameToSave, capacityNumber)
        // Update the input to show the saved name if it was empty
        if (!this.configName.trim()) {
          this.configName = 'Untitled configuration'
        }
      }
    },
    handleCapacityChange(value) {
      // Only allow integers (no decimals)
      if (value === '' || /^\d+$/.test(value)) {
        this.capacity = value
      }
    },
    handleActionWithWarning(action) {
      // Always execute if no unsaved changes
      if (!this.hasUnsavedChanges) {
        action()
        return
      }
      
      // Check if the current config is effectively empty (only default floor with no elements)
      // In this case, skip the warning and just execute the action
      const isConfigEmpty = !this.currentConfigId && !this.capacity.trim() && !this.configName.trim()
      
      if (isConfigEmpty) {
        action()
      } else {
        this.pendingAction = action
        this.showUnsavedWarning = true
      }
    },
    handleConfirmAction() {
      if (this.pendingAction) {
        this.pendingAction()
        this.pendingAction = null
      }
      this.showUnsavedWarning = false
    },
    handleConfirmActionWithSave() {
      this.handleSave()
      if (this.pendingAction) {
        this.pendingAction()
        this.pendingAction = null
      }
      this.showUnsavedWarning = false
    },
    handleLoadConfig(configId) {
      this.handleActionWithWarning(() => this.onLoad(configId))
    },
    handleNewConfig() {
      this.handleActionWithWarning(() => this.onNew())
    },
    handleDeleteClick() {
      this.showDeleteWarning = true
    },
    handleConfirmDelete() {
      this.onDelete()
      this.showDeleteWarning = false
    }
  }
}
</script>