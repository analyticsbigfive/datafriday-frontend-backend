<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- Header Image / Title Section -->
    <div class="relative">
      <div v-if="element.image" class="relative h-48 overflow-hidden">
        <img
          :src="element.image"
          :alt="element.name"
          class="w-full h-full object-cover"
        />
        <div
          class="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent"
        />
        <div class="absolute top-0 left-0 right-0 p-4">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="text-white/80 text-xs mb-1">
                {{ getTypeLabel(element.type) }}
              </div>
              <Input
                :value="formData.name"
                @input="(e) => handleUpdate('name', e.target.value)"
                class="bg-transparent border-none text-white text-lg p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <div class="flex gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                @click="$refs.fileInputRef && $refs.fileInputRef.click()"
                class="text-white hover:bg-white/20"
                title="Change image"
              >
                <Camera class="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="handleRemoveImage"
                class="text-white hover:bg-white/20"
                title="Remove image"
              >
                <X class="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="onDuplicate && onDuplicate()"
                class="text-white hover:bg-white/20"
                title="Duplicate"
              >
                <Copy class="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="onDelete && onDelete(true)"
                class="text-white hover:bg-white/20"
                title="Delete"
              >
                <Trash2 class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="p-4 border-b">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg">Properties</h2>
          <div class="flex gap-2">
            <Button
              v-if="onClose"
              variant="ghost"
              size="sm"
              @click="onClose && onClose()"
            >
              <X class="w-4 h-4 text-gray-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              @click="$refs.fileInputRef && $refs.fileInputRef.click()"
              title="Upload image"
            >
              <Upload class="w-4 h-4 text-gray-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              @click="onDuplicate && onDuplicate()"
            >
              <Copy class="w-4 h-4 text-blue-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              @click="deleteDialogOpen = true"
            >
              <Trash2 class="w-4 h-4 text-red-600" />
            </Button>
          </div>
        </div>

        <div>
          <div
            class="inline-block px-3 py-1 rounded-full text-sm"
            :class="getTypeColor(element.type)"
          >
            {{ getTypeLabel(element.type) }}
          </div>
        </div>
      </div>

      <!-- Hidden file input -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        class="hidden"
        @change="handleImageUpload"
      />
    </div>

    <!-- Scrollable content (les sections détaillées seront portées ensuite) -->
    <div class="flex-1 overflow-y-auto p-4">
      <div class="space-y-4">
        <div v-if="!element.image" class="space-y-2">
          <Label>Name</Label>
          <Input
            :value="formData.name"
            @input="(e) => handleUpdate('name', e.target.value)"
          />
        </div>
        <!-- Shop Type Selection -->
        <template v-if="element.type === 'shop'">
          <Separator />
          <Collapsible :open="shopTypeOpen" @update:open="(v) => (shopTypeOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Shop Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="shopTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'food', label: 'Food' },
                    { value: 'beverages', label: 'Beverages' },
                    { value: 'beer', label: 'Beer' },
                    { value: 'gppremium', label: 'GP Premium' },
                    { value: 'temporary', label: 'Temporary' },
                    { value: 'drinkee', label: 'Drinkee' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`shoptype-${type.value}`"
                    :modelValue="(element.shopType || []).includes(type.value)"
                    @update:modelValue="(checked) => {
                      const currentTypes = element.shopType || [];
                      const newTypes = checked
                        ? Array.from(new Set([...currentTypes, type.value]))
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ shopType: newTypes });
                    }"
                  />
                  <label
                    :for="`shoptype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Configuration Selection - for F&B elements with registryId -->
        <template
          v-if="
            element.registryId &&
            fbElementsRegistry &&
            fbElementsRegistry[element.registryId] &&
            configurations &&
            configurations.length > 0
          "
        >
          <Separator />
          <Collapsible
            :open="configurationOpen"
            @update:open="(v) => (configurationOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Configuration</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="configurationOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <p class="text-xs text-gray-500 mb-2">
                  Select configurations where this element should appear
                </p>
                <div
                  v-for="config in configurations"
                  :key="config.id"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`config-${config.id}`"
                    :checked="
                      !!(
                        fbElementsRegistry[element.registryId] &&
                        fbElementsRegistry[element.registryId].configurations &&
                        config.id in fbElementsRegistry[element.registryId].configurations
                      )
                    "
                    :disabled="config.id === currentConfigId"
                    @update:checked="(checked) => {
                      if (checked) {
                        onAddToConfiguration && onAddToConfiguration(config.id);
                      } else {
                        onRemoveFromConfiguration && onRemoveFromConfiguration(config.id);
                      }
                    }"
                  />
                  <label
                    :for="`config-${config.id}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ config.name }}
                    <span
                      v-if="config.id === currentConfigId"
                      class="text-xs text-gray-500 ml-2"
                    >
                      (current)
                    </span>
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Shops Selection - for Storage elements -->
        <template v-if="element.type === 'storage' && allFBElements && allFBElements.length">
          <Separator />
          <Collapsible :open="shopsOpen" @update:open="(v) => (shopsOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Shops</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="shopsOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <p class="text-xs text-gray-500 mb-2">
                  Select F&B Elements that use this storage
                </p>
                <div
                  v-for="fbElement in allFBElements"
                  :key="fbElement.id"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`shop-${fbElement.id}`"
                    :checked="(element.selectedShops && element.selectedShops.includes(fbElement.id)) || false"
                    @update:checked="(checked) => {
                      const currentShops = element.selectedShops || [];
                      const newShops = checked
                        ? [...currentShops, fbElement.id]
                        : currentShops.filter((id) => id !== fbElement.id);
                      onUpdate && onUpdate({ selectedShops: newShops });
                    }"
                  />
                  <label
                    :for="`shop-${fbElement.id}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ fbElement.name }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Storage Type Selection -->
        <template v-if="element.type === 'storage'">
          <Separator />
          <Collapsible
            :open="storageTypeOpen"
            @update:open="(v) => (storageTypeOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Storage Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="storageTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'dry', label: 'Dry storage' },
                    { value: 'cold', label: 'Cold storage' },
                    { value: 'belowzero', label: 'Below zero storage' },
                    { value: 'material', label: 'Material storage' },
                    { value: 'merch', label: 'Merch storage' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`storagetype-${type.value}`"
                    :checked="
                      (element.storageType && element.storageType.includes(type.value)) ||
                      false
                    "
                    @update:checked="(checked) => {
                      const currentTypes = element.storageType || [];
                      const newTypes = checked
                        ? [...currentTypes, type.value]
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ storageType: newTypes });
                    }"
                  />
                  <label
                    :for="`storagetype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Hospitality Type Selection -->
        <template v-if="element.type === 'hospitality'">
          <Separator />
          <Collapsible
            :open="hospitalityTypeOpen"
            @update:open="(v) => (hospitalityTypeOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Hospitality Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="hospitalityTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'lodges', label: 'Lodges' },
                    { value: 'salon', label: 'Salon' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`hospitalitytype-${type.value}`"
                    :checked="
                      (element.hospitalityType &&
                        element.hospitalityType.includes(type.value)) ||
                      false
                    "
                    @update:checked="(checked) => {
                      const currentTypes = element.hospitalityType || [];
                      const newTypes = checked
                        ? [...currentTypes, type.value]
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ hospitalityType: newTypes });
                    }"
                  />
                  <label
                    :for="`hospitalitytype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Merch Type Selection -->
        <template v-if="element.type === 'merchshop'">
          <Separator />
          <Collapsible :open="merchTypeOpen" @update:open="(v) => (merchTypeOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Merch Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="merchTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'onsite', label: 'On site' },
                    { value: 'offsite', label: 'Off site' },
                    { value: 'temporary', label: 'Temporary' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`merchtype-${type.value}`"
                    :checked="
                      (element.merchType && element.merchType.includes(type.value)) ||
                      false
                    "
                    @update:checked="(checked) => {
                      const currentTypes = element.merchType || [];
                      const newTypes = checked
                        ? [...currentTypes, type.value]
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ merchType: newTypes });
                    }"
                  />
                  <label
                    :for="`merchtype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Access Type Selection -->
        <template v-if="element.type === 'access'">
          <Separator />
          <Collapsible :open="accessTypeOpen" @update:open="(v) => (accessTypeOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Access Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="accessTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'lift', label: 'Lift' },
                    { value: 'staircase', label: 'Staircase' },
                    { value: 'servicelift', label: 'Service Lift' },
                    { value: 'venueentrance', label: 'Venue Entrance' },
                    { value: 'parking', label: 'Parking' },
                    { value: 'reception', label: 'Reception' },
                    { value: 'information', label: 'Information' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`accesstype-${type.value}`"
                    :checked="
                      (element.accessType && element.accessType.includes(type.value)) ||
                      false
                    "
                    @update:checked="(checked) => {
                      const currentTypes = element.accessType || [];
                      const newTypes = checked
                        ? [...currentTypes, type.value]
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ accessType: newTypes });
                    }"
                  />
                  <label
                    :for="`accesstype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Entertainment Type Selection -->
        <template v-if="element.type === 'entertainment'">
          <Separator />
          <Collapsible
            :open="entertainmentTypeOpen"
            @update:open="(v) => (entertainmentTypeOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Entertainment Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="entertainmentTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'sportground', label: 'Sport Ground' },
                    { value: 'stage', label: 'Stage' },
                    { value: 'mice', label: 'M.I.C.E.' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`entertainmenttype-${type.value}`"
                    :checked="
                      (element.entertainmentType &&
                        element.entertainmentType.includes(type.value)) ||
                      false
                    "
                    @update:checked="(checked) => {
                      const currentTypes = element.entertainmentType || [];
                      const newTypes = checked
                        ? [...currentTypes, type.value]
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ entertainmentType: newTypes });
                    }"
                  />
                  <label
                    :for="`entertainmenttype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Entrance Type Selection -->
        <template v-if="element.type === 'entrance'">
          <Separator />
          <Collapsible
            :open="entranceTypeOpen"
            @update:open="(v) => (entranceTypeOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Ticketing Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="entranceTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'public', label: 'Public' },
                    { value: 'vip', label: 'VIP' },
                    { value: 'staff', label: 'Staff' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`entrancetype-${type.value}`"
                    :checked="
                      (element.entranceType && element.entranceType.includes(type.value)) ||
                      false
                    "
                    @update:checked="(checked) => {
                      const currentTypes = element.entranceType || [];
                      const newTypes = checked
                        ? [...currentTypes, type.value]
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ entranceType: newTypes });
                    }"
                  />
                  <label
                    :for="`entrancetype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          
          <!-- Performance, Staff, and Inventory sections for entrance (ticketing) -->
          <Separator />

          <!-- Performance Section (entrance) -->
          <Collapsible
            :open="performanceOpen"
            @update:open="(v) => (performanceOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Performance</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="performanceOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <div class="space-y-2">
                  <Label>Revenue</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.revenue || ''"
                    @input="(e) =>
                      handleUpdatePerformance('revenue', parseFloat(e.target.value) || 0)
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Number of POS</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.numberOfPOS || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'numberOfPOS',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Number of Transactions</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.numberOfTransactions || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'numberOfTransactions',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Transactions per Minute</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.transactionsPerMinute || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'transactionsPerMinute',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Staff Cost</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.staffCost || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'staffCost',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Revenue per Employee</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.revenuePerEmployee || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'revenuePerEmployee',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <!-- Staff Section (entrance) -->
          <Collapsible :open="staffOpen" @update:open="(v) => (staffOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Staff</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="staffOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <div class="flex gap-2">
                  <Input
                    placeholder="e.g., Cashier, Cook, Security"
                    :value="newStaffPosition"
                    @input="(e) => (newStaffPosition = e.target.value)"
                    @keydown.enter.prevent="handleAddStaffPosition"
                    class="flex-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Count"
                    :value="newStaffCount"
                    @input="(e) =>
                      (newStaffCount = parseInt(e.target.value) || 1)
                    "
                    @keydown.enter.prevent="handleAddStaffPosition"
                    class="w-20"
                  />
                  <Button
                    size="sm"
                    @click="handleAddStaffPosition"
                    :disabled="!newStaffPosition.trim() || newStaffCount < 1"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>

                <div
                  v-if="staffPositions.length > 0"
                  class="space-y-2 max-h-60 overflow-y-auto"
                >
                  <div
                    v-for="position in staffPositions"
                    :key="position.id"
                    class="flex items-center gap-2 bg-gray-50 rounded px-3 py-2"
                  >
                    <span class="text-sm flex-1">{{ position.position }}</span>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      :value="position.count"
                      @input="(e) =>
                        handleUpdateStaffPositionCount(
                          position.id,
                          parseInt(e.target.value) || 1,
                        )
                      "
                      class="w-16 h-8"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="handleDeleteStaffPosition(position.id)"
                    >
                      <X class="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                <p
                  v-else
                  class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                >
                  No staff positions yet. Add one above.
                </p>

                <div v-if="staffPositions.length > 0" class="pt-2 border-t">
                  <div class="text-sm text-gray-600 dark:text-gray-300">
                    Total Staff:
                    {{
                      staffPositions.reduce(
                        (sum, pos) => sum + (pos.count || 0),
                        0,
                      )
                    }}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <!-- Inventory Section (entrance) -->
          <Collapsible
            :open="inventoryOpen"
            @update:open="(v) => (inventoryOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Inventory</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="inventoryOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <!-- Add custom inventory item -->
                <div class="flex gap-2">
                  <Input
                    placeholder="Add custom item..."
                    :value="newInventoryItem"
                    @input="(e) => (newInventoryItem = e.target.value)"
                    @keydown.enter.prevent="handleAddInventoryItem"
                  />
                  <Button
                    size="sm"
                    @click="handleAddInventoryItem"
                    :disabled="!newInventoryItem.trim()"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>

                <div
                  v-if="inventoryItems.length > 0"
                  class="space-y-3 max-h-80 overflow-y-auto"
                >
                  <div
                    v-for="item in inventoryItems"
                    :key="item.id"
                    class="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-2 space-y-2"
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-sm flex-1">{{ item.name }}</span>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        :value="item.quantity || ''"
                        @input="(e) =>
                          handleUpdateInventoryItemQuantity(
                            item.id,
                            parseFloat(e.target.value) || 0,
                          )
                        "
                        class="w-20 h-8"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        @click="handleDeleteInventoryItem(item.id)"
                      >
                        <X class="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-xs text-gray-600 dark:text-gray-300 w-12"
                      >
                        {{ Math.floor((item.quantity || 0) * 0.6) }}
                      </span>
                      <div
                        class="flex-1 h-4 rounded-full overflow-hidden"
                        :style="{
                          background:
                            'linear-gradient(to right, #ef4444, #f97316, #22c55e)',
                        }"
                      >
                        <div
                          class="h-full bg-gray-200 dark:bg-gray-700"
                          :style="{
                            marginLeft:
                              (item.quantity
                                ? (Math.floor((item.quantity || 0) * 0.6) /
                                    item.quantity) *
                                  100
                                : 0) + '%',
                            transition: 'margin-left 0.3s ease',
                          }"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <p
                  v-else
                  class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                >
                  No inventory items yet. Add one above.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Kitchen Type Selection -->
        <template v-if="element.type === 'kitchen'">
          <Separator />
          <Collapsible
            :open="kitchenTypeOpen"
            @update:open="(v) => (kitchenTypeOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <Label class="dark:text-gray-100">Kitchen Type</Label>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="kitchenTypeOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div
                  v-for="type in [
                    { value: 'fb', label: 'F&B' },
                    { value: 'hospitality', label: 'Hospitality' },
                    { value: 'storage', label: 'Storage' },
                  ]"
                  :key="type.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`kitchentype-${type.value}`"
                    :checked="
                      (element.kitchenType && element.kitchenType.includes(type.value)) ||
                      false
                    "
                    @update:checked="(checked) => {
                      const currentTypes = element.kitchenType || [];
                      const newTypes = checked
                        ? [...currentTypes, type.value]
                        : currentTypes.filter((t) => t !== type.value);
                      onUpdate && onUpdate({ kitchenType: newTypes });
                    }"
                  />
                  <label
                    :for="`kitchentype-${type.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ type.label }}
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          
          <!-- Kitchen-specific sections: Inventory, Staff -->
          <Separator />

          <!-- Inventory Section (kitchen) -->
          <Collapsible
            :open="inventoryOpen"
            @update:open="(v) => (inventoryOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Inventory</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="inventoryOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div class="flex gap-2">
                  <Input
                    placeholder="Add inventory item"
                    :value="newInventoryItem"
                    @input="(e) => (newInventoryItem = e.target.value)"
                    @keydown.enter.prevent="handleAddInventoryItem"
                  />
                  <Button @click="handleAddInventoryItem" size="sm">
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>
                <p
                  v-if="inventoryItems.length === 0"
                  class="text-sm text-gray-500 dark:text-gray-400"
                >
                  No inventory items
                </p>
                <div v-else class="space-y-1">
                  <div
                    v-for="item in inventoryItems"
                    :key="item.id"
                    class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded"
                  >
                    <span class="text-sm">{{ item.name }}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="handleRemoveInventoryItem(item.id)"
                    >
                      <X class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <!-- Staff Section (kitchen) -->
          <Collapsible :open="staffOpen" @update:open="(v) => (staffOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Staff</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="staffOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-2 pt-2">
                <div class="flex gap-2">
                  <Input
                    placeholder="Position"
                    :value="newStaffPosition"
                    @input="(e) => (newStaffPosition = e.target.value)"
                  />
                  <Input
                    type="number"
                    min="1"
                    :value="newStaffCount"
                    @input="(e) => (newStaffCount = parseInt(e.target.value) || 1)"
                    class="w-20"
                  />
                  <Button @click="handleAddStaffPosition" size="sm">
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>
                <p v-if="staffPositions.length === 0" class="text-sm text-gray-500">
                  No staff positions
                </p>
                <div v-else class="space-y-1">
                  <div
                    v-for="position in staffPositions"
                    :key="position.id"
                    class="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div>
                      <span class="text-sm">{{ position.position }}</span>
                      <span class="text-xs text-gray-500 ml-2">
                        ({{ position.count }})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="handleRemoveStaffPosition(position.id)"
                    >
                      <X class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Performance section for merchshop -->
        <template v-if="element.type === 'merchshop'">
          <Separator />
          <Collapsible
            :open="performanceOpen"
            @update:open="(v) => (performanceOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Performance</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="performanceOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <div class="space-y-2">
                  <Label>Revenue</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.revenue || ''"
                    @input="(e) =>
                      handleUpdatePerformance('revenue', parseFloat(e.target.value) || 0)
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Number of POS</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.numberOfPOS || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'numberOfPOS',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Number of Transactions</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.numberOfTransactions || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'numberOfTransactions',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Transactions per Minute</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.transactionsPerMinute || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'transactionsPerMinute',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Staff Cost</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.staffCost || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'staffCost',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Revenue per Employee</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.revenuePerEmployee || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'revenuePerEmployee',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <!-- Items Section (for merch products) -->
          <Collapsible :open="itemsOpen" @update:open="(v) => (itemsOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Items</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="itemsOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <div class="flex gap-2">
                  <Input
                    placeholder="e.g., T-shirt, Cap, Scarf"
                    :value="newMenuItem"
                    @input="(e) => (newMenuItem = e.target.value)"
                    @keydown.enter.prevent="handleAddMenuItem"
                  />
                  <Button
                    size="sm"
                    @click="handleAddMenuItem"
                    :disabled="!newMenuItem.trim()"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>

                <div v-if="menuItems.length > 0" class="space-y-2 max-h-60 overflow-y-auto">
                  <div
                    v-for="item in menuItems"
                    :key="item.id"
                    class="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
                  >
                    <span class="text-sm">{{ item.name }}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="handleDeleteMenuItem(item.id)"
                    >
                      <X class="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                <p
                  v-else
                  class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                >
                  No items yet. Add one above.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <!-- Inventory Section (merchshop) -->
          <Collapsible
            :open="inventoryOpen"
            @update:open="(v) => (inventoryOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Inventory</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="inventoryOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <!-- Add custom inventory item -->
                <div class="flex gap-2">
                  <Input
                    placeholder="Add custom item..."
                    :value="newInventoryItem"
                    @input="(e) => (newInventoryItem = e.target.value)"
                    @keydown.enter.prevent="handleAddInventoryItem"
                  />
                  <Button
                    size="sm"
                    @click="handleAddInventoryItem"
                    :disabled="!newInventoryItem.trim()"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>

                <div
                  v-if="inventoryItems.length > 0"
                  class="space-y-3 max-h-80 overflow-y-auto"
                >
                  <div
                    v-for="item in inventoryItems"
                    :key="item.id"
                    class="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-2 space-y-2"
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-sm flex-1">{{ item.name }}</span>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        :value="item.quantity || ''"
                        @input="(e) =>
                          handleUpdateInventoryItemQuantity(
                            item.id,
                            parseFloat(e.target.value) || 0,
                          )
                        "
                        class="w-20 h-8"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        @click="handleDeleteInventoryItem(item.id)"
                      >
                        <X class="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-xs text-gray-600 dark:text-gray-300 w-12"
                      >
                        {{ Math.floor((item.quantity || 0) * 0.6) }}
                      </span>
                      <div
                        class="flex-1 h-4 rounded-full overflow-hidden"
                        :style="{
                          background:
                            'linear-gradient(to right, #ef4444, #f97316, #22c55e)',
                        }"
                      >
                        <div
                          class="h-full bg-gray-200 dark:bg-gray-700"
                          :style="{
                            marginLeft:
                              (item.quantity
                                ? (Math.floor((item.quantity || 0) * 0.6) /
                                    item.quantity) *
                                  100
                                : 0) + '%',
                            transition: 'margin-left 0.3s ease',
                          }"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <p
                  v-else
                  class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                >
                  No inventory items yet. Add one above.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <!-- Staff Section (merchshop) -->
          <Collapsible :open="staffOpen" @update:open="(v) => (staffOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Staff</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="staffOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <div class="flex gap-2">
                  <Input
                    placeholder="e.g., Cashier, Sales Associate"
                    :value="newStaffPosition"
                    @input="(e) => (newStaffPosition = e.target.value)"
                    @keydown.enter.prevent="handleAddStaffPosition"
                    class="flex-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Count"
                    :value="newStaffCount"
                    @input="(e) =>
                      (newStaffCount = parseInt(e.target.value) || 1)
                    "
                    @keydown.enter.prevent="handleAddStaffPosition"
                    class="w-20"
                  />
                  <Button
                    size="sm"
                    @click="handleAddStaffPosition"
                    :disabled="!newStaffPosition.trim() || newStaffCount < 1"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>

                <div
                  v-if="staffPositions.length > 0"
                  class="space-y-2 max-h-60 overflow-y-auto"
                >
                  <div
                    v-for="position in staffPositions"
                    :key="position.id"
                    class="flex items-center gap-2 bg-gray-50 rounded px-3 py-2"
                  >
                    <span class="text-sm flex-1">{{ position.position }}</span>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      :value="position.count"
                      @input="(e) =>
                        handleUpdateStaffPositionCount(
                          position.id,
                          parseInt(e.target.value) || 1,
                        )
                      "
                      class="w-16 h-8"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="handleDeleteStaffPosition(position.id)"
                    >
                      <X class="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                <p
                  v-else
                  class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                >
                  No staff positions yet. Add one above.
                </p>

                <div v-if="staffPositions.length > 0" class="pt-2 border-t">
                  <div class="text-sm text-gray-600 dark:text-gray-300">
                    Total Staff:
                    {{
                      staffPositions.reduce(
                        (sum, pos) => sum + (pos.count || 0),
                        0,
                      )
                    }}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <!-- Performance & Inventory section for shop and hospitality -->
        <template v-if="element.type === 'shop' || element.type === 'hospitality'">
          <Separator />
          <Collapsible
            :open="performanceOpen"
            @update:open="(v) => (performanceOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Performance</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="performanceOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <div class="space-y-2">
                  <Label>Revenue</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.revenue || ''"
                    @input="(e) =>
                      handleUpdatePerformance('revenue', parseFloat(e.target.value) || 0)
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Number of POS</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.numberOfPOS || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'numberOfPOS',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Number of Transactions</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.numberOfTransactions || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'numberOfTransactions',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Transactions per Minute</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.transactionsPerMinute || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'transactionsPerMinute',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Staff Cost</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.staffCost || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'staffCost',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>

                <div class="space-y-2">
                  <Label>Revenue per Employee</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    :value="performance.revenuePerEmployee || ''"
                    @input="(e) =>
                      handleUpdatePerformance(
                        'revenuePerEmployee',
                        parseFloat(e.target.value) || 0,
                      )
                    "
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Menu Section -->
          <Separator />
          <Collapsible :open="menuOpen" @update:open="(v) => (menuOpen = v)">
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Menu</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="menuOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <template v-if="availableMenuItems.length > 0">
                  <!-- Search Input for Menu -->
                  <div class="px-2">
                    <div class="relative">
                      <Search
                        class="absolute left-2 top-2.5 h-4 w-4 text-gray-500"
                      />
                      <Input
                        placeholder="Search menu items..."
                        :value="menuSearchQuery"
                        @input="(e) => (menuSearchQuery = e.target.value)"
                        class="pl-8"
                      />
                    </div>
                  </div>

                  <div class="space-y-2 max-h-60 overflow-y-auto">
                    <template
                      v-if="getFilteredMenuItems(menuSearchQuery).length > 0"
                    >
                      <div
                        v-for="item in getFilteredMenuItems(menuSearchQuery)"
                        :key="item.id"
                        class="flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2"
                      >
                        <img
                          v-if="item.picture"
                          :src="item.picture"
                          :alt="item.name"
                          class="w-10 h-10 rounded object-cover flex-shrink-0"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span
                              class="text-sm font-medium dark:text-gray-100"
                            >
                              {{ item.name }}
                            </span>
                            <span
                              v-if="item.type"
                              class="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded"
                            >
                              {{ item.type }}
                            </span>
                          </div>
                          <p
                            v-if="item.category"
                            class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                          >
                            {{ item.category }}
                          </p>
                          <p
                            v-if="getDisplayPrice(item) > 0"
                            class="text-xs text-gray-700 dark:text-gray-300 mt-0.5"
                          >
                            €{{ getDisplayPrice(item).toFixed(2) }}
                          </p>
                        </div>
                      </div>
                    </template>
                    <div
                      v-else
                      class="text-center py-6 px-4 bg-gray-50 rounded border border-dashed border-gray-300"
                    >
                      <p class="text-sm text-gray-600">
                        No menu items found matching "{{ menuSearchQuery }}"
                      </p>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div
                    class="text-center py-6 px-4 bg-gray-50 rounded border border-dashed border-gray-300"
                  >
                    <p class="text-sm text-gray-600 mb-2">
                      No menu items configured for this element
                    </p>
                    <p class="text-xs text-gray-500">
                      Go to <span class="font-medium">Space Menus</span> to
                      configure menu items for this space and configuration
                    </p>
                  </div>
                </template>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Inventory Section - Consolidated View -->
          <Separator />
          <Collapsible
            :open="inventoryOpen"
            @update:open="(v) => (inventoryOpen = v)"
          >
            <CollapsibleTrigger
              class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
            >
              <h4 class="text-sm dark:text-gray-100">Inventory</h4>
              <ChevronDown
                class="w-4 h-4 transition-transform dark:text-gray-300"
                :class="inventoryOpen ? 'rotate-180' : ''"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <!-- Search Input for Inventory -->
                <div class="px-2">
                  <div class="relative">
                    <Search
                      class="absolute left-2 top-2.5 h-4 w-4 text-gray-500"
                    />
                    <Input
                      placeholder="Search inventory items..."
                      :value="inventorySearchQuery"
                      @input="(e) => (inventorySearchQuery = e.target.value)"
                      class="pl-8"
                    />
                  </div>
                </div>

                <!-- Consolidated Inventory View -->
                <template
                  v-if="availableMenuItems.length > 0 && allMenuItems.length > 0"
                >
                  <div class="space-y-2">
                    <p
                      class="text-xs text-gray-600 dark:text-gray-300 px-2"
                    >
                      Inventory Items
                    </p>
                    <div class="space-y-3 max-h-96 overflow-y-auto">
                      <div
                        v-for="inventoryItem in getFilteredConsolidatedInventory(
                          inventorySearchQuery,
                        )"
                        :key="inventoryItem.id"
                        class="bg-blue-50 dark:bg-blue-950/30 rounded px-3 py-2 space-y-2"
                      >
                        <!-- Main inventory item -->
                        <div class="flex items-center gap-2">
                          <span class="text-sm flex-1">
                            {{ inventoryItem.name }}
                          </span>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0.0"
                            :value="
                              getExistingInventoryItem(inventoryItem)?.quantity || ''
                            "
                            @input="(e) =>
                              handleConsolidatedQuantityChange(
                                inventoryItem,
                                parseFloat(e.target.value) || 0,
                              )
                            "
                            class="w-20 h-8"
                          />
                        </div>

                        <!-- Stock level indicator -->
                        <div
                          v-if="getExistingInventoryItem(inventoryItem)?.quantity"
                          class="flex items-center gap-2"
                        >
                          <span
                            class="text-xs text-gray-600 dark:text-gray-300 w-12"
                          >
                            {{
                              getInventoryStockInfo(inventoryItem).currentStock
                            }}
                          </span>
                          <div
                            class="flex-1 h-4 rounded-full overflow-hidden"
                            :style="{
                              background:
                                'linear-gradient(to right, #ef4444, #f97316, #22c55e)',
                            }"
                          >
                            <div
                              class="h-full bg-gray-200 dark:bg-gray-700"
                              :style="{
                                marginLeft:
                                  getInventoryStockInfo(inventoryItem)
                                    .stockPercentage + '%',
                                transition: 'margin-left 0.3s ease',
                              }"
                            />
                          </div>
                        </div>

                        <!-- Show which menu items use this inventory item -->
                        <div
                          v-if="
                            inventoryItem.usedIn &&
                            inventoryItem.usedIn.length > 0
                          "
                          class="pl-2 space-y-1 border-l-2 border-blue-300 dark:border-blue-700 ml-1"
                        >
                          <p
                            class="text-xs font-medium text-blue-700 dark:text-blue-400"
                          >
                            Used in:
                          </p>
                          <div
                            v-for="menuItem in inventoryItem.usedIn"
                            :key="menuItem.id"
                            class="flex items-center gap-2 pl-2"
                          >
                            <img
                              v-if="menuItem.picture"
                              :src="menuItem.picture"
                              :alt="menuItem.name"
                              class="w-5 h-5 rounded object-cover flex-shrink-0"
                            />
                            <p
                              class="text-xs text-gray-700 dark:text-gray-300"
                            >
                              • {{ menuItem.name }}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Custom Inventory Items (excluding consolidated) -->
                  <Separator class="my-2" />
                  <div class="space-y-2">
                    <p
                      class="text-xs text-gray-600 dark:text-gray-300 px-2"
                    >
                      Custom Inventory Items
                    </p>
                    <div
                      v-if="
                        getFilteredCustomInventoryItems(inventorySearchQuery)
                          .length > 0
                      "
                      class="space-y-3 max-h-60 overflow-y-auto"
                    >
                      <div
                        v-for="item in getFilteredCustomInventoryItems(
                          inventorySearchQuery,
                        )"
                        :key="item.id"
                        class="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-2 space-y-2"
                      >
                        <div class="flex items-center gap-2">
                          <span class="text-sm flex-1">{{ item.name }}</span>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0.0"
                            :value="item.quantity || ''"
                            @input="(e) =>
                              handleUpdateInventoryItemQuantity(
                                item.id,
                                parseFloat(e.target.value) || 0,
                              )
                            "
                            class="w-20 h-8"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            @click="handleDeleteInventoryItem(item.id)"
                          >
                            <X class="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                        <div class="flex items-center gap-2">
                          <span
                            class="text-xs text-gray-600 dark:text-gray-300 w-12"
                          >
                            {{ Math.floor((item.quantity || 0) * 0.6) }}
                          </span>
                          <div
                            class="flex-1 h-4 rounded-full overflow-hidden"
                            :style="{
                              background:
                                'linear-gradient(to right, #ef4444, #f97316, #22c55e)',
                            }"
                          >
                            <div
                              class="h-full bg-gray-200 dark:bg-gray-700"
                              :style="{
                                marginLeft:
                                  (item.quantity
                                    ? (Math.floor((item.quantity || 0) * 0.6) /
                                        item.quantity) *
                                      100
                                    : 0) + '%',
                                transition: 'margin-left 0.3s ease',
                              }"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <p
                      v-else
                      class="text-xs text-gray-500 dark:text-gray-400 text-center py-2"
                    >
                      No custom inventory items.
                    </p>
                  </div>
                </template>

                <!-- Fallback when no menu items / allMenuItems -->
                <template v-else>
                  <p
                    class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                  >
                    No inventory items yet.
                  </p>
                </template>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </template>

        <template
          v-if="
            ['shop', 'hospitality', 'entertainment'].includes(element.type) ||
            (element.type === 'access' &&
              (element.accessType || []).some((type) =>
                ['venueentrance', 'parking', 'reception', 'information'].includes(type)
              ))
          "
        >
          <Separator />

          <Collapsible :open="staffOpen" @update:open="setStaffOpen">
            <CollapsibleTrigger class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2">
              <h4 class="text-sm dark:text-gray-100">Staff</h4>
              <ChevronDown :class="`w-4 h-4 transition-transform dark:text-gray-300 ${staffOpen ? 'rotate-180' : ''}`" />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div class="space-y-3 pt-2">
                <div class="flex gap-2">
                  <div class="flex-1 min-w-0">
                    <Input
                      placeholder="e.g., Cashier, Sales Associate"
                      :modelValue="newStaffPosition"
                      @update:modelValue="(v) => setNewStaffPosition(v)"
                      @keydown.enter.prevent="handleAddStaffPosition"
                    />
                  </div>
                  <div class="w-20 shrink-0">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Count"
                      :modelValue="String(newStaffCount)"
                      @update:modelValue="(v) => setNewStaffCount(parseInt(v) || 1)"
                      @keydown.enter.prevent="handleAddStaffPosition"
                    />
                  </div>
                  <Button
                    size="sm"
                    :disabled="!String(newStaffPosition || '').trim() || newStaffCount < 1"
                    @click="handleAddStaffPosition"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>

                <div v-if="staffPositions.length > 0" class="space-y-2 max-h-60 overflow-y-auto">
                  <div
                    v-for="position in staffPositions"
                    :key="position.id"
                    class="flex items-center gap-2 bg-gray-50 rounded px-3 py-2"
                  >
                    <span class="text-sm flex-1">{{ position.position }}</span>

                    <Input
                      type="number"
                      min="1"
                      step="1"
                      class="w-16 h-8"
                      :modelValue="String(position.count)"
                      @update:modelValue="(v) => handleUpdateStaffPositionCount(position.id, parseInt(v) || 1)"
                    />

                    <Button variant="ghost" size="sm" @click="handleDeleteStaffPosition(position.id)">
                      <X class="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                <p v-else class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No staff positions yet. Add one above.
                </p>

                <div v-if="staffPositions.length > 0" class="pt-2 border-t">
                  <div class="text-sm text-gray-600 dark:text-gray-300">
                    Total Staff: {{ totalStaff }}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

        <Collapsible :open="positionOpen" @update:open="setPositionOpen">
          <CollapsibleTrigger class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2">
            <h4 class="text-sm dark:text-gray-100">Position</h4>
            <ChevronDown :class="`w-4 h-4 transition-transform dark:text-gray-300 ${positionOpen ? 'rotate-180' : ''}`" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="space-y-4 pt-2">
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label>X Position (m)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    :modelValue="Number(formData.x || 0).toFixed(1)"
                    @update:modelValue="(v) => handleUpdate('x', parseFloat(v) || 0)"
                  />
                </div>
                <div class="space-y-2">
                  <Label>Y Position (m)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    :modelValue="Number(formData.y || 0).toFixed(1)"
                    @update:modelValue="(v) => handleUpdate('y', parseFloat(v) || 0)"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label>Width (m)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    :modelValue="Number(formData.width || 0).toFixed(1)"
                    @update:modelValue="(v) => handleUpdate('width', parseFloat(v) || 0)"
                  />
                </div>
                <div class="space-y-2">
                  <Label>Depth (m)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    :modelValue="Number(formData.depth || 0).toFixed(1)"
                    @update:modelValue="(v) => handleUpdate('depth', parseFloat(v) || 0)"
                  />
                </div>
              </div>

              <div v-if="element.type !== 'parking'" class="space-y-2">
                <Label>Height (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  :modelValue="Number(formData.height || 0).toFixed(1)"
                  @update:modelValue="(v) => handleUpdate('height', parseFloat(v) || 0)"
                />
              </div>

              <Separator />

              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <Label>Corner Radius (m)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 w-8 p-0"
                    @click="setLinkedCorners(!linkedCorners)"
                  >
                    <Link v-if="linkedCorners" class="w-4 h-4" />
                    <Unlink v-else class="w-4 h-4" />
                  </Button>
                </div>

                <div v-if="linkedCorners" class="space-y-2">
                  <Label class="text-xs text-gray-600">All Corners</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    :modelValue="String(formData.cornerRadius.topLeft)"
                    @update:modelValue="(v) => handleCornerRadiusChange('topLeft', parseInt(v) || 0)"
                  />
                </div>

                <div v-else class="grid grid-cols-2 gap-3">
                  <div class="space-y-2">
                    <Label class="text-xs text-gray-600">Top Left</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      :modelValue="String(formData.cornerRadius.topLeft)"
                      @update:modelValue="(v) => handleCornerRadiusChange('topLeft', parseInt(v) || 0)"
                    />
                  </div>
                  <div class="space-y-2">
                    <Label class="text-xs text-gray-600">Top Right</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      :modelValue="String(formData.cornerRadius.topRight)"
                      @update:modelValue="(v) => handleCornerRadiusChange('topRight', parseInt(v) || 0)"
                    />
                  </div>
                  <div class="space-y-2">
                    <Label class="text-xs text-gray-600">Bottom Left</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      :modelValue="String(formData.cornerRadius.bottomLeft)"
                      @update:modelValue="(v) => handleCornerRadiusChange('bottomLeft', parseInt(v) || 0)"
                    />
                  </div>
                  <div class="space-y-2">
                    <Label class="text-xs text-gray-600">Bottom Right</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      :modelValue="String(formData.cornerRadius.bottomRight)"
                      @update:modelValue="(v) => handleCornerRadiusChange('bottomRight', parseInt(v) || 0)"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div class="space-y-2">
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div class="text-gray-500">Floor Area</div>
                    <div class="text-lg">{{ (Number(formData.width) * Number(formData.depth)).toFixed(2) }} m²</div>
                  </div>
                  <div v-if="element.type !== 'parking'">
                    <div class="text-gray-500">Volume</div>
                    <div class="text-lg">
                      {{ (Number(formData.width) * Number(formData.depth) * Number(formData.height)).toFixed(2) }} m³
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        </template>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog :open="deleteDialogOpen" @update:open="(v) => (deleteDialogOpen = v)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-red-600" />
            Delete element
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. You can choose to keep historical data
            for reporting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div class="flex items-center justify-between w-full mb-2">
            <Label class="flex items-center gap-2 text-sm">
              <Checkbox
                :checked="keepHistoricalData"
                @update:checked="(v) => (keepHistoricalData = !!v)"
              />
              Keep historical data
            </Label>
          </div>
          <AlertDialogCancel @click="deleteDialogOpen = false">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            class="bg-red-600 hover:bg-red-700"
            @click="onDelete(keepHistoricalData)"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script>

import Button from '../ui/button.vue';
import Input from '../ui/input.vue';
import Label from '../ui/label.vue';
import Separator from '../ui/separator.vue';
import Checkbox from '../ui/checkbox.vue';

import {
  Trash2,
  Plus,
  ChevronDown,
  X,
  Copy,
  Upload,
  Camera,
  Link,
  Unlink,
  Search,
  AlertTriangle,
} from 'lucide-vue-next';

import AlertDialog from '../ui/alertDialog.vue';
import AlertDialogAction from '../ui/alertDialogAction.vue';
import AlertDialogCancel from '../ui/alertDialogCancel.vue';
import AlertDialogContent from '../ui/alertDialogContent.vue';
import AlertDialogDescription from '../ui/alertDialogDescription.vue';
import AlertDialogFooter from '../ui/alertDialogFooter.vue';
import AlertDialogHeader from '../ui/alertDialogHeader.vue';
import AlertDialogTitle from '../ui/alertDialogTitle.vue';

import Collapsible from '../ui/collapsible.vue';
import CollapsibleContent from '../ui/collapsibleContent.vue';
import CollapsibleTrigger from '../ui/collapsibleTrigger.vue';

import { expandInventoryItems, buildConsolidatedInventory, buildStorageInventory, buildMerchStorageInventory } from '../utils/inventoryUtils';
import * as api from '../utils/api';

export default {
  name: 'PropertiesPanel',

  components: {
    Button,
    Input,
    Label,
    Separator,
    Checkbox,
    Trash2,
    Plus,
    ChevronDown,
    X,
    Copy,
    Upload,
    Camera,
    Unlink,
    Link,
    Search,
    AlertTriangle,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  },

  props: {
    element: {
      type: Object,
      required: true,
    },
    configurations: {
      type: Array,
      default: () => [],
    },
    currentConfigId: {
      type: [String, null],
      default: null,
    },
    fbElementsRegistry: {
      type: Object,
      default: () => ({}),
    },
    onAddToConfiguration: {
      type: Function,
      default: null,
    },
    onRemoveFromConfiguration: {
      type: Function,
      default: null,
    },
    allShopMenuItems: {
      type: Array,
      default: () => [],
    },
    allMerchShopItems: {
      type: Array,
      default: () => [],
    },
    availableMenuItems: {
      type: Array,
      default: () => [],
    },
    allFBElements: {
      type: Array,
      default: () => [],
    },
    allMerchElements: {
      type: Array,
      default: () => [],
    },
    currentSpace: {
      type: Object,
      default: null,
    },
    onUpdate: {
      type: Function,
      required: true,
    },
    onDelete: {
      type: Function,
      required: true,
    },
    onDuplicate: {
      type: Function,
      required: true,
    },
    onClose: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      // delete dialog
      deleteDialogOpen: false,
      keepHistoricalData: true,

      // form de base
      formData: {
        name: this.element.name,
        x: this.element.x || 0,
        y: this.element.y || 0,
        width: this.element.width || 0,
        depth: this.element.depth || 0,
        height: this.element.height || 0,
        cornerRadius: this.element.cornerRadius || {
          topLeft: 0,
          topRight: 0,
          bottomLeft: 0,
          bottomRight: 0,
        },
      },

      // menu & inventory
      menuItems: this.element.menuItems || [],
      newMenuItem: '',
      inventoryItems: this.element.inventoryItems || [],
      newInventoryItem: '',
      performance: this.element.performance || {},
      allMenuItems: [],

      // search états
      menuSearchOpen: false,
      inventorySearchOpen: false,
      menuSearchQuery: '',
      inventorySearchQuery: '',

      // collapsibles
      performanceOpen: false,
      menuOpen: false,
      itemsOpen: false,
      inventoryOpen: false,
      positionOpen: false,
      shopTypeOpen: false,
      configurationOpen: false,
      shopsOpen: false,
      storageTypeOpen: false,
      hospitalityTypeOpen: false,
      merchTypeOpen: false,
      accessTypeOpen: false,
      entertainmentTypeOpen: false,
      entranceTypeOpen: false,
      kitchenTypeOpen: false,
      staffOpen: false,

      // staff
      staffPositions: this.element.staffPositions || [],
      newStaffPosition: '',
      newStaffCount: 1,

      // corner radius
      linkedCorners: true,

      // ref input fichier
      fileInputRef: null,
    };
  },

  created() {
    // état linkedCorners initial en fonction des 4 coins
    const cr = this.element.cornerRadius;
    if (cr) {
      const allSame =
        cr.topLeft === cr.topRight &&
        cr.topLeft === cr.bottomLeft &&
        cr.topLeft === cr.bottomRight;
      this.linkedCorners = allSame;
    } else {
      this.linkedCorners = true;
    }

    // log debug configuration section pour certains types
    if (
      this.element.type === 'shop' ||
      this.element.type === 'hospitality' ||
      this.element.type === 'merch'
    ) {
      console.log('[PropertiesPanel] Configuration section check:', {
        hasRegistryId: !!this.element.registryId,
        registryId: this.element.registryId,
        hasRegistry: !!this.fbElementsRegistry,
        inRegistry:
          this.element.registryId && this.fbElementsRegistry
            ? !!this.fbElementsRegistry[this.element.registryId]
            : false,
        configurationsCount: this.configurations?.length || 0,
        shouldShow: !!(
          this.element.registryId &&
          this.fbElementsRegistry &&
          this.fbElementsRegistry[this.element.registryId] &&
          this.configurations &&
          this.configurations.length > 0
        ),
      });
    }

    // chargement des menu items pour l'inventaire étendu
    this.loadAllMenuItems();
  },

  mounted() {
    // connecter la ref de l'input fichier
    this.fileInputRef = this.$refs.fileInputRef || null;

    // listener menuItemsChanged
    this._handleMenuItemsChanged = () => {
      console.log('PropertiesPanel: Menu items changed, reloading...');
      this.loadAllMenuItems();
    };
    window.addEventListener('menuItemsChanged', this._handleMenuItemsChanged);
  },

  beforeUnmount() {
    if (this._handleMenuItemsChanged) {
      window.removeEventListener('menuItemsChanged', this._handleMenuItemsChanged);
    }
  },

  watch: {
    element: {
      deep: true,
      handler(newEl) {
        // resynchroniser quand l’élément change
        this.formData = {
          name: newEl.name,
          x: newEl.x,
          y: newEl.y,
          width: newEl.width,
          depth: newEl.depth,
          height: newEl.height,
          cornerRadius:
            newEl.cornerRadius || {
              topLeft: 0,
              topRight: 0,
              bottomLeft: 0,
              bottomRight: 0,
            },
        };
        this.menuItems = newEl.menuItems || [];
        this.inventoryItems = newEl.inventoryItems || [];
        this.performance = newEl.performance || {};
        this.staffPositions = newEl.staffPositions || [];

        const cr = newEl.cornerRadius;
        if (cr) {
          const allSame =
            cr.topLeft === cr.topRight &&
            cr.topLeft === cr.bottomLeft &&
            cr.topLeft === cr.bottomRight;
          this.linkedCorners = allSame;
        } else {
          this.linkedCorners = true;
        }
      },
    },
  },

  methods: {

    setPositionOpen(v) {
      this.positionOpen = !!v
    },

    setStaffOpen(v) {
      this.staffOpen = !!v
    },
    // helpers "setXXX" utilisés par le template
    setNewMenuItem(val) {
      this.newMenuItem = val;
    },
    setNewInventoryItem(val) {
      this.newInventoryItem = val;
    },
    setInventorySearchQuery(val) {
      this.inventorySearchQuery = val;
    },
    setNewStaffPosition(val) {
      this.newStaffPosition = val;
    },
    setNewStaffCount(val) {
      this.newStaffCount = val;
    },
    setMenuItems(items) {
      this.menuItems = items;
    },
    setInventoryItems(items) {
      this.inventoryItems = items;
    },
    setStaffPositions(items) {
      this.staffPositions = items;
    },
    setDeleteDialogOpen(val) {
      this.deleteDialogOpen = !!val;
    },
    setKeepHistoricalData(val) {
      this.keepHistoricalData = !!val;
    },
    setLinkedCorners(val) {
      this.linkedCorners = !!val;
    },

    async loadAllMenuItems() {
      try {
        const items = await api.getAllMenuItems();
        this.allMenuItems = items || [];
      } catch (error) {
        console.error(
          'PropertiesPanel: Error loading menu items for inventory expansion:',
          error
        );
        this.allMenuItems = [];
      }
    },

    handleUpdate(key, value) {
      const newData = { ...this.formData, [key]: value };
      this.formData = newData;
      this.onUpdate({ [key]: value });
    },

    handleAddMenuItem() {
      if (!this.newMenuItem.trim()) return;

      const newItem = {
        id: Date.now().toString(),
        name: this.newMenuItem.trim(),
        quantity: 0,
      };

      const updatedMenuItems = [...this.menuItems, newItem];
      this.menuItems = updatedMenuItems;

      // shops F&B & merchshops: également pour l’inventory
      if (this.element.type === 'shop' || this.element.type === 'merchshop') {
        const inventoryItem = {
          id: (Date.now() + 1).toString(),
          name: this.newMenuItem.trim(),
          quantity: 0,
        };
        const updatedInventoryItems = [...this.inventoryItems, inventoryItem];
        this.inventoryItems = updatedInventoryItems;
        this.onUpdate({
          menuItems: updatedMenuItems,
          inventoryItems: updatedInventoryItems,
        });
      } else {
        this.onUpdate({ menuItems: updatedMenuItems });
      }

      this.newMenuItem = '';
    },

    handleDeleteMenuItem(itemId) {
      const updatedMenuItems = this.menuItems.filter(item => item.id !== itemId);
      this.menuItems = updatedMenuItems;
      this.onUpdate({ menuItems: updatedMenuItems });
    },

    handleUpdateMenuItemQuantity(itemId, quantity) {
      const updatedMenuItems = this.menuItems.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      );
      this.menuItems = updatedMenuItems;
      this.onUpdate({ menuItems: updatedMenuItems });
    },

    handleAddInventoryItem() {
      if (!this.newInventoryItem.trim()) return;

      const newItem = {
        id: Date.now().toString(),
        name: this.newInventoryItem.trim(),
        quantity: 0,
      };

      const updatedInventoryItems = [...this.inventoryItems, newItem];
      this.inventoryItems = updatedInventoryItems;
      this.onUpdate({ inventoryItems: updatedInventoryItems });
      this.newInventoryItem = '';
    },

    handleDeleteInventoryItem(itemId) {
      const updatedInventoryItems = this.inventoryItems.filter(
        item => item.id !== itemId
      );
      this.inventoryItems = updatedInventoryItems;
      this.onUpdate({ inventoryItems: updatedInventoryItems });
    },

    handleUpdateInventoryItemQuantity(itemId, quantity) {
      const updatedInventoryItems = this.inventoryItems.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      );
      this.inventoryItems = updatedInventoryItems;
      this.onUpdate({ inventoryItems: updatedInventoryItems });
    },

    handleUpdatePerformance(key, value) {
      const updatedPerformance = { ...this.performance, [key]: value };
      this.performance = updatedPerformance;
      this.onUpdate({ performance: updatedPerformance });
    },

    getTypeLabel(type) {
      switch (type) {
        case 'shop':
          return 'Shop';
        case 'storage':
          return 'Storage Area';
        case 'entrance':
          return 'Ticket Entrance';
        case 'hospitality':
          return 'Hospitality';
        case 'merchshop':
          return 'Merch Shop';
        case 'access':
          return 'Access';
        case 'entertainment':
          return 'Entertainment';
        case 'kitchen':
          return 'Kitchen';
        default:
          return type;
      }
    },

    getTypeColor(type) {
      switch (type) {
        case 'shop':
          return 'bg-green-100 text-green-700';
        case 'storage':
          return 'bg-amber-100 text-amber-700';
        case 'entrance':
          return 'bg-red-100 text-red-700';
        case 'hospitality':
          return 'bg-pink-100 text-pink-700';
        case 'merchshop':
          return 'bg-stone-100 text-stone-700';
        case 'access':
          return 'bg-slate-100 text-slate-700';
        case 'entertainment':
          return 'bg-purple-100 text-purple-700';
        case 'kitchen':
          return 'bg-orange-100 text-orange-700';
        default:
          return 'bg-gray-100 text-gray-700';
      }
    },

    // prix affiché pour un menu item (space-specific pricing)
    getDisplayPrice(menuItem) {
      if (!menuItem) return 0;

      if (
        menuItem.spaceSpecificPrices &&
        Array.isArray(menuItem.spaceSpecificPrices) &&
        this.currentSpace
      ) {
        const rule = menuItem.spaceSpecificPrices.find(priceRule =>
          priceRule.spaceIds &&
          priceRule.spaceIds.includes(this.currentSpace.id)
        );
        if (rule && rule.price !== undefined) return rule.price;
      }

      return menuItem.basePrice || 0;
    },

    getFilteredMenuItems(query) {
      if (!query.trim()) return this.availableMenuItems;
      const lower = query.toLowerCase();
      return this.availableMenuItems.filter(item =>
        (item.name || '').toLowerCase().includes(lower) ||
        (item.category || '').toLowerCase().includes(lower) ||
        (item.type || '').toLowerCase().includes(lower)
      );
    },

    getAllInventorySearchableItems() {
      const searchable = [];

      // menu items
      this.availableMenuItems.forEach(menuItem => {
        searchable.push({
          id: menuItem.id,
          name: menuItem.name,
          type: 'menu-item',
        });

        if (
          this.allMenuItems.length > 0 &&
          menuItem.readyForSale === 'No' &&
          menuItem.components
        ) {
          const rawComponents = menuItem.components.filter(
            c => c.itemType === 'Component'
          );
          const rawIngredients = menuItem.components.filter(
            c => c.itemType === 'Ingredient'
          );

          if (rawComponents.length > 0) {
            const toExpand = rawComponents.map(c => ({
              name: c.name,
              id: c.id,
            }));
            const expanded = expandInventoryItems(toExpand, this.allMenuItems);
            expanded.forEach(comp => {
              if (!searchable.find(item => item.id === comp.id)) {
                searchable.push({
                  id: comp.id,
                  name: comp.name,
                  type: 'component',
                  source: menuItem.name,
                });
              }
            });
          }

          rawIngredients.forEach(ing => {
            if (!searchable.find(item => item.id === ing.id)) {
              searchable.push({
                id: ing.id,
                name: ing.name,
                type: 'ingredient',
                source: menuItem.name,
              });
            }
          });
        }
      });

      // custom inventory items
      this.inventoryItems.forEach(item => {
        if (!this.availableMenuItems.find(mi => mi.id === item.id)) {
          if (!searchable.find(si => si.id === item.id)) {
            searchable.push({
              id: item.id,
              name: item.name,
              type: 'component',
            });
          }
        }
      });

      return searchable;
    },

    getFilteredInventoryItems(query) {
      const allItems = this.getAllInventorySearchableItems();
      if (!query.trim()) return allItems;
      const lower = query.toLowerCase();
      return allItems.filter(
        item =>
          item.name.toLowerCase().includes(lower) ||
          (item.source || '').toLowerCase().includes(lower)
      );
    },

    handleAddStaffPosition() {
      if (!this.newStaffPosition.trim() || this.newStaffCount < 1) return;

      const position = {
        id: Date.now().toString(),
        position: this.newStaffPosition.trim(),
        count: this.newStaffCount,
      };

      const updated = [...this.staffPositions, position];
      this.staffPositions = updated;
      this.onUpdate({ staffPositions: updated });
      this.newStaffPosition = '';
      this.newStaffCount = 1;
    },

    handleDeleteStaffPosition(positionId) {
      const updated = this.staffPositions.filter(pos => pos.id !== positionId);
      this.staffPositions = updated;
      this.onUpdate({ staffPositions: updated });
    },

    handleUpdateStaffPositionCount(positionId, count) {
      const updated = this.staffPositions.map(pos =>
        pos.id === positionId ? { ...pos, count } : pos
      );
      this.staffPositions = updated;
      this.onUpdate({ staffPositions: updated });
    },

    handleCornerRadiusChange(corner, value) {
      let newCornerRadius;

      if (this.linkedCorners) {
        newCornerRadius = {
          topLeft: value,
          topRight: value,
          bottomLeft: value,
          bottomRight: value,
        };
      } else {
        newCornerRadius = {
          ...this.formData.cornerRadius,
          [corner]: value,
        };
      }

      this.formData = {
        ...this.formData,
        cornerRadius: newCornerRadius,
      };
      this.onUpdate({ cornerRadius: newCornerRadius });
    },

    handleImageUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        this.onUpdate({ image: base64String });
      };
      reader.readAsDataURL(file);
    },

    handleRemoveImage() {
      this.onUpdate({ image: undefined });
    },
  },
};
</script>