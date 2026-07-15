<template>
  <div :class="condensed ? 'p-2' : 'p-4'">
    <Collapsible v-model:open="floorsOpen">
      <div :class="`flex items-center py-2 mb-2 ${condensed ? 'justify-center' : 'w-full gap-2'}`">
        <DropdownMenu>
          <DropdownMenuTrigger as-Child>
            <Button variant="ghost" size="sm" class="h-8 w-8 p-0 rounded-full">
              <Plus class="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" :side-offset="4">
            <DropdownMenuItem @click="onAddFloor(false)">
              <Plus class="w-4 h-4 mr-2" />
              Floor
            </DropdownMenuItem>
            <DropdownMenuItem @click="onAddFloor(true)">
              <Plus class="w-4 h-4 mr-2" />
              Basement
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!forecourt" @click="onAddForecourt">
              <Plus class="w-4 h-4 mr-2" />
              Forecourt
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!externalMerch" @click="onAddExternalMerch">
              <Plus class="w-4 h-4 mr-2" />
              External
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CollapsibleTrigger
          v-if="!condensed"
          class="flex items-center justify-between w-full hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2"
        >
          <h2 class="text-lg">Areas</h2>
          <ChevronDown
            :class="`w-5 h-5 transition-transform ${floorsOpen ? 'rotate-180' : ''}`"
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div class="space-y-2">
          <div v-for="floor in floors" :key="floor.id" class="relative">
            <div
              v-if="dragOverFloorId === floor.id && insertBefore"
              class="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10 -mt-1"
            >
              <div class="absolute left-0 top-1/2 -mt-1 w-2 h-2 bg-blue-500 rounded-full"></div>
              <div class="absolute right-0 top-1/2 -mt-1 w-2 h-2 bg-blue-500 rounded-full"></div>
            </div>
            <div
              v-if="dragOverFloorId === floor.id && !insertBefore"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10 -mb-1"
            >
              <div class="absolute left-0 top-1/2 -mt-1 w-2 h-2 bg-blue-500 rounded-full"></div>
              <div class="absolute right-0 top-1/2 -mt-1 w-2 h-2 bg-blue-500 rounded-full"></div>
            </div>
            <div
              draggable="true"
              @dragstart="handleDragStart($event, floor.id)"
              @dragover="handleDragOver($event, floor.id)"
              @dragleave="handleDragLeave"
              @drop="handleDrop($event, floor.id)"
              @dragend="handleDragEnd"
              :class="[
                'p-3 rounded-lg border cursor-pointer transition-colors',
                (viewMode === 'floor' && selectedFloorId === floor.id)
                  ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700'
                  : 'bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 dark:border-gray-700',
                (draggedFloorId === floor.id) ? 'opacity-50' : ''
              ]"
              @click="onSelectFloor(floor.id)"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <div class="cursor-grab active:cursor-grabbing" @mousedown.stop>
                    <GripVertical class="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <ChevronUp
                    v-if="floor.level >= 0"
                    class="w-4 h-4 text-gray-500 dark:text-gray-400"
                  />
                  <ChevronDown
                    v-else
                    class="w-4 h-4 text-gray-500 dark:text-gray-400"
                  />
                  <span>{{ floor.name }}</span>
                </div>
                <div class="flex gap-1">
                  <Dialog
                    :open="editingFloor && editingFloor.id === floor.id"
                    @update:open="onEditFloorOpenChange($event, floor.id)"
                  >
                    <DialogTrigger as-Child>
                      <Button
                        size="sm"
                        variant="ghost"
                        @click.stop="openEditDialog(floor)"
                      >
                        <Edit2 class="w-3 h-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      class="max-h-[90vh]"
                      aria-describedby="edit-floor-description"
                      @click.stop
                    >
                      <DialogHeader>
                        <DialogTitle>Edit Floor</DialogTitle>
                        <DialogDescription id="edit-floor-description">
                          Update the floor name and dimensions.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea class="max-h-[calc(90vh-120px)] pr-4">
                        <div class="space-y-4 py-4">
                          <div class="space-y-2">
                            <Label>Floor Name</Label>
                            <Input
                              :value="formData.name"
                              @input="formData.name = $event.target.value"
                            />
                          </div>
                          <div class="grid grid-cols-3 gap-4">
                            <div class="space-y-2">
                              <Label>Width (m)</Label>
                              <Input
                                type="number"
                                :value="formData.width"
                                @input="formData.width = parseFloat($event.target.value) || 0"
                              />
                            </div>
                            <div class="space-y-2">
                              <Label>Length (m)</Label>
                              <Input
                                type="number"
                                :value="formData.length"
                                @input="formData.length = parseFloat($event.target.value) || 0"
                              />
                            </div>
                            <div class="space-y-2">
                              <Label>Height (m)</Label>
                              <Input
                                type="number"
                                :value="formData.height"
                                @input="formData.height = parseFloat($event.target.value) || 0"
                              />
                            </div>
                          </div>
                          <div class="space-y-3 pt-2">
                            <div class="flex items-center justify-between">
                              <Label>Corner Radius (m)</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0"
                                @click="linkedCorners = !linkedCorners"
                              >
                                <Link v-if="linkedCorners" class="w-4 h-4" />
                                <Unlink v-else class="w-4 h-4" />
                              </Button>
                            </div>
                            <div v-if="linkedCorners" class="space-y-2">
                              <Label class="text-xs text-gray-600 dark:text-gray-300">All Corners</Label>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                :value="formData.cornerRadius.topLeft"
                                @input="handleFloorCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                              />
                            </div>
                            <div v-else class="grid grid-cols-2 gap-3">
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600 dark:text-gray-300">Top Left</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="formData.cornerRadius.topLeft"
                                  @input="handleFloorCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600 dark:text-gray-300">Top Right</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="formData.cornerRadius.topRight"
                                  @input="handleFloorCornerRadiusChange('topRight', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600 dark:text-gray-300">Bottom Left</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="formData.cornerRadius.bottomLeft"
                                  @input="handleFloorCornerRadiusChange('bottomLeft', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600 dark:text-gray-300">Bottom Right</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="formData.cornerRadius.bottomRight"
                                  @input="handleFloorCornerRadiusChange('bottomRight', parseInt($event.target.value) || 0)"
                                />
                              </div>
                            </div>
                          </div>
                          <div class="space-y-3 pt-4 border-t dark:border-gray-700">
                            <div class="flex items-center space-x-2">
                              <Checkbox
                                id="hole-enabled"
                                :checked="formData.hole.enabled"
                                @update:checked="onHoleEnabledChange"
                              />
                              <Label for="hole-enabled" class="cursor-pointer">
                                Create hole in floor (doughnut shape)
                              </Label>
                            </div>
                            <template v-if="formData.hole.enabled">
                              <div class="grid grid-cols-2 gap-4 pl-6">
                                <div class="space-y-2">
                                  <Label class="text-xs text-gray-600 dark:text-gray-300">Hole Width (m)</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    min="1"
                                    :value="formData.hole.width"
                                    @input="formData.hole.width = parseFloat($event.target.value) || 1"
                                  />
                                </div>
                                <div class="space-y-2">
                                  <Label class="text-xs text-gray-600 dark:text-gray-300">Hole Length (m)</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    min="1"
                                    :value="formData.hole.length"
                                    @input="formData.hole.length = parseFloat($event.target.value) || 1"
                                  />
                                </div>
                              </div>
                              <div class="grid grid-cols-2 gap-4 pl-6">
                                <div class="space-y-2">
                                  <Label class="text-xs text-gray-600 dark:text-gray-300">X Position (0-1)</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="1"
                                    :value="formData.hole.x"
                                    @input="formData.hole.x = parseFloat($event.target.value) || 0.5"
                                  />
                                </div>
                                <div class="space-y-2">
                                  <Label class="text-xs text-gray-600 dark:text-gray-300">Y Position (0-1)</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="1"
                                    :value="formData.hole.y"
                                    @input="formData.hole.y = parseFloat($event.target.value) || 0.5"
                                  />
                                </div>
                              </div>
                              <div class="space-y-3 pl-6">
                                <div class="flex items-center justify-between">
                                  <Label class="text-xs">Hole Corner Radius (m)</Label>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    class="h-8 w-8 p-0"
                                    @click="linkedHoleCorners = !linkedHoleCorners"
                                  >
                                    <Link v-if="linkedHoleCorners" class="w-4 h-4" />
                                    <Unlink v-else class="w-4 h-4" />
                                  </Button>
                                </div>
                                <div v-if="linkedHoleCorners" class="space-y-2">
                                  <Label class="text-xs text-gray-600 dark:text-gray-300">All Corners</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    min="0"
                                    :value="formData.hole.cornerRadius.topLeft"
                                    @input="handleHoleCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                                  />
                                </div>
                                <div v-else class="grid grid-cols-2 gap-3">
                                  <div class="space-y-2">
                                    <Label class="text-xs text-gray-600 dark:text-gray-300">Top Left</Label>
                                    <Input
                                      type="number"
                                      step="1"
                                      min="0"
                                      :value="formData.hole.cornerRadius.topLeft"
                                      @input="handleHoleCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                                    />
                                  </div>
                                  <div class="space-y-2">
                                    <Label class="text-xs text-gray-600 dark:text-gray-300">Top Right</Label>
                                    <Input
                                      type="number"
                                      step="1"
                                      min="0"
                                      :value="formData.hole.cornerRadius.topRight"
                                      @input="handleHoleCornerRadiusChange('topRight', parseInt($event.target.value) || 0)"
                                    />
                                  </div>
                                  <div class="space-y-2">
                                    <Label class="text-xs text-gray-600 dark:text-gray-300">Bottom Left</Label>
                                    <Input
                                      type="number"
                                      step="1"
                                      min="0"
                                      :value="formData.hole.cornerRadius.bottomLeft"
                                      @input="handleHoleCornerRadiusChange('bottomLeft', parseInt($event.target.value) || 0)"
                                    />
                                  </div>
                                  <div class="space-y-2">
                                    <Label class="text-xs text-gray-600 dark:text-gray-300">Bottom Right</Label>
                                    <Input
                                      type="number"
                                      step="1"
                                      min="0"
                                      :value="formData.hole.cornerRadius.bottomRight"
                                      @input="handleHoleCornerRadiusChange('bottomRight', parseInt($event.target.value) || 0)"
                                    />
                                  </div>
                                </div>
                              </div>
                              <p class="text-xs text-gray-500 dark:text-gray-400 pl-6">
                                Drag the hole in the floor plan view to reposition it.
                              </p>
                            </template>
                          </div>
                          <Button class="w-full" @click="saveFloor">
                            Save Changes
                          </Button>
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="sm"
                    variant="ghost"
                    @click.stop="openDeleteDialog({ type: 'floor', id: floor.id, name: floor.name })"
                  >
                    <Trash2 class="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    @click.stop="onDuplicateFloor(floor.id)"
                  >
                    <Copy class="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ floor.width }}m × {{ floor.length }}m × {{ floor.height }}m
                <div class="mt-1">
                  {{ floor.elements.length }} element{{ floor.elements.length !== 1 ? 's' : '' }}
                </div>
              </div>
            </div>
          </div>
          <template v-if="forecourt">
            <div class="border-t my-2 dark:border-gray-700"></div>
            <div
              :class="[
                'p-3 rounded-lg border cursor-pointer transition-colors',
                viewMode === 'forecourt'
                  ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700'
                  : 'bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 dark:border-gray-700'
              ]"
              @click="onSelectForecourt"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span>{{ forecourt.name }}</span>
                </div>
                <div class="flex gap-1">
                  <Dialog v-model:open="editingForecourt">
                    <DialogTrigger asChild>
                      <Button size="sm" variant="ghost" @click.stop="openEditForecourtDialog">
                        <Edit2 class="w-3 h-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      class="max-h-[90vh]"
                      aria-describedby="edit-forecourt-description"
                      @click.stop
                    >
                      <DialogHeader>
                        <DialogTitle>Edit Forecourt</DialogTitle>
                        <DialogDescription id="edit-forecourt-description">
                          Update the forecourt name and dimensions.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea class="max-h-[calc(90vh-120px)] pr-4">
                        <div class="space-y-4 py-4">
                          <div class="space-y-2">
                            <Label>Forecourt Name</Label>
                            <Input
                              :value="forecourtFormData.name"
                              @input="forecourtFormData.name = $event.target.value"
                            />
                          </div>
                          <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                              <Label>Width (m)</Label>
                              <Input
                                type="number"
                                :value="forecourtFormData.width"
                                @input="forecourtFormData.width = parseFloat($event.target.value) || 0"
                              />
                            </div>
                            <div class="space-y-2">
                              <Label>Length (m)</Label>
                              <Input
                                type="number"
                                :value="forecourtFormData.length"
                                @input="forecourtFormData.length = parseFloat($event.target.value) || 0"
                              />
                            </div>
                          </div>
                          <div class="space-y-3 pt-2">
                            <div class="flex items-center justify-between">
                              <Label>Corner Radius (m)</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0"
                                @click="forecourtLinkedCorners = !forecourtLinkedCorners"
                              >
                                <Link v-if="forecourtLinkedCorners" class="w-4 h-4" />
                                <Unlink v-else class="w-4 h-4" />
                              </Button>
                            </div>
                            <div v-if="forecourtLinkedCorners" class="space-y-2">
                              <Label class="text-xs text-gray-600">All Corners</Label>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                :value="forecourtFormData.cornerRadius.topLeft"
                                @input="handleForecourtCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                              />
                            </div>
                            <div v-else class="grid grid-cols-2 gap-3">
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Top Left</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="forecourtFormData.cornerRadius.topLeft"
                                  @input="handleForecourtCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Top Right</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="forecourtFormData.cornerRadius.topRight"
                                  @input="handleForecourtCornerRadiusChange('topRight', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Bottom Left</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="forecourtFormData.cornerRadius.bottomLeft"
                                  @input="handleForecourtCornerRadiusChange('bottomLeft', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Bottom Right</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="forecourtFormData.cornerRadius.bottomRight"
                                  @input="handleForecourtCornerRadiusChange('bottomRight', parseInt($event.target.value) || 0)"
                                />
                              </div>
                            </div>
                          </div>
                          <Button class="w-full" @click="saveForecourt">
                            Save Changes
                          </Button>
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="sm"
                    variant="ghost"
                    @click.stop="openDeleteDialog({ type: 'forecourt', name: forecourt.name })"
                  >
                    <Trash2 class="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ forecourt.width }}m × {{ forecourt.length }}m
                <div class="mt-1">
                  {{ forecourt.elements.length }} element{{ forecourt.elements.length !== 1 ? 's' : '' }}
                </div>
              </div>
            </div>
          </template>
          <template v-if="externalMerch">
            <div class="border-t my-2 dark:border-gray-700"></div>
            <div
              :class="[
                'p-3 rounded-lg border cursor-pointer transition-colors',
                viewMode === 'externalmerch'
                  ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700'
                  : 'bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 dark:border-gray-700'
              ]"
              @click="onSelectExternalMerch"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span>{{ externalMerch.name }}</span>
                </div>
                <div class="flex gap-1">
                  <Dialog v-model:open="editingExternalMerch">
                    <DialogTrigger asChild>
                      <Button size="sm" variant="ghost" @click.stop="openEditExternalMerchDialog">
                        <Edit2 class="w-3 h-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      class="max-h-[90vh]"
                      aria-describedby="edit-external-area-description"
                      @click.stop
                    >
                      <DialogHeader>
                        <DialogTitle>Edit External Area</DialogTitle>
                        <DialogDescription id="edit-external-area-description">
                          Update the external area name and dimensions.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea class="max-h-[calc(90vh-120px)] pr-4">
                        <div class="space-y-4 py-4">
                          <div class="space-y-2">
                            <Label>External Area Name</Label>
                            <Input
                              :value="externalMerchFormData.name"
                              @input="externalMerchFormData.name = $event.target.value"
                            />
                          </div>
                          <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                              <Label>Width (m)</Label>
                              <Input
                                type="number"
                                :value="externalMerchFormData.width"
                                @input="externalMerchFormData.width = parseFloat($event.target.value) || 0"
                              />
                            </div>
                            <div class="space-y-2">
                              <Label>Length (m)</Label>
                              <Input
                                type="number"
                                :value="externalMerchFormData.length"
                                @input="externalMerchFormData.length = parseFloat($event.target.value) || 0"
                              />
                            </div>
                          </div>
                          <div class="space-y-3 pt-2">
                            <div class="flex items-center justify-between">
                              <Label>Corner Radius (m)</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0"
                                @click="externalMerchLinkedCorners = !externalMerchLinkedCorners"
                              >
                                <Link v-if="externalMerchLinkedCorners" class="w-4 h-4" />
                                <Unlink v-else class="w-4 h-4" />
                              </Button>
                            </div>
                            <div v-if="externalMerchLinkedCorners" class="space-y-2">
                              <Label class="text-xs text-gray-600">All Corners</Label>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                :value="externalMerchFormData.cornerRadius.topLeft"
                                @input="handleExternalMerchCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                              />
                            </div>
                            <div v-else class="grid grid-cols-2 gap-3">
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Top Left</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="externalMerchFormData.cornerRadius.topLeft"
                                  @input="handleExternalMerchCornerRadiusChange('topLeft', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Top Right</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="externalMerchFormData.cornerRadius.topRight"
                                  @input="handleExternalMerchCornerRadiusChange('topRight', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Bottom Left</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="externalMerchFormData.cornerRadius.bottomLeft"
                                  @input="handleExternalMerchCornerRadiusChange('bottomLeft', parseInt($event.target.value) || 0)"
                                />
                              </div>
                              <div class="space-y-2">
                                <Label class="text-xs text-gray-600">Bottom Right</Label>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  :value="externalMerchFormData.cornerRadius.bottomRight"
                                  @input="handleExternalMerchCornerRadiusChange('bottomRight', parseInt($event.target.value) || 0)"
                                />
                              </div>
                            </div>
                          </div>
                          <Button class="w-full" @click="saveExternalMerch">
                            Save Changes
                          </Button>
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="sm"
                    variant="ghost"
                    @click.stop="openDeleteDialog({ type: 'externalmerch', name: externalMerch.name })"
                  >
                    <Trash2 class="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ externalMerch.width }}m × {{ externalMerch.length }}m
                <div class="mt-1">
                  {{ externalMerch.elements.length }} element{{ externalMerch.elements.length !== 1 ? 's' : '' }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </CollapsibleContent>
    </Collapsible>
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete
            {{
              areaToDelete && areaToDelete.type === 'floor'
                ? 'Floor/Basement'
                : areaToDelete && areaToDelete.type === 'forecourt'
                  ? 'Forecourt'
                  : 'External Area'
            }}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{{ areaToDelete ? areaToDelete.name : '' }}"?
            This action cannot be undone and will permanently remove this area and all its elements from the database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction class="bg-red-600 hover:bg-red-700" @click="confirmDelete">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script>
import Button from '../ui/button.vue'
import Input from '../ui/input.vue'
import Label from '../ui/label.vue'
import Checkbox from '../ui/checkbox.vue'

import Dialog from '../ui/dialog.vue'
import DialogContent from '../ui/dialogContent.vue'
import DialogHeader from '../ui/dialogHeader.vue'
import DialogTitle from '../ui/dialogTitle.vue'
import DialogDescription from '../ui/dialogDescription.vue'
import DialogTrigger from '../ui/dialogTrigger.vue'

import AlertDialog from '../ui/alertDialog.vue'
import AlertDialogAction from '../ui/alertDialogAction.vue'
import AlertDialogCancel from '../ui/alertDialogCancel.vue'
import AlertDialogContent from '../ui/alertDialogContent.vue'
import AlertDialogDescription from '../ui/alertDialogDescription.vue'
import AlertDialogFooter from '../ui/alertDialogFooter.vue'
import AlertDialogHeader from '../ui/alertDialogHeader.vue'
import AlertDialogTitle from '../ui/alertDialogTitle.vue'


import ScrollArea from '../ui/scrollArea.vue'

import DropdownMenu from '../ui/dropdownMenu.vue'
import DropdownMenuContent from '../ui/dropdownMenuContent.vue'
import DropdownMenuItem from '../ui/dropdownMenuItem.vue'
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue'

import Collapsible from '../ui/collapsible.vue'
import CollapsibleContent from '../ui/collapsibleContent.vue'
import CollapsibleTrigger from '../ui/collapsibleTrigger.vue'

// NOTE: équivalent Vue de lucide-react => souvent "lucide-vue-next"
import {
  Trash2,
  Edit2,
  ChevronUp,
  ChevronDown,
  Copy,
  Link,
  Unlink,
  Plus,
  GripVertical
} from 'lucide-vue-next'
const defaultCornerRadius = () => ({
  topLeft: 0,
  topRight: 0,
  bottomLeft: 0,
  bottomRight: 0
})
const defaultHole = () => ({
  enabled: false,
  x: 0.5,
  y: 0.5,
  width: 10,
  length: 10,
  cornerRadius: defaultCornerRadius()
})
export default {
  name: 'FloorList',
  components: {
    Button,
    Input,
    Label,
    Checkbox,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    ScrollArea,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Trash2,
    Edit2,
    ChevronUp,
    ChevronDown,
    Copy,
    Link,
    Unlink,
    Plus,
    GripVertical
  },
  props: {
    floors: { type: Array, required: true },
    forecourt: { type: Object, default: null },
    externalMerch: { type: Object, default: null },
    selectedFloorId: { type: String, default: null },
    viewMode: { type: String, required: true }, // 'floor' | 'forecourt' | 'externalmerch'
    onSelectFloor: { type: Function, required: true },
    onSelectForecourt: { type: Function, required: true },
    onSelectExternalMerch: { type: Function, required: true },
    onUpdateFloor: { type: Function, required: true },
    onUpdateForecourt: { type: Function, required: true },
    onUpdateExternalMerch: { type: Function, required: true },
    onDeleteFloor: { type: Function, required: true },
    onDeleteForecourt: { type: Function, required: true },
    onDeleteExternalMerch: { type: Function, required: true },
    onDuplicateFloor: { type: Function, required: true },
    onAddFloor: { type: Function, required: true },
    onAddForecourt: { type: Function, required: true },
    onAddExternalMerch: { type: Function, required: true },
    onReorderFloors: { type: Function, required: true },
    condensed: { type: Boolean, default: false }
  },
  data() {
    return {
      editingFloor: null,
      editingForecourt: false,
      editingExternalMerch: false,
      formData: {
        name: '',
        width: 0,
        length: 0,
        height: 0,
        cornerRadius: defaultCornerRadius(),
        hole: defaultHole()
      },
      forecourtFormData: {
        name: '',
        width: 0,
        length: 0,
        cornerRadius: defaultCornerRadius()
      },
      externalMerchFormData: {
        name: '',
        width: 0,
        length: 0,
        cornerRadius: defaultCornerRadius()
      },
      floorsOpen: false,
      linkedCorners: true,
      linkedHoleCorners: true,
      forecourtLinkedCorners: true,
      externalMerchLinkedCorners: true,
      draggedFloorId: null,
      dragOverFloorId: null,
      insertBefore: true,
      deleteDialogOpen: false,
      // { type: 'floor'|'forecourt'|'externalmerch', id?: string, name: string }
      areaToDelete: null
    }
  },
  methods: {
    openEditDialog(floor) {
      console.log('openEditDialog', floor)
      this.editingFloor = floor
      this.formData = {
        name: floor.name,
        width: floor.width,
        length: floor.length,
        height: floor.height,
        cornerRadius: floor.cornerRadius || defaultCornerRadius(),
        hole: floor.hole || defaultHole()

      }
      const hasCornerRadius = !!floor.cornerRadius
      const allSame =
        hasCornerRadius &&
        floor.cornerRadius.topLeft === floor.cornerRadius.topRight &&
        floor.cornerRadius.topLeft === floor.cornerRadius.bottomLeft &&
        floor.cornerRadius.topLeft === floor.cornerRadius.bottomRight
      this.linkedCorners = allSame || !hasCornerRadius
      const hasHoleCornerRadius = !!(floor.hole && floor.hole.cornerRadius)
      const allHoleSame =
        hasHoleCornerRadius &&
        floor.hole.cornerRadius.topLeft === floor.hole.cornerRadius.topRight &&
        floor.hole.cornerRadius.topLeft === floor.hole.cornerRadius.bottomLeft &&
        floor.hole.cornerRadius.topLeft === floor.hole.cornerRadius.bottomRight
      this.linkedHoleCorners = allHoleSame || !hasHoleCornerRadius
      console.log('formData', this.formData)
    },
    saveFloor() {
      if (!this.editingFloor) return
      this.onUpdateFloor(this.editingFloor.id, this.formData)
      this.editingFloor = null
    },
    openEditForecourtDialog() {
      if (!this.forecourt) return
      this.editingForecourt = true
      this.forecourtFormData = {
        name: this.forecourt.name,
        width: this.forecourt.width,
        length: this.forecourt.length,
        cornerRadius: this.forecourt.cornerRadius || defaultCornerRadius()
      }
      const hasCornerRadius = !!this.forecourt.cornerRadius
      const allSame =
        hasCornerRadius &&
        this.forecourt.cornerRadius.topLeft === this.forecourt.cornerRadius.topRight &&
        this.forecourt.cornerRadius.topLeft === this.forecourt.cornerRadius.bottomLeft &&
        this.forecourt.cornerRadius.topLeft === this.forecourt.cornerRadius.bottomRight
      this.forecourtLinkedCorners = allSame || !hasCornerRadius
    },
    saveForecourt() {
      this.onUpdateForecourt(this.forecourtFormData)
      this.editingForecourt = false
    },
    openEditExternalMerchDialog() {
      if (!this.externalMerch) return
      this.editingExternalMerch = true
      this.externalMerchFormData = {
        name: this.externalMerch.name,
        width: this.externalMerch.width,
        length: this.externalMerch.length,
        cornerRadius: this.externalMerch.cornerRadius || defaultCornerRadius()
      }
      const hasCornerRadius = !!this.externalMerch.cornerRadius
      const allSame =
        hasCornerRadius &&
        this.externalMerch.cornerRadius.topLeft === this.externalMerch.cornerRadius.topRight &&
        this.externalMerch.cornerRadius.topLeft === this.externalMerch.cornerRadius.bottomLeft &&
        this.externalMerch.cornerRadius.topLeft === this.externalMerch.cornerRadius.bottomRight
      this.externalMerchLinkedCorners = allSame || !hasCornerRadius
    },
    saveExternalMerch() {
      this.onUpdateExternalMerch(this.externalMerchFormData)
      this.editingExternalMerch = false
    },
    handleFloorCornerRadiusChange(corner, value) {
      if (this.linkedCorners) {
        this.formData = {
          ...this.formData,
          cornerRadius: {
            topLeft: value,
            topRight: value,
            bottomLeft: value,
            bottomRight: value
          }
        }
        return
      }
      this.formData = {
        ...this.formData,
        cornerRadius: {
          ...this.formData.cornerRadius,
          [corner]: value
        }
      }
    },
    handleHoleCornerRadiusChange(corner, value) {
      if (this.linkedHoleCorners) {
        this.formData = {
          ...this.formData,
          hole: {
            ...this.formData.hole,
            cornerRadius: {
              topLeft: value,
              topRight: value,
              bottomLeft: value,
              bottomRight: value
            }
          }
        }
        return
      }
      this.formData = {
        ...this.formData,
        hole: {
          ...this.formData.hole,
          cornerRadius: {
            ...this.formData.hole.cornerRadius,
            [corner]: value
          }
        }
      }
    },
    handleForecourtCornerRadiusChange(corner, value) {
      if (this.forecourtLinkedCorners) {
        this.forecourtFormData = {
          ...this.forecourtFormData,
          cornerRadius: {
            topLeft: value,
            topRight: value,
            bottomLeft: value,
            bottomRight: value
          }
        }
        return
      }
      this.forecourtFormData = {
        ...this.forecourtFormData,
        cornerRadius: {
          ...this.forecourtFormData.cornerRadius,
          [corner]: value
        }
      }
    },
    handleExternalMerchCornerRadiusChange(corner, value) {
      if (this.externalMerchLinkedCorners) {
        this.externalMerchFormData = {
          ...this.externalMerchFormData,
          cornerRadius: {
            topLeft: value,
            topRight: value,
            bottomLeft: value,
            bottomRight: value
          }
        }
        return
      }
      this.externalMerchFormData = {
        ...this.externalMerchFormData,
        cornerRadius: {
          ...this.externalMerchFormData.cornerRadius,
          [corner]: value
        }
      }
    },
    onHoleEnabledChange(checked) {
      this.formData = {
        ...this.formData,
        hole: {
          ...this.formData.hole,
          enabled: !!checked
        }
      }
    },
    canSwapFloors(sourceId, targetId) {
      const sourceFloor = this.floors.find((f) => f.id === sourceId)
      const targetFloor = this.floors.find((f) => f.id === targetId)
      if (!sourceFloor || !targetFloor) return false
      const sourceIsFloor = sourceFloor.level >= 0
      const targetIsFloor = targetFloor.level >= 0
      return sourceIsFloor === targetIsFloor
    },
    handleDragStart(e, floorId) {
      this.draggedFloorId = floorId
      if (e && e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
      }
    },
    handleDragOver(e, floorId) {
      e.preventDefault()
      if (!this.draggedFloorId || this.draggedFloorId === floorId) return
      if (!this.canSwapFloors(this.draggedFloorId, floorId)) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
        this.dragOverFloorId = null
        return
      }
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      const cursorY = e.clientY
      const shouldInsertBefore = cursorY < midpoint
      this.dragOverFloorId = floorId
      this.insertBefore = shouldInsertBefore
    },
    handleDragLeave() {
      this.dragOverFloorId = null
    },
    handleDrop(e, targetFloorId) {
      e.preventDefault()
      if (
        this.draggedFloorId &&
        this.draggedFloorId !== targetFloorId &&
        this.canSwapFloors(this.draggedFloorId, targetFloorId)
      ) {
        this.onReorderFloors(this.draggedFloorId, targetFloorId, this.insertBefore)
      }
      this.draggedFloorId = null
      this.dragOverFloorId = null
      this.insertBefore = true
    },
    handleDragEnd() {
      this.draggedFloorId = null
      this.dragOverFloorId = null
      this.insertBefore = true
    },
    openDeleteDialog(payload) {
      this.areaToDelete = payload
      this.deleteDialogOpen = true
    },
    confirmDelete() {
      if (!this.areaToDelete) return
      if (this.areaToDelete.type === 'floor' && this.areaToDelete.id) {
        this.onDeleteFloor(this.areaToDelete.id)
      } else if (this.areaToDelete.type === 'forecourt') {
        this.onDeleteForecourt()
      } else if (this.areaToDelete.type === 'externalmerch') {
        this.onDeleteExternalMerch()
      }
      this.deleteDialogOpen = false
      this.areaToDelete = null
    },
    onEditFloorOpenChange(open, floorId) {
      if (!open && this.editingFloor && this.editingFloor.id === floorId) {
        this.editingFloor = null
      }
    }
  }
}
</script>
