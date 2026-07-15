<template>
  <!-- Si wizard import est ouvert, on n’affiche que lui -->
  <EventsImportWizard
    v-if="showImportWizard"
    :open="showImportWizard"
    :onOpenChange="setShowImportWizard"
    :csvHeaders="csvHeaders"
    :csvData="csvData"
    :eventTypes="eventTypes"
    :eventCategories="eventCategories"
    :eventSubcategories="eventSubcategories"
    :onComplete="onImportComplete"
    :spaces="spaces"
    :configurations="configurations"
    :events="events"
  />

  <div v-else class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Top bar quand onClose existe -->
    <div
      v-if="onClose"
      class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between"
    >
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="onClose">
          <X class="w-5 h-5" />
        </Button>
        <h2 class="font-semibold">Edit Events</h2>
      </div>

      <Button size="sm" @click="handleAddEvent">
        <Plus class="w-4 h-4 mr-2" />
        Add Event
      </Button>
    </div>

    <ScrollArea class="flex-1">
      <!-- Vue “library” quand onClose n’existe pas -->
      <div v-if="!onClose" class="p-4 w-full">
        <Card class="w-full overflow-visible">
          <CardHeader class="space-y-4">
            <div :class="`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between flex-wrap gap-3'}`">
              <CardTitle>Events Library</CardTitle>

              <div class="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" @click="handleExportCSV">
                  <Download class="w-4 h-4 mr-2" />
                  Export CSV
                </Button>

                <Button size="sm" variant="outline" @click="handleImportClick">
                  <Upload class="w-4 h-4 mr-2" />
                  Import CSV
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  :disabled="isCalculatingRevenue"
                  @click="handleCalculateEventRevenue"
                >
                  <Loader2
                    v-if="isCalculatingRevenue"
                    class="w-4 h-4 mr-2 animate-spin"
                  />
                  <DollarSign v-else class="w-4 h-4 mr-2" />
                  {{ isCalculatingRevenue ? 'Calculating...' : 'Calculate Event Revenue' }}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  @click="handleCleanupDuplicateEvents"
                >
                  <RotateCcw class="w-4 h-4 mr-2" />
                  Cleanup Duplicates
                </Button>

                <Button size="sm" @click="handleAddEvent">
                  <Plus class="w-4 h-4 mr-2" />
                  Add Event
                </Button>
              </div>
            </div>

            <!-- Search + Filters -->
            <div class="flex items-center gap-3">
              <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  class="pl-9"
                  placeholder="Search events..."
                  :value="searchQuery"
                  @input="onSearchInput"
                />
              </div>

              <!-- Mobile filters -->
              <DropdownMenu v-if="isMobile">
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Filter class="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" class="w-56">
                  <DropdownMenuLabel>Location</DropdownMenuLabel>
                  <DropdownMenuItem @click="setFilterLocation('all')">
                    All Locations
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    v-for="space in spaces"
                    :key="space.id"
                    @click="setFilterLocation(space.id)"
                  >
                    {{ space.name }}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuLabel>Event Category</DropdownMenuLabel>
                  <DropdownMenuItem @click="setFilterEventCategory('all')">
                    All Categories
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    v-for="category in eventCategories"
                    :key="category.id"
                    @click="setFilterEventCategory(category.id)"
                  >
                    {{ category.name }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <!-- Desktop filters -->
              <template v-else>
                <Select :value="filterLocation" @valueChange="setFilterLocation">
                  <SelectTrigger class="w-40">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    <SelectItem
                      v-for="space in spaces"
                      :key="space.id"
                      :value="space.id"
                    >
                      {{ space.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select :value="filterEventCategory" @valueChange="setFilterEventCategory">
                  <SelectTrigger class="w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem
                      v-for="category in eventCategories"
                      :key="category.id"
                      :value="category.id"
                    >
                      {{ category.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </template>
            </div>

            <!-- Helper text -->
            <div class="text-sm text-gray-500 dark:text-gray-400">
              <span>
                {{ filteredEvents.length }} event{{ filteredEvents.length !== 1 ? 's' : '' }}
              </span>
            </div>
          </CardHeader>

          <CardContent class="p-0">
            <!-- Table Container -->
            <div class="max-h-[500px] overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-10">
                  <tr>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Space</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Event Date</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Event Name</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Category</th>
                    <th class="px-4 py-3 text-right whitespace-nowrap dark:text-gray-300">Revenue</th>
                    <th class="px-4 py-3 text-right whitespace-nowrap dark:text-gray-300">Tickets Scanned</th>
                    <th class="px-4 py-3 text-left whitespace-nowrap dark:text-gray-300">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  <tr
                    v-for="event in paginatedEvents"
                    :key="event.id"
                    class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <!-- Space -->
                    <td class="px-4 py-3">
                      <select
                        v-if="editingCell?.eventId === event.id && editingCell?.field === 'spaceId'"
                        class="w-full px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        :value="editingValue"
                        @change="onInlineSelectChange"
                        @blur="saveInlineEdit(event.id, 'spaceId')"
                        @keydown.enter.prevent="saveInlineEdit(event.id, 'spaceId')"
                        @keydown.esc.prevent="cancelEditing"
                        autofocus
                      >
                        <option
                          v-for="space in spaces"
                          :key="space.id"
                          :value="space.id"
                        >
                          {{ space.name }}
                        </option>
                      </select>

                      <div
                        v-else
                        class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-gray-200"
                        @click="startEditing(event.id, 'spaceId', event.spaceId)"
                      >
                        <span v-if="getSpaceNameById(event.spaceId)">{{ getSpaceNameById(event.spaceId) }}</span>
                        <span v-else class="text-gray-400 dark:text-gray-500 italic">—</span>
                      </div>
                    </td>

                    <!-- Event Date -->
                    <td class="px-4 py-3">
                      <input
                        v-if="editingCell?.eventId === event.id && editingCell?.field === 'eventDate'"
                        class="w-full px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        type="date"
                        :value="editingValue"
                        @input="onInlineInput"
                        @blur="saveInlineEdit(event.id, 'eventDate')"
                        @keydown.enter.prevent="saveInlineEdit(event.id, 'eventDate')"
                        @keydown.esc.prevent="cancelEditing"
                        autofocus
                      />
                      <div
                        v-else
                        class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-gray-200"
                        @click="startEditing(event.id, 'eventDate', event.eventDate)"
                      >
                        <span v-if="event.eventDate">
                          {{ formatDateForDisplay(event.eventDate) }}
                        </span>
                        <span v-else class="text-gray-400 dark:text-gray-500">Click to set</span>
                      </div>
                    </td>

                    <!-- Event Name -->
                    <td class="px-4 py-3">
                      <input
                        v-if="editingCell?.eventId === event.id && editingCell?.field === 'eventName'"
                        class="w-full px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        type="text"
                        :value="editingValue"
                        @input="onInlineInput"
                        @blur="saveInlineEdit(event.id, 'eventName')"
                        @keydown.enter.prevent="saveInlineEdit(event.id, 'eventName')"
                        @keydown.esc.prevent="cancelEditing"
                        autofocus
                      />
                      <div
                        v-else
                        class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-gray-200"
                        @click="startEditing(event.id, 'eventName', event.eventName)"
                      >
                        <span v-if="event.eventName">{{ event.eventName }}</span>
                        <span v-else class="text-gray-400 dark:text-gray-500">Click to set</span>
                      </div>
                    </td>

                    <!-- Category -->
                    <td class="px-4 py-3">
                      <select
                        v-if="editingCell?.eventId === event.id && editingCell?.field === 'eventCategoryId'"
                        class="w-full px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        :value="editingValue"
                        @change="onInlineSelectChange"
                        @blur="saveInlineEdit(event.id, 'eventCategoryId')"
                        @keydown.enter.prevent="saveInlineEdit(event.id, 'eventCategoryId')"
                        @keydown.esc.prevent="cancelEditing"
                        autofocus
                      >
                        <option
                          v-for="cat in eventCategories.filter(c => c.eventTypeId === event.eventTypeId)"
                          :key="cat.id"
                          :value="cat.id"
                        >
                          {{ cat.name }}
                        </option>
                      </select>

                      <div
                        v-else
                        class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-gray-200"
                        @click="startEditing(event.id, 'eventCategoryId', event.eventCategoryId)"
                      >
                        <span v-if="getCategoryName(event.eventCategoryId)">
                          {{ getCategoryName(event.eventCategoryId) }}
                        </span>
                        <span v-else class="text-gray-400 dark:text-gray-500">Click to set</span>
                      </div>
                    </td>

                    <!-- Revenue -->
                    <td class="px-4 py-3 text-right">
                      <span
                        v-if="event.event_revenue_HT !== undefined && event.event_revenue_HT !== null"
                        class="font-medium text-gray-900 dark:text-gray-200"
                      >
                        €{{ formatRevenue(event.event_revenue_HT) }}
                      </span>
                      <span v-else class="text-gray-400 dark:text-gray-500">-</span>
                    </td>

                    <!-- Tickets Scanned -->
                    <td class="px-4 py-3 text-right">
                      <span
                        v-if="event.ticketsScanned !== undefined && event.ticketsScanned !== null"
                        class="font-medium text-gray-900 dark:text-gray-200"
                      >
                        {{ formatInteger(event.ticketsScanned) }}
                      </span>
                      <span v-else class="text-gray-400 dark:text-gray-500">-</span>
                    </td>

                    <!-- Actions -->
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="openEditDialog(event)"
                        >
                          Edit
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          @click="handleDeleteEvent(event.id)"
                        >
                          <Trash2 class="w-4 h-4 text-red-500 dark:text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>

                  <tr v-if="paginatedEvents.length === 0">
                    <td colspan="7" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      {{ filteredEvents.length === 0
                        ? 'No events yet. Click "Add Event" to create your first event.'
                        : 'No events on this page.' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div class="border-t dark:border-gray-700 bg-white dark:bg-gray-900">
              <div class="px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <div>
                    Total:
                    <span class="font-medium dark:text-gray-300">{{ totalEvents || 0 }}</span>
                    event{{ (totalEvents || 0) !== 1 ? 's' : '' }}
                  </div>

                  <div v-if="pageSize !== 'all'">
                    Page
                    <span class="font-medium dark:text-gray-300">{{ currentPage || 1 }}</span>
                    of
                    <span class="font-medium dark:text-gray-300">{{ totalPages || 1 }}</span>
                  </div>

                  <div>
                    Showing
                    <span class="font-medium dark:text-gray-300">
                      {{ (totalEvents || 0) === 0 ? 0 : (startIndex || 0) + 1 }}
                    </span>
                    to
                    <span class="font-medium dark:text-gray-300">
                      {{ Math.min(endIndex || 0, totalEvents || 0) }}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-2">
                    <label class="text-sm text-gray-600 dark:text-gray-400">Per page:</label>

                    <Select
                      :value="pageSize.toString()"
                      @valueChange="onPageSizeChange"
                    >
                      <SelectTrigger class="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div v-if="pageSize !== 'all'" class="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="(currentPage || 1) === 1"
                      @click="goPrevPage"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="(currentPage || 1) >= (totalPages || 1)"
                      @click="goNextPage"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>

    <!-- Add/Edit Event Dialog -->
    <Dialog :open="showAddDialog" @openChange="setShowAddDialog">
      <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="edit-event-description">
        <DialogHeader>
          <DialogTitle>
            {{ editingEvent?.eventName ? 'Edit Event' : 'Add Event' }}
          </DialogTitle>
          <DialogDescription id="edit-event-description">
            Form to create or edit event details including space, configuration, dates, and event information
          </DialogDescription>
        </DialogHeader>

        <div v-if="editingEvent" class="space-y-4">
          <!-- Space -->
          <div>
            <Label>Space</Label>
            <select
              class="w-full px-3 py-2 border rounded-md"
              :value="editingEvent.spaceId"
              @change="onEditSpaceChange"
            >
              <option value="">Select Space</option>
              <option
                v-for="space in spaces"
                :key="space.id"
                :value="space.id"
              >
                {{ space.name }}
              </option>
            </select>
          </div>

          <!-- Configuration -->
          <div v-if="editingEvent.spaceId">
            <Label>Configuration</Label>
            <select
              class="w-full px-3 py-2 border rounded-md"
              :value="editingEvent.configurationId"
              @change="onEditConfigurationChange"
            >
              <option value="">Select Configuration</option>
              <option
                v-for="config in (configurations[editingEvent.spaceId] || [])"
                :key="config.id"
                :value="config.id"
              >
                {{ config.name }}
              </option>
            </select>
          </div>

          <!-- Event Date -->
          <div>
            <Label>Event Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" class="w-full justify-between">
                  <span v-if="editingEvent.eventDate">
                    {{ formatDialogDate(editingEvent.eventDate) }}
                  </span>
                  <span v-else class="text-gray-500">Select a date</span>
                  <CalendarIcon class="w-4 h-4" />
                </Button>
              </PopoverTrigger>

              <PopoverContent class="w-auto p-0">
                <Calendar
                  mode="single"
                  :selected="dialogSelectedDate"
                  @select="onDialogDateSelect"
                />
              </PopoverContent>
            </Popover>
          </div>

          <!-- Event Name -->
          <div>
            <Label>Event Name</Label>
            <Input
              placeholder="Enter event name"
              :value="editingEvent.eventName"
              @input="onEditEventNameInput"
            />
          </div>

          <!-- Event Type -->
          <div>
            <Label>Event Type</Label>
            <div class="flex gap-2">
              <select
                class="flex-1 px-3 py-2 border rounded-md"
                :value="editingEvent.eventTypeId"
                @change="onEditEventTypeChange"
              >
                <option value="">Select Type</option>
                <option
                  v-for="type in eventTypes"
                  :key="type.id"
                  :value="type.id"
                >
                  {{ type.name }}
                </option>
                <option value="__add_new__">+ Add New Type</option>
              </select>

              <Dialog
                v-if="editingEvent.eventTypeId === '__add_new__'"
                :open="showAddTypeDialog"
                @openChange="setShowAddTypeDialog"
              >
                <DialogTrigger asChild>
                  <Button variant="outline" @click="setShowAddTypeDialog(true)">Add</Button>
                </DialogTrigger>

                <DialogContent aria-describedby="add-event-type-description">
                  <DialogHeader>
                    <DialogTitle>Add Event Type</DialogTitle>
                    <DialogDescription id="add-event-type-description">
                      Add a new event type category
                    </DialogDescription>
                  </DialogHeader>

                  <div class="space-y-4">
                    <div>
                      <Label>Type Name</Label>
                      <Input
                        placeholder="Enter type name"
                        :value="newTypeName"
                        @input="onNewTypeNameInput"
                      />
                    </div>

                    <div class="flex gap-2">
                      <Button @click="handleAddEventType">Add</Button>
                      <Button variant="outline" @click="setShowAddTypeDialog(false)">Cancel</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <!-- Event Category -->
          <div v-if="editingEvent.eventTypeId && editingEvent.eventTypeId !== '__add_new__'">
            <Label>Event Category</Label>
            <div class="flex gap-2">
              <select
                class="flex-1 px-3 py-2 border rounded-md"
                :value="editingEvent.eventCategoryId"
                @change="onEditEventCategoryChange"
              >
                <option value="">Select Category</option>
                <option
                  v-for="category in getFilteredCategories(editingEvent.eventTypeId)"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
                <option value="__add_new__">+ Add New Category</option>
              </select>
            </div>
          </div>

          <!-- Event Subcategory -->
          <div v-if="editingEvent.eventCategoryId && editingEvent.eventCategoryId !== '__add_new__'">
            <Label>Event Sub-category</Label>
            <div class="flex gap-2">
              <select
                class="flex-1 px-3 py-2 border rounded-md"
                :value="editingEvent.eventSubcategoryId || ''"
                @change="onEditEventSubcategoryChange"
              >
                <option value="">Select Sub-category</option>
                <option
                  v-for="subcategory in getFilteredSubcategories(editingEvent.eventCategoryId)"
                  :key="subcategory.id"
                  :value="subcategory.id"
                >
                  {{ subcategory.name }}
                </option>
                <option value="__add_new__">+ Add New Sub-category</option>
              </select>
            </div>
          </div>

          <!-- Performer Name (Entertainment only) -->
          <div v-if="editingEvent.eventTypeId && isEntertainmentType(editingEvent.eventTypeId)">
            <Label>Performer Name</Label>
            <Input
              placeholder="Enter performer name"
              :value="editingEvent.performerName || ''"
              @input="onEditPerformerNameInput"
            />
          </div>

          <!-- Home Team Name (Sports with home team only) -->
          <div v-if="editingEvent.eventCategoryId">
            <Label>Home Team Name</Label>
            <Input
              placeholder="Enter home team name"
              :value="editingEvent.homeTeamName || ''"
              @input="onEditHomeTeamNameInput"
            />
          </div>

          <!-- Visiting Team -->
          <div v-if="editingEvent.eventCategoryId">
            <Label>Visiting Team</Label>
            <div class="flex gap-2">
              <select
                class="flex-1 px-3 py-2 border rounded-md"
                :value="editingEvent.visitingTeamId || ''"
                @change="onEditVisitingTeamChange"
              >
                <option value="">Select Visiting Team</option>
                <option
                  v-for="team in getFilteredTeams(editingEvent.eventCategoryId, editingEvent.eventSubcategoryId)"
                  :key="team.id"
                  :value="team.id"
                >
                  {{ team.name }}
                </option>
                <option value="__add_new__">+ Add New Team</option>
              </select>
            </div>
          </div>

          <!-- Sponsor (Tradeshow only) -->
          <div v-if="editingEvent.eventCategoryId && isTradeshowCategory(editingEvent.eventCategoryId)">
            <Label>Sponsor Name</Label>
            <div class="flex gap-2">
              <select
                class="flex-1 px-3 py-2 border rounded-md"
                :value="editingEvent.sponsorId || ''"
                @change="onEditSponsorChange"
              >
                <option value="">Select Sponsor</option>
                <option
                  v-for="sponsor in sponsors"
                  :key="sponsor.id"
                  :value="sponsor.id"
                >
                  {{ sponsor.name }}
                </option>
                <option value="__add_new__">+ Add New Sponsor</option>
              </select>
            </div>
          </div>

          <!-- Number of Sessions -->
          <div>
            <Label>Number of Sessions</Label>
            <Input
              type="number"
              min="1"
              :value="editingEvent.numberOfSessions"
              @input="onEditSessionCountInput"
            />
          </div>

          <!-- Session Times -->
          <div class="space-y-4">
            <div
              v-for="(session, index) in editingEvent.sessions"
              :key="index"
              class="border rounded-lg p-4"
            >
              <h4 class="mb-3">Session {{ index + 1 }}</h4>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <Label>Doors Opening (HH:MM)</Label>
                  <Input
                    type="time"
                    :value="session.doorsOpening"
                    @input="onEditSessionDoorsInput(index)"
                  />
                </div>
                <div>
                  <Label>Show Time (HH:MM)</Label>
                  <Input
                    type="time"
                    :value="session.showTime"
                    @input="onEditSessionShowInput(index)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Opening Act -->
          <div>
            <Label>Opening Act</Label>
            <select
              class="w-full px-3 py-2 border rounded-md"
              :value="editingEvent.hasOpeningAct ? 'yes' : 'no'"
              @change="onEditHasOpeningActChange"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          <div v-if="editingEvent.hasOpeningAct">
            <Label>Opening Act Name</Label>
            <Input
              placeholder="Enter opening act name"
              :value="editingEvent.openingActName || ''"
              @input="onEditOpeningActNameInput"
            />
          </div>

          <!-- Intermission -->
          <div>
            <Label>Intermission</Label>
            <select
              class="w-full px-3 py-2 border rounded-md"
              :value="editingEvent.hasIntermission ? 'yes' : 'no'"
              @change="onEditHasIntermissionChange"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          <!-- Tickets Sold -->
          <div>
            <Label>Tickets Sold</Label>
            <Input
              type="number"
              min="0"
              placeholder="Enter number of tickets sold"
              :value="editingEvent.ticketsSold || ''"
              @input="onEditTicketsSoldInput"
            />
          </div>

          <!-- Tickets Scanned -->
          <div>
            <Label>Tickets Scanned</Label>
            <Input
              type="number"
              min="0"
              placeholder="Enter number of tickets scanned"
              :value="editingEvent.ticketsScanned || ''"
              @input="onEditTicketsScannedInput"
            />
          </div>

          <div class="flex gap-2 pt-4">
            <Button @click="handleSaveEvent">Save Event</Button>
            <Button variant="outline" @click="setShowAddDialog(false)">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Add Category Dialog -->
    <Dialog :open="showAddCategoryDialog" @openChange="setShowAddCategoryDialog">
      <DialogContent aria-describedby="add-event-category-description">
        <DialogHeader>
          <DialogTitle>Add Event Category</DialogTitle>
          <DialogDescription id="add-event-category-description">
            Add a new event category with optional home team setting
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <Label>Category Name</Label>
            <Input
              placeholder="Enter category name"
              :value="newCategoryName"
              @input="onNewCategoryNameInput"
            />
          </div>

          <div class="flex items-center space-x-2">
            <Checkbox
              id="hasHomeTeam"
              :checked="newCategoryHasHomeTeam"
              @checkedChange="setNewCategoryHasHomeTeam"
            />
            <Label for="hasHomeTeam">Has Home Team</Label>
          </div>

          <div class="flex gap-2">
            <Button @click="handleAddEventCategory">Add</Button>
            <Button variant="outline" @click="setShowAddCategoryDialog(false)">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Add Subcategory Dialog -->
    <Dialog :open="showAddSubcategoryDialog" @openChange="setShowAddSubcategoryDialog">
      <DialogContent aria-describedby="add-event-subcategory-description">
        <DialogHeader>
          <DialogTitle>Add Event Sub-category</DialogTitle>
          <DialogDescription id="add-event-subcategory-description">
            Add a new event sub-category
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <Label>Sub-category Name</Label>
            <Input
              placeholder="Enter sub-category name"
              :value="newSubcategoryName"
              @input="onNewSubcategoryNameInput"
            />
          </div>

          <div class="flex gap-2">
            <Button @click="handleAddEventSubcategory">Add</Button>
            <Button variant="outline" @click="setShowAddSubcategoryDialog(false)">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Add Team Dialog -->
    <Dialog :open="showAddTeamDialog" @openChange="setShowAddTeamDialog">
      <DialogContent aria-describedby="add-team-description">
        <DialogHeader>
          <DialogTitle>Add Team</DialogTitle>
          <DialogDescription id="add-team-description">
            Add a new team for sports events
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <Label>Team Name</Label>
            <Input
              placeholder="Enter team name"
              :value="newTeamName"
              @input="onNewTeamNameInput"
            />
          </div>

          <div class="flex gap-2">
            <Button @click="handleAddTeam">Add</Button>
            <Button variant="outline" @click="setShowAddTeamDialog(false)">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Add Sponsor Dialog -->
    <Dialog :open="showAddSponsorDialog" @openChange="setShowAddSponsorDialog">
      <DialogContent aria-describedby="add-sponsor-description">
        <DialogHeader>
          <DialogTitle>Add Sponsor</DialogTitle>
          <DialogDescription id="add-sponsor-description">
            Add a new sponsor for tradeshow events
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <Label>Sponsor Name</Label>
            <Input
              placeholder="Enter sponsor name"
              :value="newSponsorName"
              @input="onNewSponsorNameInput"
            />
          </div>

          <div class="flex gap-2">
            <Button @click="handleAddSponsor">Add</Button>
            <Button variant="outline" @click="setShowAddSponsorDialog(false)">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Hidden file input -->
    <input
      type="file"
      ref="fileInputRef"
      accept=".csv"
      class="hidden"
      @change="handleFileUpload"
    />
  </div>
</template>
<script>
//import { toast } from 'sonner'
import * as api from '../utils/api.js'
import * as eventApi from '../utils/eventApi.js'
import { getEvents as getEventsNew } from '@/api/endpoints/event.api'
import { getTeams as restGetTeams, createTeam as restCreateTeam } from '@/api/endpoints/team.api'
import { api as nestApi } from '@/api/client'
import { projectId, publicAnonKey } from '../utils/supabase/info'

import EventsImportWizard from './EventsImportWizard.vue'

// UI components (à mapper vers tes versions Vue)
import Input  from '../ui/input.vue'
import Button from '../ui/button.vue'
import ScrollArea  from '../ui/scrollArea.vue'
import Dialog from '../ui/dialog.vue'
import DialogContent from '../ui/dialogContent.vue'
import DialogHeader from '../ui/dialogHeader.vue'
import DialogTitle from '../ui/dialogTitle.vue'
import DialogDescription from '../ui/dialogDescription.vue'
import DialogTrigger from '../ui/dialogTrigger.vue'
import Label from '../ui/label.vue'
import Checkbox from '../ui/checkbox.vue'
import Popover from '../ui/popover.vue'
import PopoverContent from '../ui/popoverContent.vue'
import PopoverTrigger from '../ui/popoverTrigger.vue'
import Calendar  from '../ui/calendar.vue'
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import Select from '../ui/select.vue'
import SelectTrigger from '../ui/selectTrigger.vue'
import SelectValue from '../ui/selectValue.vue'
import SelectContent from '../ui/selectContent.vue'
import SelectItem from '../ui/selectItem.vue'
import DropdownMenu from '../ui/dropdownMenu.vue'
import DropdownMenuContent from '../ui/dropdownMenuContent.vue'
import DropdownMenuItem from '../ui/dropdownMenuItem.vue'
import DropdownMenuLabel from '../ui/dropdownMenuLabel.vue'
import DropdownMenuSeparator from '../ui/dropdownMenuSeparator.vue'
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue'

// Icons (à mapper)
import {
  Plus,
  Trash2,
  X,
  CalendarIcon,
  Search,
  Filter,
  Download,
  Upload,
  Loader2,
  DollarSign,
  RotateCcw,
} from 'lucide-vue-next'

export default {
  name: 'EventsView',

  components: {
    EventsImportWizard,

    Button,
    Input,
    ScrollArea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
    Label,
    Checkbox,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Calendar,
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

    Plus,
    Trash2,
    X,
    CalendarIcon,
    Search,
    Filter,
    Download,
    Upload,
    Loader2,
    DollarSign,
    RotateCcw,
  },

  props: {
    onClose: { type: Function, required: false },
  },

  data() {
    return {
      events: [],
      spaces: [],
      nestSpaces: [],
      configurations: {},
      eventTypes: [],
      eventCategories: [],
      eventSubcategories: [],
      teams: [],
      sponsors: [],

      editingEvent: null,
      showAddDialog: false,
      searchQuery: '',
      filterLocation: 'all',
      filterEventCategory: 'all',

      showAddTypeDialog: false,
      showAddCategoryDialog: false,
      showAddSubcategoryDialog: false,
      showAddTeamDialog: false,
      showAddSponsorDialog: false,

      newTypeName: '',
      newCategoryName: '',
      newCategoryHasHomeTeam: false,
      newCategoryTypeId: '',
      newSubcategoryName: '',
      newSubcategoryCategoryId: '',
      newTeamName: '',
      newTeamCategoryId: '',
      newTeamSubcategory: '',
      newSponsorName: '',

      showImportWizard: false,
      importFile: null,
      csvHeaders: [],
      csvData: [],

      editingCell: null,
      editingValue: null,

      currentPage: 1,
      pageSize: 50,

      isCalculatingRevenue: false,

      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
    }
  },

  computed: {
    isMobile() {
      return this.windowWidth < 768
    },

    filteredEvents() {
      const filtered = this.events
        .filter((event) => {
          if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase()

            const spaceName = (this.getSpaceName(event.spaceId) || '').toLowerCase()
            const configName = (this.getConfigName(event.spaceId, event.configurationId) || '').toLowerCase()
            const eventDate = (event.eventDate || '').toLowerCase()
            const eventName = (event.eventName || '').toLowerCase()
            const eventTypeName = (this.getEventTypeName(event.eventTypeId) || '').toLowerCase()
            const categoryName = (this.getCategoryName(event.eventCategoryId) || '').toLowerCase()
            const sessions = (event.numberOfSessions ?? '').toString()

            const matchesSearch =
              spaceName.includes(query) ||
              configName.includes(query) ||
              eventDate.includes(query) ||
              eventName.includes(query) ||
              eventTypeName.includes(query) ||
              categoryName.includes(query) ||
              sessions.includes(query)

            if (!matchesSearch) return false
          }

          if (this.filterLocation !== 'all' && event.spaceId !== this.filterLocation) return false
          if (this.filterEventCategory !== 'all' && event.eventCategoryId !== this.filterEventCategory) return false

          return true
        })
        .sort((a, b) => {
          if (!a.eventDate && !b.eventDate) return 0
          if (!a.eventDate) return 1
          if (!b.eventDate) return -1

          const parseDate = (dateStr) => {
            const parts = dateStr.split('/')
            if (parts.length !== 3) return NaN
            const day = parseInt(parts[0], 10)
            const month = parseInt(parts[1], 10) - 1
            const year = parseInt(parts[2], 10)
            return new Date(year, month, day).getTime()
          }

          const dateA = parseDate(a.eventDate)
          const dateB = parseDate(b.eventDate)

          if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0
          if (Number.isNaN(dateA)) return 1
          if (Number.isNaN(dateB)) return -1

          return dateB - dateA
        })

      return filtered
    },

    totalEvents() {
      return this.filteredEvents.length
    },

    totalPages() {
      if (this.pageSize === 'all') return 1
      return Math.max(1, Math.ceil(this.totalEvents / this.pageSize))
    },

    startIndex() {
      if (this.pageSize === 'all') return 0
      return (this.currentPage - 1) * this.pageSize
    },

    endIndex() {
      if (this.pageSize === 'all') return this.totalEvents
      return this.startIndex + this.pageSize
    },

    paginatedEvents() {
      if (this.pageSize === 'all') return this.filteredEvents
      return this.filteredEvents.slice(this.startIndex, this.endIndex)
    },

    dialogSelectedDate() {
      if (!this.editingEvent?.eventDate) return undefined
      return new Date(this.editingEvent.eventDate + 'T00:00:00')
    },
  },

  watch: {
    searchQuery() {
      this.currentPage = 1
    },
    filterLocation() {
      this.currentPage = 1
    },
    filterEventCategory() {
      this.currentPage = 1
    },
  },

  mounted() {
    this.loadData()
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

    // --- Wizard ---
    setShowImportWizard(open) {
      this.showImportWizard = open
    },

    onImportComplete() {
      this.loadData()
      this.showImportWizard = false
      this.csvHeaders = []
      this.csvData = []
      this.importFile = null
    },

    // --- Data loading ---
    async loadData() {
      try {
        const [
          spacesData,
          eventsData,
          typesData,
          categoriesData,
          subcategoriesData,
          teamsData,
          sponsorsData,
        ] = await Promise.all([
          api.getAllSpaces(),
          getEventsNew(),
          eventApi.getEventTypes(),
          eventApi.getEventCategories(),
          eventApi.getEventSubcategories(),
          // getTeams : migré make-server (uvxx MORT) → NestJS (team.api). Renvoie []
          // sur 404 tant que le backend n'expose pas /teams (docs/BACKEND_TEAMS_EVENTS.md).
          restGetTeams(),
          eventApi.getSponsors(),
        ])

        this.spaces = spacesData

        // Charger les spaces NestJS (IDs compatibles avec event.spaceId)
        try {
          const nestSpacesRes = await nestApi.get('/spaces', { params: { limit: 100 } })
          const raw = nestSpacesRes?.data ?? nestSpacesRes ?? []
          this.nestSpaces = Array.isArray(raw) ? raw : []
        } catch (e) {
          console.warn('[EventsView] NestJS spaces fetch failed:', e)
        }

        const rawEvents = Array.isArray(eventsData) ? eventsData : (eventsData?.data ?? [])
        this.events = rawEvents.map(e => ({
          ...e,
          eventName: e.eventName || e.name || '',
        }))
        this.eventTypes = typesData
        this.eventCategories = categoriesData
        this.eventSubcategories = subcategoriesData
        this.teams = teamsData
        this.sponsors = sponsorsData

        const configsMap = {}
        for (const space of spacesData) {
          try {
            const configs = await api.getSpaceConfigurations(space.id)
            configsMap[space.id] = configs
          } catch (err) {
            console.warn(
              `Could not load configurations for space ${space.id}. This is normal if the server is restarting.`
            )
            configsMap[space.id] = []
          }
        }
        this.configurations = configsMap
      } catch (error) {
        console.error('Error loading spaces:', error)
        const errorMessage = error?.message || 'Network connection lost.'

        if (errorMessage === 'Network connection lost.') {
          toast.error('Unable to connect to server. Please ensure the Supabase Edge Function is deployed.', {
            duration: 7000,
          })
        } else {
          toast.error('Error loading spaces: ' + errorMessage)
        }
      }
    },

    async fetchEvents() {
      try {
        const eventsData = await eventApi.getAllEvents()
        this.events = eventsData
      } catch (error) {
        console.error('Failed to fetch events:', error)
      }
    },

    // --- Event helpers ---
    createNewEvent() {
      return {
        id: crypto.randomUUID(),
        spaceId: '',
        configurationId: '',
        eventDate: '',
        eventName: '',
        eventTypeId: '',
        eventCategoryId: '',
        numberOfSessions: 1,
        sessions: [{ doorsOpening: '', showTime: '' }],
        hasOpeningAct: false,
        hasIntermission: false,
      }
    },

    handleAddEvent() {
      this.editingEvent = this.createNewEvent()
      this.showAddDialog = true
    },

    openEditDialog(event) {
      this.editingEvent = event
      this.showAddDialog = true
    },

    async handleSaveEvent() {
      if (!this.editingEvent) return

      try {
        const existingIndex = this.events.findIndex((e) => e.id === this.editingEvent.id)

        if (existingIndex >= 0) {
          await eventApi.updateEvent(this.editingEvent)
          const newEvents = [...this.events]
          newEvents[existingIndex] = this.editingEvent
          this.events = newEvents
        } else {
          await eventApi.createEvent(this.editingEvent)
          this.events = [...this.events, this.editingEvent]
        }

        this.showAddDialog = false
        this.editingEvent = null
      } catch (error) {
        console.error('Failed to save event:', error)
      }
    },

    async handleDeleteEvent(eventId) {
      try {
        await eventApi.deleteEvent(eventId)
        this.events = this.events.filter((e) => e.id !== eventId)
      } catch (error) {
        console.error('Failed to delete event:', error)
      }
    },

    // --- Add Type/Category/Subcategory/Team/Sponsor ---
    async handleAddEventType() {
      if (!this.newTypeName.trim()) return
      try {
        const newType = { id: crypto.randomUUID(), name: this.newTypeName }
        await eventApi.createEventType(newType)
        this.eventTypes = [...this.eventTypes, newType]
        this.newTypeName = ''
        this.showAddTypeDialog = false
      } catch (error) {
        console.error('Failed to add event type:', error)
      }
    },

    async handleAddEventCategory() {
      if (!this.newCategoryName.trim() || !this.newCategoryTypeId) return
      try {
        const newCategory = {
          id: crypto.randomUUID(),
          name: this.newCategoryName,
          eventTypeId: this.newCategoryTypeId,
          hasHomeTeam: this.newCategoryHasHomeTeam,
        }

        await eventApi.createEventCategory(newCategory)
        this.eventCategories = [...this.eventCategories, newCategory]

        this.updateEditingEvent({
          eventCategoryId: newCategory.id,
          eventSubcategoryId: undefined,
        })

        this.newCategoryName = ''
        this.newCategoryTypeId = ''
        this.newCategoryHasHomeTeam = false
        this.showAddCategoryDialog = false
      } catch (error) {
        console.error('Failed to add event category:', error)
      }
    },

    async handleAddEventSubcategory() {
      if (!this.newSubcategoryName.trim() || !this.newSubcategoryCategoryId) return
      try {
        const newSubcategory = {
          id: crypto.randomUUID(),
          name: this.newSubcategoryName,
          eventCategoryId: this.newSubcategoryCategoryId,
        }

        await eventApi.createEventSubcategory(newSubcategory)
        this.eventSubcategories = [...this.eventSubcategories, newSubcategory]
        this.updateEditingEvent({ eventSubcategoryId: newSubcategory.id })

        this.newSubcategoryName = ''
        this.newSubcategoryCategoryId = ''
        this.showAddSubcategoryDialog = false
      } catch (error) {
        console.error('Failed to add event subcategory:', error)
      }
    },

    async handleAddTeam() {
      if (!this.newTeamName.trim() || !this.newTeamCategoryId) return
      try {
        const payload = {
          // Shape acceptée backend (body 400 confirmé) : { name, eventCategoryId,
          // eventSubcategoryId }. DTO forbidNonWhitelisted → sportCategoryId/subcategory = 400.
          name: this.newTeamName,
          eventCategoryId: this.newTeamCategoryId,
          ...(this.newTeamSubcategory ? { eventSubcategoryId: this.newTeamSubcategory } : {}),
        }

        // createTeam → NestJS POST /teams. On réutilise l'équipe RENVOYÉE (id + champs
        // persistés par le backend) pour que visitingTeamId pointe le bon id après
        // reload ; repli optimiste (id client) seulement si le backend ne renvoie rien.
        const created = await restCreateTeam(payload)
        const team = created && created.id
          ? created
          : { id: crypto.randomUUID(), ...payload }
        this.teams = [...this.teams, team]
        this.updateEditingEvent({ visitingTeamId: team.id })

        this.newTeamName = ''
        this.newTeamCategoryId = ''
        this.newTeamSubcategory = ''
        this.showAddTeamDialog = false
      } catch (error) {
        console.error('Failed to add team:', error)
      }
    },

    async handleAddSponsor() {
      if (!this.newSponsorName.trim()) return
      try {
        const newSponsor = { id: crypto.randomUUID(), name: this.newSponsorName }
        await eventApi.createSponsor(newSponsor)
        this.sponsors = [...this.sponsors, newSponsor]
        this.newSponsorName = ''
        this.showAddSponsorDialog = false
      } catch (error) {
        console.error('Failed to add sponsor:', error)
      }
    },

    // --- Editing event model updates ---
    updateEditingEvent(updates) {
      if (!this.editingEvent) return
      this.editingEvent = { ...this.editingEvent, ...updates }
    },

    updateSessionCount(count) {
      if (!this.editingEvent) return
      const sessions = Array(count)
        .fill(null)
        .map((_, i) => this.editingEvent.sessions[i] || { doorsOpening: '', showTime: '' })
      this.updateEditingEvent({ numberOfSessions: count, sessions })
    },

    updateSession(index, field, value) {
      if (!this.editingEvent) return
      const sessions = [...this.editingEvent.sessions]
      sessions[index] = { ...sessions[index], [field]: value }
      this.updateEditingEvent({ sessions })
    },

    // --- Filtering helpers ---
    getFilteredCategories(typeId) {
      return this.eventCategories.filter((cat) => cat.eventTypeId === typeId)
    },

    getFilteredSubcategories(categoryId) {
      return this.eventSubcategories.filter((sub) => sub.eventCategoryId === categoryId)
    },

    getFilteredTeams(categoryId, subcategory) {
      // Tolère les 2 conventions de nommage : le front écrit sportCategoryId/subcategory,
      // le backend NestJS peut renvoyer eventCategoryId/eventSubcategoryId (cf.
      // docs/BACKEND_TEAMS_EVENTS.md, point « à trancher »). On accepte les deux pour
      // que les équipes créées restent visibles après reload quel que soit le backend.
      const cat = (t) => t.sportCategoryId ?? t.eventCategoryId
      const sub = (t) => t.subcategory ?? t.eventSubcategoryId
      return this.teams.filter(
        (team) => cat(team) === categoryId && (!subcategory || sub(team) === subcategory)
      )
    },

    getCategoryHasHomeTeam(categoryId) {
      const category = this.eventCategories.find((cat) => cat.id === categoryId)
      return category?.hasHomeTeam || false
    },

    getSpaceNameById(spaceId) {
      if (!spaceId) return null
      const space = this.nestSpaces.find(s => s.id === spaceId)
      return space?.name || null
    },

    isEntertainmentType(typeId) {
      const type = this.eventTypes.find((t) => t.id === typeId)
      return type?.name === 'Entertainment'
    },

    isTradeshowCategory(categoryId) {
      const category = this.eventCategories.find((cat) => cat.id === categoryId)
      return category?.name === 'Tradeshow'
    },

    getSpaceName(spaceId) {
      return this.spaces.find((s) => s.id === spaceId)?.name || ''
    },

    getConfigName(spaceId, configId) {
      return this.configurations[spaceId]?.find((c) => c.id === configId)?.name || ''
    },

    getEventTypeName(typeId) {
      return this.eventTypes.find((t) => t.id === typeId)?.name || ''
    },

    getCategoryName(categoryId) {
      return this.eventCategories.find((c) => c.id === categoryId)?.name || ''
    },

    // --- Date helpers ---
    convertDDMMYYYYtoISO(dateStr) {
      if (!dateStr) return ''
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr
      const [day, month, year] = dateStr.split('/')
      if (day && month && year) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      return dateStr
    },

    convertISOtoDDMMYYYY(dateStr) {
      if (!dateStr) return ''
      if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateStr
      const [year, month, day] = dateStr.split('-')
      if (year && month && day) return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
      return dateStr
    },

    formatDateForDisplay(dateStr) {
      if (!dateStr) return ''
      return this.convertISOtoDDMMYYYY(dateStr)
    },

    formatDialogDate(dateStr) {
      if (!dateStr) return ''
      return new Date(dateStr + 'T00:00:00').toLocaleDateString()
    },

    // --- Inline editing ---
    startEditing(eventId, field, currentValue) {
      this.editingCell = { eventId, field }
      if (field === 'eventDate') {
        this.editingValue = this.convertDDMMYYYYtoISO(currentValue || '')
      } else {
        this.editingValue = currentValue
      }
    },

    cancelEditing() {
      this.editingCell = null
      this.editingValue = null
    },

    async saveInlineEdit(eventId, field) {
      const event = this.events.find((e) => e.id === eventId)
      if (!event) return

      let valueToSave = this.editingValue
      if (field === 'eventDate') valueToSave = this.convertISOtoDDMMYYYY(this.editingValue)

      const updatedEvent = { ...event, [field]: valueToSave }

      try {
        await eventApi.updateEvent(updatedEvent)
        this.events = this.events.map((e) => (e.id === eventId ? updatedEvent : e))
        toast.success('Event updated')
        this.cancelEditing()
      } catch (error) {
        console.error('Failed to update event:', error)
        toast.error('Failed to update event')
      }
    },

    onInlineInput(e) {
      this.editingValue = e.target.value
    },

    onInlineSelectChange(e) {
      this.editingValue = e.target.value
    },

    // --- Search/filter handlers ---
    onSearchInput(e) {
      this.searchQuery = e.target.value
    },

    setFilterLocation(value) {
      this.filterLocation = value
    },

    setFilterEventCategory(value) {
      this.filterEventCategory = value
    },

    // --- Pagination handlers ---
    onPageSizeChange(value) {
      this.pageSize = value === 'all' ? 'all' : parseInt(value, 10)
      this.currentPage = 1
    },

    goPrevPage() {
      this.currentPage = Math.max(1, this.currentPage - 1)
    },

    goNextPage() {
      this.currentPage = Math.min(this.totalPages, this.currentPage + 1)
    },

    // --- Export CSV ---
    handleExportCSV() {
      if (this.filteredEvents.length === 0) {
        toast.error('No events to export')
        return
      }

      const headers = [
        'Space',
        'Configuration',
        'Event Date',
        'Event Name',
        'Event Type',
        'Event Category',
        'Event Subcategory',
        'Doors Open',
        'Show Time',
        'Performer Name',
        'Home Team Name',
        'Visiting Team',
        'Sponsor',
        'Number of Sessions',
        'All Sessions (Doors|Show)',
        'Has Opening Act',
        'Opening Act Name',
        'Has Intermission',
        'Tickets Sold',
        'Tickets Scanned',
      ]

      const rows = this.filteredEvents.map((event) => {
        const subcategory = event.eventSubcategoryId
          ? this.eventSubcategories.find((s) => s.id === event.eventSubcategoryId)?.name || ''
          : ''
        const visitingTeam = event.visitingTeamId
          ? this.teams.find((t) => t.id === event.visitingTeamId)?.name || ''
          : ''
        const sponsor = event.sponsorId
          ? this.sponsors.find((s) => s.id === event.sponsorId)?.name || ''
          : ''
        const firstSessionDoorsOpen = event.sessions?.length ? event.sessions[0].doorsOpening || '' : ''
        const firstSessionShowTime = event.sessions?.length ? event.sessions[0].showTime || '' : ''
        const allSessionsText = (event.sessions || []).map((s) => `${s.doorsOpening}|${s.showTime}`).join('; ')

        return [
          this.getSpaceName(event.spaceId),
          this.getConfigName(event.spaceId, event.configurationId),
          event.eventDate,
          event.eventName,
          this.getEventTypeName(event.eventTypeId),
          this.getCategoryName(event.eventCategoryId),
          subcategory,
          firstSessionDoorsOpen,
          firstSessionShowTime,
          event.performerName || '',
          event.homeTeamName || '',
          visitingTeam,
          sponsor,
          event.numberOfSessions.toString(),
          allSessionsText,
          event.hasOpeningAct ? 'Yes' : 'No',
          event.openingActName || '',
          event.hasIntermission ? 'Yes' : 'No',
          event.ticketsSold?.toString() || '',
          event.ticketsScanned?.toString() || '',
        ]
      })

      const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `events_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      toast.success('Events exported successfully')
    },

    // --- Import CSV ---
    handleImportClick() {
      const input = this.$refs.fileInputRef
      input?.click()
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
        const text = event.target?.result || ''
        const { headers, rows } = this.parseCSV(String(text))

        if (headers.length === 0 || rows.length === 0) {
          toast.error('Invalid CSV file')
          return
        }

        this.importFile = file
        this.csvHeaders = headers
        this.csvData = rows
        this.showImportWizard = true
      }
      reader.readAsText(file)

      e.target.value = ''
    },

    // --- Revenue calc ---
    async handleCalculateEventRevenue() {
      if (this.isCalculatingRevenue) return

      try {
        this.isCalculatingRevenue = true
        let totalProcessed = 0
        let batchCount = 0
        const maxBatches = 10

        toast.info('Starting event revenue calculation...')

        while (batchCount < maxBatches) {
          batchCount++

          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/events/calculate-revenue`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({ limit: 50 }),
            }
          )

          if (!response.ok) throw new Error(`Server responded with ${response.status}`)

          const result = await response.json()

          if (!result.success) {
            toast.error('Failed to calculate event revenue')
            console.error('Event revenue calculation error:', result.error)
            break
          }

          totalProcessed += result.processedCount

          if (result.hasMore) {
            toast.info(`Processing events... ${totalProcessed}/${result.totalEvents}`)
            await new Promise((resolve) => setTimeout(resolve, 500))
          } else {
            break
          }
        }

        await this.loadData()
        toast.success(`✓ Event revenue calculated! Processed ${totalProcessed} events`)
        this.isCalculatingRevenue = false
      } catch (error) {
        console.error('Error calculating event revenue:', error)
        toast.error(`Error calculating event revenue: ${error.message}`)
        this.isCalculatingRevenue = false
      }
    },

    async handleCleanupDuplicateEvents() {
      try {
        const confirmed = confirm(
          'This will remove duplicate events based on matching event name and date.\n\n' +
            'Associated shop revenue records for duplicates will also be removed.\n\n' +
            'Continue?'
        )
        if (!confirmed) return

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/events/cleanup-duplicates`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
              'Content-Type': 'application/json',
            },
          }
        )

        const result = await response.json()

        if (result.success) {
          if (result.duplicatesRemoved > 0) {
            toast.success(
              `✓ Cleaned up ${result.duplicatesRemoved} duplicate event(s) and ${result.shopRevenueRecordsRemoved} associated shop revenue record(s)`
            )
            await this.loadData()
          } else {
            toast.info('No duplicate events found')
          }
        } else {
          toast.error(result.error || 'Failed to cleanup duplicate events')
        }
      } catch (error) {
        console.error('Error cleaning up duplicate events:', error)
        toast.error('Error cleaning up duplicate events')
      }
    },

    // --- Dialog open/close ---
    setShowAddDialog(open) {
      this.showAddDialog = open
      if (!open) this.editingEvent = null
    },

    setShowAddTypeDialog(open) {
      this.showAddTypeDialog = open
    },
    setShowAddCategoryDialog(open) {
      this.showAddCategoryDialog = open
    },
    setShowAddSubcategoryDialog(open) {
      this.showAddSubcategoryDialog = open
    },
    setShowAddTeamDialog(open) {
      this.showAddTeamDialog = open
    },
    setShowAddSponsorDialog(open) {
      this.showAddSponsorDialog = open
    },

    setNewCategoryHasHomeTeam(val) {
      this.newCategoryHasHomeTeam = !!val
    },

    async onEditSpaceChange(e) {
      const spaceId = e.target.value

      const selectedSpace = this.spaces.find((s) => s.id === spaceId)
      const homeTeam = selectedSpace?.homeTeam || ''

      this.updateEditingEvent({ spaceId, configurationId: '', homeTeamName: homeTeam })

      if (spaceId) {
        try {
          const configs = await api.getSpaceConfigurations(spaceId)
          this.configurations = { ...this.configurations, [spaceId]: configs }
        } catch (error) {
          console.error('Failed to load configurations for space:', error)
        }
      }
    },

    onEditConfigurationChange(e) {
      this.updateEditingEvent({ configurationId: e.target.value })
    },

    onDialogDateSelect(date) {
      if (!date) {
        this.updateEditingEvent({ eventDate: '' })
        return
      }
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      this.updateEditingEvent({ eventDate: `${year}-${month}-${day}` })
    },

    onEditEventNameInput(e) {
      this.updateEditingEvent({ eventName: e.target.value })
    },

    onEditEventTypeChange(e) {
      this.updateEditingEvent({
        eventTypeId: e.target.value,
        eventCategoryId: '',
        eventSubcategoryId: undefined,
      })
    },

    onEditEventCategoryChange(e) {
      const value = e.target.value

      if (value === '__add_new__') {
        if (this.editingEvent) this.newCategoryTypeId = this.editingEvent.eventTypeId
        this.showAddCategoryDialog = true
        return
      }

      this.updateEditingEvent({
        eventCategoryId: value,
        eventSubcategoryId: undefined,
      })
    },

    onEditEventSubcategoryChange(e) {
      const value = e.target.value

      if (value === '__add_new__') {
        if (this.editingEvent) this.newSubcategoryCategoryId = this.editingEvent.eventCategoryId
        this.showAddSubcategoryDialog = true
        return
      }

      this.updateEditingEvent({ eventSubcategoryId: value })
    },

    onEditPerformerNameInput(e) {
      this.updateEditingEvent({ performerName: e.target.value })
    },

    onEditHomeTeamNameInput(e) {
      this.updateEditingEvent({ homeTeamName: e.target.value })
    },

    onEditVisitingTeamChange(e) {
      const value = e.target.value

      if (value === '__add_new__') {
        if (this.editingEvent) {
          this.newTeamCategoryId = this.editingEvent.eventCategoryId
          this.newTeamSubcategory = this.editingEvent.eventSubcategoryId || ''
        }
        this.showAddTeamDialog = true
        return
      }

      this.updateEditingEvent({ visitingTeamId: value })
    },

    onEditSponsorChange(e) {
      const value = e.target.value

      if (value === '__add_new__') {
        this.showAddSponsorDialog = true
        return
      }

      this.updateEditingEvent({ sponsorId: value })
    },

    onEditSessionCountInput(e) {
      const count = parseInt(e.target.value, 10) || 1
      this.updateSessionCount(count)
    },

    onEditSessionDoorsInput(index) {
      return (e) => this.updateSession(index, 'doorsOpening', e.target.value)
    },

    onEditSessionShowInput(index) {
      return (e) => this.updateSession(index, 'showTime', e.target.value)
    },

    onEditHasOpeningActChange(e) {
      const yes = e.target.value === 'yes'
      this.updateEditingEvent({
        hasOpeningAct: yes,
        openingActName: yes ? this.editingEvent?.openingActName : undefined,
      })
    },

    onEditOpeningActNameInput(e) {
      this.updateEditingEvent({ openingActName: e.target.value })
    },

    onEditHasIntermissionChange(e) {
      this.updateEditingEvent({ hasIntermission: e.target.value === 'yes' })
    },

    onEditTicketsSoldInput(e) {
      this.updateEditingEvent({ ticketsSold: parseInt(e.target.value, 10) || 0 })
    },

    onEditTicketsScannedInput(e) {
      this.updateEditingEvent({ ticketsScanned: parseInt(e.target.value, 10) || 0 })
    },

    onNewTypeNameInput(e) {
      this.newTypeName = e.target.value
    },
    onNewCategoryNameInput(e) {
      this.newCategoryName = e.target.value
    },
    onNewSubcategoryNameInput(e) {
      this.newSubcategoryName = e.target.value
    },
    onNewTeamNameInput(e) {
      this.newTeamName = e.target.value
    },
    onNewSponsorNameInput(e) {
      this.newSponsorName = e.target.value
    },

    formatRevenue(value) {
      return Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    },

    formatInteger(value) {
      return Number(value).toLocaleString('fr-FR')
    },
  },
}
</script>