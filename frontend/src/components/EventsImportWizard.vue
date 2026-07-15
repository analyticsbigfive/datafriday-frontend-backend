<template>
  <!-- React: if (!open) return null -->
  <div v-if="open" class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Header with Close Button -->
    <div class="border-b bg-white dark:bg-gray-900 p-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" :disabled="isCalculating" @click="handleClose">
          <X class="w-5 h-5" />
        </Button>

        <div>
          <h2 class="font-semibold">Import Events from CSV</h2>
          <p class="text-sm text-gray-500">
            Step {{ currentStep }} of 5:
            <template v-if="currentStep === 1">Map Fields</template>
            <template v-else-if="currentStep === 2">Map Event Types</template>
            <template v-else-if="currentStep === 3">Map Event Categories</template>
            <template v-else-if="currentStep === 4">Map Event Subcategories</template>
            <template v-else>Calculate Event Revenues</template>
          </p>
        </div>
      </div>
    </div>

    <ScrollArea class="flex-1">
      <div class="p-4 w-full">
        <Card class="w-full max-w-5xl mx-auto">
          <CardContent class="p-6">
            <!-- Progress Bar -->
            <div class="mb-6">
              <div class="flex gap-2">
                <div
                  v-for="step in [1,2,3,4,5]"
                  :key="step"
                  :class="`flex-1 h-2 rounded-full ${
                    step < currentStep ? 'bg-green-600' :
                    step === currentStep ? 'bg-blue-600' :
                    'bg-gray-200'
                  }`"
                />
              </div>
            </div>

            <!-- ===================== -->
            <!-- Step 1: Field Mapping -->
            <!-- ===================== -->
            <div v-if="currentStep === 1" class="space-y-4">
              <div class="text-sm text-gray-600">
                Map the CSV columns to Event Library fields. Required fields are marked with an asterisk (*).
              </div>

              <ScrollArea class="h-[400px] pr-4">
                <div class="space-y-3">
                  <div
                    v-for="target in FIELD_MAPPING_TARGETS"
                    :key="target.key"
                    class="flex items-center gap-3"
                  >
                    <Label class="w-48 flex-shrink-0">
                      {{ target.label }}
                      <span v-if="target.required" class="text-red-500 ml-1">*</span>
                    </Label>

                    <Select
                      :value="fieldMapping[target.key] || '__none__'"
                      @valueChange="(value) => onFieldMappingChange(target.key, value)"
                    >
                      <SelectTrigger class="flex-1">
                        <SelectValue placeholder="Select CSV column..." />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="__none__">Not mapped</SelectItem>
                        <SelectItem
                          v-for="header in csvHeaders"
                          :key="header"
                          :value="header"
                        >
                          {{ header }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </ScrollArea>
            </div>

            <!-- ===================== -->
            <!-- Step 2: Type Mapping  -->
            <!-- ===================== -->
            <div v-else-if="currentStep === 2" class="space-y-4">
              <div class="text-sm text-gray-600">
                Map Event Type values from your CSV to existing Event Types, or create new ones.
              </div>

              <ScrollArea class="h-[400px] pr-4">
                <div class="space-y-3">
                  <div
                    v-for="tm in typeMappings"
                    :key="tm.csvValue"
                    class="space-y-2 p-3 border rounded-lg"
                  >
                    <div class="flex items-center gap-3">
                      <Badge variant="secondary" class="flex-shrink-0">
                        CSV: {{ tm.csvValue }}
                      </Badge>

                      <Select
                        :value="tm.isNew ? '__new__' : (tm.eventTypeId || '')"
                        @valueChange="(value) => handleTypeMapping(tm.csvValue, value)"
                      >
                        <SelectTrigger class="flex-1">
                          <SelectValue placeholder="Select Event Type..." />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem
                            v-for="type in eventTypes"
                            :key="type.id"
                            :value="type.id"
                          >
                            {{ type.name }}
                          </SelectItem>

                          <SelectItem value="__new__">
                            <div class="flex items-center gap-2">
                              <Plus class="w-4 h-4" />
                              Create New Event Type
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div v-if="tm.isNew" class="flex items-center gap-2 ml-8">
                      <Label class="text-sm">New Type Name:</Label>
                      <Input
                        class="flex-1"
                        placeholder="Enter Event Type name..."
                        :value="tm.newName || ''"
                        @input="(e) => handleTypeNewName(tm.csvValue, e.target.value)"
                      />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>

            <!-- ========================= -->
            <!-- Step 3: Category Mapping  -->
            <!-- ========================= -->
            <div v-else-if="currentStep === 3" class="space-y-4">
              <div class="text-sm text-gray-600">
                Map Event Category values from your CSV to existing Event Categories (filtered by Event Type), or create new ones.
              </div>

              <ScrollArea class="h-[400px] pr-4">
                <div class="space-y-3">
                  <div
                    v-for="cm in categoryMappings"
                    :key="cm.csvValue"
                    class="space-y-2 p-3 border rounded-lg"
                  >
                    <div class="flex items-start gap-3">
                      <div class="flex-shrink-0 space-y-1">
                        <Badge variant="outline" class="text-xs">
                          Type: {{ getTypeNameForCategoryMapping(cm) }}
                        </Badge>
                        <Badge variant="secondary">
                          CSV: {{ cm.categoryValue }}
                        </Badge>
                      </div>

                      <Select
                        :value="cm.isNew ? '__new__' : (cm.eventCategoryId || '')"
                        @valueChange="(value) => handleCategoryMapping(cm.csvValue, value)"
                      >
                        <SelectTrigger class="flex-1">
                          <SelectValue placeholder="Select Event Category..." />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem
                            v-for="category in getAvailableCategoriesForMapping(cm)"
                            :key="category.id"
                            :value="category.id"
                          >
                            {{ category.name }}
                          </SelectItem>

                          <SelectItem value="__new__">
                            <div class="flex items-center gap-2">
                              <Plus class="w-4 h-4" />
                              Create New Event Category
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div v-if="cm.isNew" class="flex items-center gap-2 ml-8">
                      <Label class="text-sm">New Category Name:</Label>
                      <Input
                        class="flex-1"
                        placeholder="Enter Category name..."
                        :value="cm.newName || ''"
                        @input="(e) => handleCategoryNewName(cm.csvValue, e.target.value)"
                      />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>

            <!-- ============================ -->
            <!-- Step 4: Subcategory Mapping  -->
            <!-- ============================ -->
            <template v-else-if="currentStep === 4">
              <div
                v-if="uniqueSubcategoryValues.length === 0"
                class="flex items-center justify-center h-[400px] text-gray-500"
              >
                <div class="text-center">
                  <p>No Event Subcategories found in CSV</p>
                  <p class="text-sm mt-2">Click Next to proceed to revenue calculation</p>
                </div>
              </div>

              <div v-else class="space-y-4">
                <div class="text-sm text-gray-600">
                  Map Event Subcategory values from your CSV to existing Event Subcategories (filtered by Event Category), or create new ones.
                </div>

                <ScrollArea class="h-[400px] pr-4">
                  <div class="space-y-3">
                    <div
                      v-for="sm in subcategoryMappings"
                      :key="sm.csvValue"
                      class="space-y-2 p-3 border rounded-lg"
                    >
                      <div class="flex items-start gap-3">
                        <div class="flex-shrink-0 space-y-1">
                          <Badge variant="outline" class="text-xs">
                            Category: {{ getCategoryNameForSubcategoryMapping(sm) }}
                          </Badge>
                          <Badge variant="secondary">
                            CSV: {{ sm.subcategoryValue }}
                          </Badge>
                        </div>

                        <Select
                          :value="sm.isNew ? '__new__' : (sm.eventSubcategoryId || '__none__')"
                          @valueChange="(value) => handleSubcategoryMapping(sm.csvValue, value)"
                        >
                          <SelectTrigger class="flex-1">
                            <SelectValue placeholder="Select Event Subcategory..." />
                          </SelectTrigger>

                          <SelectContent>
                            <SelectItem value="__none__">Not mapped (optional)</SelectItem>

                            <SelectItem
                              v-for="subcategory in getAvailableSubcategoriesForMapping(sm)"
                              :key="subcategory.id"
                              :value="subcategory.id"
                            >
                              {{ subcategory.name }}
                            </SelectItem>

                            <SelectItem value="__new__">
                              <div class="flex items-center gap-2">
                                <Plus class="w-4 h-4" />
                                Create New Event Subcategory
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div v-if="sm.isNew" class="flex items-center gap-2 ml-8">
                        <Label class="text-sm">New Subcategory Name:</Label>
                        <Input
                          class="flex-1"
                          placeholder="Enter Subcategory name..."
                          :value="sm.newName || ''"
                          @input="(e) => handleSubcategoryNewName(sm.csvValue, e.target.value)"
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </template>

            <!-- ===================== -->
            <!-- Step 5: Calculation   -->
            <!-- ===================== -->
            <template v-else>
              <!-- Not complete: loading + progress -->
              <div v-if="!calculationComplete" class="space-y-6">
                <div class="flex items-center justify-center py-8">
                  <Loader2 class="w-8 h-8 animate-spin text-blue-600" />
                </div>

                <div class="space-y-2">
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Processing events...</span>
                    <span class="font-medium">{{ calculationProgress }} / {{ calculationTotal }} events</span>
                  </div>

                  <Progress
                    class="h-2"
                    :value="calculationTotal ? (calculationProgress / calculationTotal) * 100 : 0"
                  />
                </div>

                <ScrollArea v-if="calculationResults.length > 0" class="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Event Date</TableHead>
                        <TableHead>Event Name</TableHead>
                        <TableHead class="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      <TableRow
                        v-for="(result, index) in calculationResults"
                        :key="index"
                      >
                        <TableCell>
                          <CheckCircle2
                            v-if="result.status === 'success'"
                            class="w-4 h-4 text-green-600"
                          />
                          <AlertCircle
                            v-else
                            class="w-4 h-4 text-red-600"
                          />
                        </TableCell>

                        <TableCell>{{ result.eventDate }}</TableCell>
                        <TableCell>{{ result.eventName }}</TableCell>
                        <TableCell class="text-right">
                          <template v-if="result.status === 'success'">
                            €{{ Number(result.revenue || 0).toFixed(2) }}
                          </template>
                          <template v-else>-</template>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <!-- Complete: summary + list + close -->
              <div v-else class="flex flex-col" style="height: calc(100vh - 300px);">
                <div class="flex items-center justify-center py-4">
                  <CheckCircle2 class="w-12 h-12 text-green-600" />
                </div>

                <div class="grid grid-cols-3 gap-4 mb-6">
                  <div class="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                    <div class="text-2xl font-bold text-green-700">{{ successfulEvents.length }}</div>
                    <div class="text-sm text-green-600">Events Imported</div>
                  </div>

                  <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <div class="text-2xl font-bold text-blue-700">€{{ Number(totalRevenue || 0).toFixed(2) }}</div>
                    <div class="text-sm text-blue-600">Total Revenue</div>
                  </div>

                  <div class="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                    <div class="text-2xl font-bold text-red-700">{{ failedEvents.length }}</div>
                    <div class="text-sm text-red-600">Failed</div>
                  </div>
                </div>

                <div class="flex-1 overflow-hidden">
                  <ScrollArea class="h-full">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Event Date</TableHead>
                          <TableHead>Event Name</TableHead>
                          <TableHead class="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        <TableRow
                          v-for="(result, index) in successfulEvents"
                          :key="index"
                        >
                          <TableCell>{{ result.eventDate }}</TableCell>
                          <TableCell>{{ result.eventName }}</TableCell>
                          <TableCell class="text-right">
                            €{{ Number(result.revenue || 0).toFixed(2) }}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>

                <!-- Close button always visible at bottom -->
                <div class="pt-6 mt-6 border-t">
                  <div class="flex justify-end">
                    <Button @click="handleClose">Close</Button>
                  </div>
                </div>
              </div>
            </template>

            <!-- Footer Buttons -->
            <div class="flex gap-2 mt-6 justify-end">
              <Button
                v-if="currentStep > 1 && !isCalculating && !calculationComplete"
                variant="outline"
                @click="handleBack"
              >
                <ChevronLeft class="w-4 h-4 mr-2" />
                Back
              </Button>

              <Button
                v-if="!calculationComplete"
                :disabled="
                  isCalculating ||
                  (currentStep === 1 && !canProceedFromStep1()) ||
                  (currentStep === 2 && !canProceedFromStep2()) ||
                  (currentStep === 3 && !canProceedFromStep3()) ||
                  (currentStep === 4 && !canProceedFromStep4())
                "
                @click="handleNext"
              >
                <template v-if="currentStep === 4">
                  Import &amp; Calculate
                </template>
                <template v-else>
                  Next
                  <ChevronRight class="w-4 h-4 ml-2" />
                </template>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  </div>
</template>

<script>
//import { toast } from 'sonner'
import * as eventApi from '../utils/eventApi.js'
import * as api from '../utils/api.js'
import { projectId, publicAnonKey } from '../utils/supabase/info'
import Button from '../ui/button.vue'
import Label from '../ui/label.vue'
import ScrollArea from '../ui/scrollArea.vue'
import Badge from '../ui/badge.vue'
import Input from '../ui/input.vue'
import Progress from '../ui/progress.vue'
import Table from '../ui/table.vue'
import TableBody from '../ui/tableBody.vue'
import TableCell from '../ui/tableCell.vue'
import TableHead from '../ui/tableHead.vue'
import TableHeader from '../ui/tableHeader.vue'
import TableRow from '../ui/tableRow.vue'
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import Select from  '../ui/select.vue'
import SelectContent from '../ui/selectContent.vue'
import SelectItem from '../ui/selectItem.vue'
import SelectTrigger from '../ui/selectTrigger.vue'
import SelectValue from '../ui/selectValue.vue'
// Icons: à mapper (si tu utilises lucide-vue-next)
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Plus, Loader2, X } from 'lucide-vue-next'
const FIELD_MAPPING_TARGETS = [
  { key: 'location', label: 'Location', required: true },
  { key: 'space', label: 'Space', required: true },
  { key: 'configuration', label: 'Configuration', required: false },
  { key: 'eventDate', label: 'Event Date', required: true },
  { key: 'eventName', label: 'Event Name', required: true },
  { key: 'eventType', label: 'Event Type', required: true },
  { key: 'eventCategory', label: 'Event Category', required: true },
  { key: 'eventSubcategory', label: 'Event Subcategory', required: false },
  { key: 'performerName', label: 'Performer Name', required: false },
  { key: 'homeTeamName', label: 'Home Team Name', required: false },
  { key: 'visitingTeam', label: 'Visiting Team', required: false },
  { key: 'sponsor', label: 'Sponsor', required: false },
  { key: 'numberOfSessions', label: 'Number of Sessions', required: false },
  { key: 'sessions', label: 'Sessions (Doors|Show)', required: false },
  { key: 'hasOpeningAct', label: 'Has Opening Act', required: false },
  { key: 'openingActName', label: 'Opening Act Name', required: false },
  { key: 'hasIntermission', label: 'Has Intermission', required: false },
  { key: 'ticketsSold', label: 'Tickets Sold', required: false },
  { key: 'ticketsScanned', label: 'Tickets Scanned', required: false },
]
export default {
  name: 'EventsImportWizard',
  components: {
    Button,
    Label,
    ScrollArea,
    Badge,
    Input,
    Progress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Card,
    CardContent,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    AlertCircle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Plus,
    Loader2,
    X,
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
    csvData: { 
        type: Array, 
        required: true 
    },
    eventTypes: { 
        type: Array, 
        required: true 
    }, // initialEventTypes
    eventCategories: { 
        type: Array, 
        required: true 
    }, // initialEventCategories
    eventSubcategories: { 
        type: Array, 
        required: true 
    }, // initialEventSubcategories
    onComplete: { 
        type: Function, 
        required: true 
    },
    spaces: { 
        type: Array, 
        required: true 
    },
    configurations: { 
        type: Object, 
        required: true 
    },
    events: { 
        type: Array, 
        required: true 
    },
  },
  data() {
    return {
      FIELD_MAPPING_TARGETS,
      currentStep: 1,
      // Step 1
      fieldMapping: {},
      // Step 2
      typeMappings: [],
      localEventTypes: [],
      // Step 3
      categoryMappings: [],
      localEventCategories: [],
      // Step 4
      subcategoryMappings: [],
      localEventSubcategories: [],
      // Step 5
      isCalculating: false,
      calculationProgress: 0,
      calculationTotal: 0,
      calculationResults: [],
      calculationComplete: false,
      // Location -> Space mapping
      locationMappings: {},
      // internal guard to not re-suggest field mapping repeatedly
      _didInitFieldMapping: false,
    }
  },
  computed: {
    uniqueTypeValues() {
      const column = this.fieldMapping.eventType
      if (!column) return []
      const idx = this.csvHeaders.indexOf(column)
      if (idx === -1) return []
      const set = new Set()
      this.csvData.forEach((row) => {
        const value = (row?.[idx] || '').toString().trim()
        if (value) set.add(value)
      })
      return Array.from(set).sort()
    },
    uniqueCategoryValues() {
      if (!this.fieldMapping.eventType || !this.fieldMapping.eventCategory) return []
      const typeIdx = this.csvHeaders.indexOf(this.fieldMapping.eventType)
      const catIdx = this.csvHeaders.indexOf(this.fieldMapping.eventCategory)
      if (typeIdx === -1 || catIdx === -1) return []
      const map = new Map()
      this.csvData.forEach((row) => {
        const typeValue = (row?.[typeIdx] || '').toString().trim()
        const categoryValue = (row?.[catIdx] || '').toString().trim()
        if (typeValue && categoryValue) {
          const key = `${typeValue}|||${categoryValue}`
          if (!map.has(key)) map.set(key, { csvValue: key, typeValue, categoryValue })
        }
      })
      return Array.from(map.values()).sort(
        (a, b) => a.typeValue.localeCompare(b.typeValue) || a.categoryValue.localeCompare(b.categoryValue)
      )
    },
    uniqueSubcategoryValues() {
      if (!this.fieldMapping.eventType || !this.fieldMapping.eventCategory || !this.fieldMapping.eventSubcategory) return []
      const typeIdx = this.csvHeaders.indexOf(this.fieldMapping.eventType)
      const catIdx = this.csvHeaders.indexOf(this.fieldMapping.eventCategory)
      const subIdx = this.csvHeaders.indexOf(this.fieldMapping.eventSubcategory)
      if (typeIdx === -1 || catIdx === -1 || subIdx === -1) return []
      const map = new Map()
      this.csvData.forEach((row) => {
        const typeValue = (row?.[typeIdx] || '').toString().trim()
        const categoryValue = (row?.[catIdx] || '').toString().trim()
        const subcategoryValue = (row?.[subIdx] || '').toString().trim()
        if (typeValue && categoryValue && subcategoryValue) {
          const key = `${typeValue}|||${categoryValue}|||${subcategoryValue}`
          if (!map.has(key)) map.set(key, { csvValue: key, typeValue, categoryValue, subcategoryValue })
        }
      })
      return Array.from(map.values()).sort(
        (a, b) =>
          a.typeValue.localeCompare(b.typeValue) ||
          a.categoryValue.localeCompare(b.categoryValue) ||
          a.subcategoryValue.localeCompare(b.subcategoryValue)
      )
    },
    successfulEvents() {
      return (this.calculationResults || [])
        .filter((r) => r.status === 'success')
        .slice()
        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
    },
    failedEvents() {
      return (this.calculationResults || []).filter((r) => r.status === 'error')
    },
    totalRevenue() {
      return this.successfulEvents.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0)
    },
  },
  watch: {
    // sync props -> local copies (React useEffect)
    eventTypes: {
      immediate: true,
      handler(val) {
        this.localEventTypes = Array.isArray(val) ? [...val] : []
      },
    },
    eventCategories: {
      immediate: true,
      handler(val) {
        this.localEventCategories = Array.isArray(val) ? [...val] : []
      },
    },
    eventSubcategories: {
      immediate: true,
      handler(val) {
        this.localEventSubcategories = Array.isArray(val) ? [...val] : []
      },
    },
    // React: load location mappings when open
    open: {
      immediate: true,
      async handler(isOpen) {
        if (!isOpen) {
          // Reset mappings when dialog closes and reopens
          this.typeMappings = []
          this.categoryMappings = []
          this.subcategoryMappings = []
          this._didInitFieldMapping = false
          return
        }
        try {
          const mappings = await api.getLocationSpaceMappings()
          const obj = {}
          ;(mappings || []).forEach((m) => {
            obj[m.location] = { spaceId: m.spaceId, spaceName: m.spaceName }
          })
          this.locationMappings = obj
        } catch (error) {
          console.error('Error loading location-space mappings:', error)
        }
        // init field mapping once when opening
        this.initFieldMappingIfNeeded()
      },
    },
    // React: init type mappings when step 2 and empty
    currentStep(newStep) {
      if (newStep === 2) this.initTypeMappingsIfNeeded()
      if (newStep === 3) this.initCategoryMappingsIfNeeded()
      if (newStep === 4) this.initSubcategoryMappingsIfNeeded()
    },
    // React: init field mapping when headers available
    csvHeaders() {
      this.initFieldMappingIfNeeded()
    },
  },
  methods: {
    // ---------------------------
    // Smart column mapping (step1)
    // ---------------------------
    suggestMapping(csvHeader) {
      const normalized = (csvHeader || '').toString().toLowerCase().trim()
      const exactMatches = {
        location: ['location'],
        space: ['space', 'venue'],
        configuration: ['configuration', 'config', 'setup'],
        eventDate: ['event date', 'eventdate', 'date'],
        eventName: ['event name', 'eventname', 'event'],
        eventType: ['event type', 'eventtype', 'type'],
        eventCategory: ['event category', 'eventcategory', 'category'],
        eventSubcategory: ['event subcategory', 'eventsubcategory', 'subcategory', 'sub-category', 'sub category'],
        performerName: ['performer name', 'performername', 'performer'],
        homeTeamName: ['home team name', 'hometeamname', 'home team'],
        visitingTeam: ['visiting team', 'visitingteam', 'away team', 'awayteam'],
        sponsor: ['sponsor', 'sponsor name'],
        numberOfSessions: ['number of sessions', 'numberofsessions', 'sessions count', 'session count'],
        sessions: ['sessions (doors|show)', 'sessions', 'session times'],
        hasOpeningAct: ['has opening act', 'hasopeningact', 'opening act'],
        openingActName: ['opening act name', 'openingactname'],
        hasIntermission: ['has intermission', 'hasintermission', 'intermission'],
        ticketsSold: ['tickets sold', 'ticketssold'],
        ticketsScanned: ['tickets scanned', 'ticketsscanned'],
      }
      for (const key in exactMatches) {
        if (exactMatches[key].some((p) => normalized === p)) return key
      }
      if (normalized.includes('location')) return 'location'
      if (normalized.includes('space') || normalized.includes('venue')) return 'space'
      if (normalized.includes('config')) return 'configuration'
      if (normalized.includes('date')) return 'eventDate'
      if (normalized.includes('event') && normalized.includes('name')) return 'eventName'
      if (normalized.includes('type')) return 'eventType'
      if (normalized.includes('category') && !normalized.includes('sub')) return 'eventCategory'
      if (normalized.includes('subcategory') || normalized.includes('sub-category')) return 'eventSubcategory'
      if (normalized.includes('performer')) return 'performerName'
      if (normalized.includes('home') && normalized.includes('team')) return 'homeTeamName'
      if (normalized.includes('visiting') || normalized.includes('away')) return 'visitingTeam'
      if (normalized.includes('sponsor')) return 'sponsor'
      return null
    },
    initFieldMappingIfNeeded() {
      if (!this.open) return
      if (this._didInitFieldMapping) return
      if (!Array.isArray(this.csvHeaders) || this.csvHeaders.length === 0) return
      // only if user hasn't started mapping yet
      if (Object.keys(this.fieldMapping || {}).length > 0) {
        this._didInitFieldMapping = true
        return
      }
      const initial = {}
      FIELD_MAPPING_TARGETS.forEach((target) => {
        const suggestion = this.csvHeaders.find((h) => this.suggestMapping(h) === target.key)
        if (suggestion) initial[target.key] = suggestion
      })
      this.fieldMapping = initial
      this._didInitFieldMapping = true
    },
    onFieldMappingChange(targetKey, value) {
      if (value === '__none__') {
        const next = { ...(this.fieldMapping || {}) }
        delete next[targetKey]
        this.fieldMapping = next
      } else {
        this.fieldMapping = { ...(this.fieldMapping || {}), [targetKey]: value }
      }
    },
    // ---------------------------
    // Step init (2/3/4)
    // ---------------------------
    initTypeMappingsIfNeeded() {
      if (this.typeMappings.length > 0) return
      if (this.uniqueTypeValues.length === 0) return
      this.typeMappings = this.uniqueTypeValues.map((csvValue) => {
        const existing = (this.localEventTypes || []).find(
          (t) => (t.name || '').toLowerCase().trim() === csvValue.toLowerCase().trim()
        )
        return { csvValue, eventTypeId: existing?.id || '', isNew: false }
      })
    },
    initCategoryMappingsIfNeeded() {
      if (this.categoryMappings.length > 0) return
      if (this.uniqueCategoryValues.length === 0) return
      this.categoryMappings = this.uniqueCategoryValues.map((item) => {
        const typeMapping = this.typeMappings.find((tm) => tm.csvValue === item.typeValue)
        const mappedTypeId = typeMapping?.eventTypeId || ''
        const existing = (this.localEventCategories || []).find(
          (c) =>
            (c.name || '').toLowerCase().trim() === item.categoryValue.toLowerCase().trim() &&
            c.eventTypeId === mappedTypeId
        )
        return {
          csvValue: item.csvValue,
          typeValue: item.typeValue,
          categoryValue: item.categoryValue,
          eventCategoryId: existing?.id || '',
          eventTypeId: mappedTypeId,
          isNew: false,
        }
      })
    },
    initSubcategoryMappingsIfNeeded() {
      if (this.subcategoryMappings.length > 0) return
      if (this.uniqueSubcategoryValues.length === 0) return
      this.subcategoryMappings = this.uniqueSubcategoryValues.map((item) => {
        const categoryKey = `${item.typeValue}|||${item.categoryValue}`
        const categoryMapping = this.categoryMappings.find((cm) => cm.csvValue === categoryKey)
        const mappedCategoryId = categoryMapping?.eventCategoryId || ''
        const existing = (this.localEventSubcategories || []).find(
          (s) =>
            (s.name || '').toLowerCase().trim() === item.subcategoryValue.toLowerCase().trim() &&
            s.eventCategoryId === mappedCategoryId
        )
        return {
          csvValue: item.csvValue,
          typeValue: item.typeValue,
          categoryValue: item.categoryValue,
          subcategoryValue: item.subcategoryValue,
          eventSubcategoryId: existing?.id || '',
          eventCategoryId: mappedCategoryId,
          isNew: false,
        }
      })
    },
    // ---------------------------
    // Mapping handlers
    // ---------------------------
    handleTypeMapping(csvValue, value) {
      this.typeMappings = this.typeMappings.map((tm) => {
        if (tm.csvValue !== csvValue) return tm
        if (value === '__new__') return { ...tm, eventTypeId: '', isNew: true, newName: csvValue }
        return { ...tm, eventTypeId: value, isNew: false, newName: undefined }
      })
    },
    handleTypeNewName(csvValue, newName) {
      this.typeMappings = this.typeMappings.map((tm) => (tm.csvValue === csvValue ? { ...tm, newName } : tm))
    },
    handleCategoryMapping(csvValue, value) {
      this.categoryMappings = this.categoryMappings.map((cm) => {
        if (cm.csvValue !== csvValue) return cm
        if (value === '__new__') return { ...cm, eventCategoryId: '', isNew: true, newName: cm.categoryValue }
        return { ...cm, eventCategoryId: value, isNew: false, newName: undefined }
      })
    },
    handleCategoryNewName(csvValue, newName) {
      this.categoryMappings = this.categoryMappings.map((cm) => (cm.csvValue === csvValue ? { ...cm, newName } : cm))
    },
    handleSubcategoryMapping(csvValue, value) {
      this.subcategoryMappings = this.subcategoryMappings.map((sm) => {
        if (sm.csvValue !== csvValue) return sm
        if (value === '__new__') return { ...sm, eventSubcategoryId: '', isNew: true, newName: sm.subcategoryValue }
        if (value === '__none__') return { ...sm, eventSubcategoryId: '', isNew: false, newName: undefined }
        return { ...sm, eventSubcategoryId: value, isNew: false, newName: undefined }
      })
    },
    handleSubcategoryNewName(csvValue, newName) {
      this.subcategoryMappings = this.subcategoryMappings.map((sm) => (sm.csvValue === csvValue ? { ...sm, newName } : sm))
    },
    // ---------------------------
    // Template helpers (step 3/4)
    // ---------------------------
    getAvailableCategoriesForMapping(cm) {
      return (this.localEventCategories || []).filter((c) => c.eventTypeId === cm.eventTypeId)
    },
    getTypeNameForCategoryMapping(cm) {
      return (
        this.localEventTypes.find((t) => t.id === cm.eventTypeId)?.name ||
        this.typeMappings.find((tm) => tm.eventTypeId === cm.eventTypeId)?.newName ||
        cm.typeValue
      )
    },
    getAvailableSubcategoriesForMapping(sm) {
      return (this.localEventSubcategories || []).filter((s) => s.eventCategoryId === sm.eventCategoryId)
    },
    getCategoryNameForSubcategoryMapping(sm) {
      return (
        this.localEventCategories.find((c) => c.id === sm.eventCategoryId)?.name ||
        this.categoryMappings.find((cm) => cm.eventCategoryId === sm.eventCategoryId)?.newName ||
        sm.categoryValue
      )
    },
    // ---------------------------
    // Step guards
    // ---------------------------
    canProceedFromStep1() {
      const required = FIELD_MAPPING_TARGETS.filter((t) => t.required)
      return required.every((f) => this.fieldMapping && this.fieldMapping[f.key])
    },
    canProceedFromStep2() {
      return this.typeMappings.every((tm) => {
        if (tm.isNew) return tm.newName && tm.newName.trim() !== ''
        return tm.eventTypeId !== ''
      })
    },
    canProceedFromStep3() {
      return this.categoryMappings.every((cm) => {
        if (cm.isNew) return cm.newName && cm.newName.trim() !== ''
        return cm.eventCategoryId !== ''
      })
    },
    canProceedFromStep4() {
      return this.subcategoryMappings.every((sm) => {
        if (sm.isNew) return sm.newName && sm.newName.trim() !== ''
        return sm.eventSubcategoryId !== ''
      })
    },
    // ---------------------------
    // Navigation
    // ---------------------------
    async handleNext() {
      if (this.currentStep === 1 && !this.canProceedFromStep1()) {
        toast.error('Please map all required fields')
        return
      }
      if (this.currentStep === 2 && !this.canProceedFromStep2()) {
        toast.error('Please map all Event Types or provide names for new types')
        return
      }
      if (this.currentStep === 3 && !this.canProceedFromStep3()) {
        toast.error('Please map all Event Categories or provide names for new categories')
        return
      }
      if (this.currentStep === 4 && !this.canProceedFromStep4()) {
        toast.error('Please map all Event Subcategories or provide names for new subcategories')
        return
      }
      if (this.currentStep === 4) {
        await this.performImportAndCalculation()
      } else {
        this.currentStep = this.currentStep + 1
      }
    },
    handleBack() {
      if (this.currentStep > 1 && !this.isCalculating) {
        this.currentStep = this.currentStep - 1
      }
    },
    // ---------------------------
    // Import + revenue (step 5)
    // ---------------------------
    async performImportAndCalculation() {
      this.isCalculating = true
      this.calculationProgress = 0
      this.calculationTotal = this.csvData.length
      this.calculationResults = []
      this.calculationComplete = false
      this.currentStep = 5
      try {
        const createdTypes = []
        const createdCategories = []
        const createdSubcategories = []
        // Create new Event Types
        for (const tm of this.typeMappings) {
          if (tm.isNew && tm.newName) {
            const newType = { id: crypto.randomUUID(), name: tm.newName }
            await eventApi.createEventType(newType)
            createdTypes.push(newType)
            tm.eventTypeId = newType.id
          }
        }
        this.localEventTypes = [...this.localEventTypes, ...createdTypes]
        // Create new Event Categories
        for (const cm of this.categoryMappings) {
          if (cm.isNew && cm.newName) {
            const newCategory = {
              id: crypto.randomUUID(),
              name: cm.newName,
              eventTypeId: cm.eventTypeId,
              hasHomeTeam: false,
            }
            await eventApi.createEventCategory(newCategory)
            createdCategories.push(newCategory)
            cm.eventCategoryId = newCategory.id
          }
        }
        this.localEventCategories = [...this.localEventCategories, ...createdCategories]
        // Create new Event Subcategories
        for (const sm of this.subcategoryMappings) {
          if (sm.isNew && sm.newName) {
            const newSubcategory = { id: crypto.randomUUID(), name: sm.newName, eventCategoryId: sm.eventCategoryId }
            await eventApi.createEventSubcategory(newSubcategory)
            createdSubcategories.push(newSubcategory)
            sm.eventSubcategoryId = newSubcategory.id
          }
        }
        this.localEventSubcategories = [...this.localEventSubcategories, ...createdSubcategories]
        // Import events + revenue
        const results = []
        for (let i = 0; i < this.csvData.length; i++) {
          const row = this.csvData[i]
          const rowData = {}
          // map columns
          Object.entries(this.fieldMapping || {}).forEach(([targetField, csvColumn]) => {
            if (!csvColumn) return
            const colIndex = this.csvHeaders.indexOf(csvColumn)
            if (colIndex !== -1) rowData[targetField] = row[colIndex]
          })
          try {
            const typeColumnIndex = this.csvHeaders.indexOf(this.fieldMapping.eventType)
            const categoryColumnIndex = this.csvHeaders.indexOf(this.fieldMapping.eventCategory)
            const subcategoryColumnIndex = this.fieldMapping.eventSubcategory
              ? this.csvHeaders.indexOf(this.fieldMapping.eventSubcategory)
              : -1
            const typeValue = (row[typeColumnIndex] || '').toString().trim()
            const categoryValue = (row[categoryColumnIndex] || '').toString().trim()
            const subcategoryValue =
              subcategoryColumnIndex !== -1 ? (row[subcategoryColumnIndex] || '').toString().trim() : ''
            const typeMapping = this.typeMappings.find((tm) => tm.csvValue === typeValue)
            const categoryKey = `${typeValue}|||${categoryValue}`
            const categoryMapping = this.categoryMappings.find((cm) => cm.csvValue === categoryKey)
            let subcategoryMapping = null
            if (subcategoryValue) {
              const subKey = `${typeValue}|||${categoryValue}|||${subcategoryValue}`
              subcategoryMapping = this.subcategoryMappings.find((sm) => sm.csvValue === subKey)
            }
            if (!typeMapping || !categoryMapping) throw new Error('Missing type or category mapping')
            // Find space by location mapping first, fallback to space name
            let space = null
            const locationValue = (rowData.location || '').toString().trim()
            if (locationValue && this.locationMappings[locationValue]) {
              const mapping = this.locationMappings[locationValue]
              space = (this.spaces || []).find((s) => s.id === mapping.spaceId)
              console.log(
                `[CSV IMPORT] Using location mapping: "${locationValue}" -> "${mapping.spaceName}" (${mapping.spaceId})`
              )
            }
            if (!space && rowData.space) {
              space = (this.spaces || []).find(
                (s) => (s.name || '').toLowerCase() === (rowData.space || '').toString().trim().toLowerCase()
              )
              console.log(`[CSV IMPORT] Using space name match: "${rowData.space}" -> "${space?.name}"`)
            }
            if (!space) {
              const errorMsg =
                locationValue && this.locationMappings[locationValue]
                  ? `Space "${this.locationMappings[locationValue].spaceName}" (from location "${locationValue}") not found`
                  : `Space "${rowData.space}" not found. Please map location "${locationValue}" in Data Integration first.`
              throw new Error(errorMsg)
            }
            // config optional
            let configId = ''
            if (rowData.configuration && rowData.configuration.toString().trim() !== '') {
              const config = (this.configurations?.[space.id] || []).find(
                (c) => (c.name || '').toLowerCase() === rowData.configuration.toString().trim().toLowerCase()
              )
              configId = config?.id || ''
            }
            // sessions parse
            const sessions = []
            if (rowData.sessions) {
              const pairs = rowData.sessions.toString().split(';').map((s) => s.trim())
              pairs.forEach((pair) => {
                const [doors, show] = pair.split('|').map((t) => t.trim())
                if (doors || show) sessions.push({ doorsOpening: doors || '', showTime: show || '' })
              })
            }
            // check duplicate existing event by name/date
            const existingEvent = (this.events || []).find(
              (e) =>
                (e.eventName || '').toLowerCase().trim() === (rowData.eventName || '').toLowerCase().trim() &&
                e.eventDate === rowData.eventDate
            )
            const eventId = existingEvent ? existingEvent.id : crypto.randomUUID()
            // location field stored on event (backend uses it)
            const eventLocation = rowData.location || rowData.space || ''
            const newEvent = {
              id: eventId,
              spaceId: space.id,
              configurationId: configId,
              eventDate: rowData.eventDate,
              eventName: rowData.eventName,
              location: eventLocation,
              eventTypeId: typeMapping.eventTypeId,
              eventCategoryId: categoryMapping.eventCategoryId,
              eventSubcategoryId: subcategoryMapping?.eventSubcategoryId || undefined,
              numberOfSessions: sessions.length > 0 ? sessions.length : 1,
              sessions: sessions.length > 0 ? sessions : [{ doorsOpening: '', showTime: '' }],
              hasOpeningAct: (rowData.hasOpeningAct || '').toString().toLowerCase() === 'yes',
              openingActName: rowData.openingActName,
              hasIntermission: (rowData.hasIntermission || '').toString().toLowerCase() === 'yes',
              ticketsSold: rowData.ticketsSold ? parseInt(rowData.ticketsSold, 10) : undefined,
              ticketsScanned: rowData.ticketsScanned ? parseInt(rowData.ticketsScanned, 10) : undefined,
              performerName: rowData.performerName,
              homeTeamName: rowData.homeTeamName,
            }
            const createdEvent = await eventApi.createEvent(newEvent)
            // revenue
            let revenue = 0
            try {
              const revenueResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/event-revenue/${createdEvent.id}`,
                {
                  method: 'GET',
                  headers: { Authorization: `Bearer ${publicAnonKey}` },
                }
              )
              if (revenueResponse.ok) {
                const revenueData = await revenueResponse.json()
                revenue = revenueData.revenue || 0
              }
            } catch (err) {
              console.error('Error calculating revenue:', err)
            }
            results.push({
              eventId: createdEvent.id,
              eventName: newEvent.eventName,
              eventDate: newEvent.eventDate,
              revenue,
              status: 'success',
            })
          } catch (error) {
            results.push({
              eventId: '',
              eventName: rowData.eventName || `Row ${i + 1}`,
              eventDate: rowData.eventDate || '',
              revenue: 0,
              status: 'error',
              error: error?.message || String(error),
            })
          }
          this.calculationProgress = i + 1
          this.calculationResults = [...results]
        }
        this.calculationComplete = true
        toast.success(`Successfully imported ${results.filter((r) => r.status === 'success').length} events`)
      } catch (error) {
        console.error('Import error:', error)
        toast.error('Failed to import events: ' + (error?.message || String(error)))
      } finally {
        this.isCalculating = false
      }
    },
    // ---------------------------
    // Close / Reset
    // ---------------------------
    handleClose() {
      if (this.isCalculating) return
      this.currentStep = 1
      this.fieldMapping = {}
      this.typeMappings = []
      this.categoryMappings = []
      this.subcategoryMappings = []
      this.calculationProgress = 0
      this.calculationTotal = 0
      this.calculationResults = []
      this.calculationComplete = false
      // refresh parent after success
      if (this.calculationComplete) {
        this.onComplete()
      }
      this.onOpenChange(false)
    },
  },
}
</script>