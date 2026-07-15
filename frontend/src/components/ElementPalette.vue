<template>
  <div :class="condensed ? 'p-2 bg-white dark:bg-gray-900' : 'p-4 bg-white dark:bg-gray-900'">
    <Collapsible>
      <template v-if="!condensed">
        <CollapsibleTrigger
          class="flex items-center justify-between w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2 mb-2"
          @click="paletteOpen = !paletteOpen"
        >
          <h2 class="text-lg">Element Palette</h2>
          <ChevronDown
            class="w-5 h-5 transition-transform"
            :class="paletteOpen ? 'rotate-180' : ''"
          />
        </CollapsibleTrigger>
      </template>
      <CollapsibleContent v-if="paletteOpen">
        <div :class="condensed ? 'flex flex-col items-center gap-2' : 'space-y-2'">
          <div
            v-for="tool in tools"
            :key="tool.type"
          >
            <Card
              :class="[
                'p-3 transition-all',
                selectedTool === tool.type
                  ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/50'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800',
              ]"
            >
              <div
                class="flex items-center gap-3 cursor-pointer dark:hover:text-gray-100"
                @click="handleToolClick(tool)"
              >
                <div :class="['p-2 rounded', tool.color]">
                  <component :is="tool.icon" class="w-5 h-5" />
                </div>
                <div class="flex-1">
                  <div>{{ tool.label }}</div>
                </div>
                <ChevronRight
                  v-if="tool.hasTypes"
                  class="w-4 h-4 transition-transform cursor-pointer"
                  :class="isToolExpanded(tool) ? 'rotate-90' : ''"
                  @click.stop="toggleToolExpanded(tool)"
                />
              </div>
            </Card>

            <!-- Shop Type Selection -->
            <div
              v-if="tool.type === 'shop' && shopExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Shop type</div>
              <div class="space-y-2">
                <div
                  v-for="option in shopTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`shop-${option.value}`"
                    :modelValue="selectedShopTypes.includes(option.value)"
                    @update:modelValue="() => toggleShopType(option.value)"
                  />
                  <label
                    :for="`shop-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- Storage Type Selection -->
            <div
              v-if="tool.type === 'storage' && storageExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Storage type</div>
              <div class="space-y-2">
                <div
                  v-for="option in storageTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`storage-${option.value}`"
                    :modelValue="selectedStorageTypes.includes(option.value)"
                    @update:modelValue="() => toggleStorageType(option.value)"
                  />
                  <label
                    :for="`storage-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- Hospitality Type Selection -->
            <div
              v-if="tool.type === 'hospitality' && hospitalityExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Hospitality type</div>
              <div class="space-y-2">
                <div
                  v-for="option in hospitalityTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`hospitality-${option.value}`"
                    :modelValue="selectedHospitalityTypes.includes(option.value)"
                    @update:modelValue="() => toggleHospitalityType(option.value)"
                  />
                  <label
                    :for="`hospitality-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- Merch Type Selection -->
            <div
              v-if="tool.type === 'merchshop' && merchExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Merch type</div>
              <div class="space-y-2">
                <div
                  v-for="option in merchTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`merch-${option.value}`"
                    :modelValue="selectedMerchTypes.includes(option.value)"
                    @update:modelValue="() => toggleMerchType(option.value)"
                  />
                  <label
                    :for="`merch-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- Access Type Selection -->
            <div
              v-if="tool.type === 'access' && accessExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Access type</div>
              <div class="space-y-2">
                <div
                  v-for="option in accessTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`access-${option.value}`"
                    :modelValue="selectedAccessTypes.includes(option.value)"
                    @update:modelValue="() => toggleAccessType(option.value)"
                  />
                  <label
                    :for="`access-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- Entertainment Type Selection -->
            <div
              v-if="tool.type === 'entertainment' && entertainmentExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Entertainment type</div>
              <div class="space-y-2">
                <div
                  v-for="option in entertainmentTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`entertainment-${option.value}`"
                    :modelValue="selectedEntertainmentTypes.includes(option.value)"
                    @update:modelValue="() => toggleEntertainmentType(option.value)"
                  />
                  <label
                    :for="`entertainment-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- Entrance Type Selection -->
            <div
              v-if="tool.type === 'entrance' && entranceExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Ticketing type</div>
              <div class="space-y-2">
                <div
                  v-for="option in entranceTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`entrance-${option.value}`"
                    :modelValue="selectedEntranceTypes.includes(option.value)"
                    @update:modelValue="() => toggleEntranceType(option.value)"
                  />
                  <label
                    :for="`entrance-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- Kitchen Type Selection -->
            <div
              v-if="tool.type === 'kitchen' && kitchenExpanded"
              class="ml-4 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="text-sm mb-2">Kitchen type</div>
              <div class="space-y-2">
                <div
                  v-for="option in kitchenTypeOptions"
                  :key="option.value"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :id="`kitchen-${option.value}`"
                    :modelValue="selectedKitchenTypes.includes(option.value)"
                    @update:modelValue="() => toggleKitchenType(option.value)"
                    
                  />
                  <label
                    :for="`kitchen-${option.value}`"
                    class="text-sm cursor-pointer"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>

<script>
import {
  Store,
  Package,
  Scan,
  Drama,
  Trophy,
  Crown,
  ShoppingBag,
  ChevronDown,
  ChevronRight,
  Move,
  Sparkles,
  ChefHat,
} from 'lucide-vue-next';
import Button from '../ui/button.vue';
import Card from '../ui/card.vue';
import Checkbox from '../ui/checkbox.vue';
import Collapsible from '../ui/collapsible.vue';
import CollapsibleContent from '../ui/collapsibleContent.vue';
import CollapsibleTrigger from '../ui/collapsibleTrigger.vue';

export default {
  name: 'ElementPalette',
  components: {
    Store,
    Package,
    Scan,
    Drama,
    Trophy,
    Crown,
    ShoppingBag,
    ChevronDown,
    ChevronRight,
    Move,
    Sparkles,
    ChefHat,
    Button,
    Card,
    Checkbox,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  },
  props: {
    selectedTool: {
      type: String,
      default: null,
    },
    onSelectTool: {
      type: Function,
      required: true,
    },
    selectedStorageTypes: {
      type: Array,
      required: true,
    },
    onSelectStorageTypes: {
      type: Function,
      required: true,
    },
    selectedShopTypes: {
      type: Array,
      required: true,
    },
    onSelectShopTypes: {
      type: Function,
      required: true,
    },
    selectedHospitalityTypes: {
      type: Array,
      required: true,
    },
    onSelectHospitalityTypes: {
      type: Function,
      required: true,
    },
    selectedMerchTypes: {
      type: Array,
      required: true,
    },
    onSelectMerchTypes: {
      type: Function,
      required: true,
    },
    selectedAccessTypes: {
      type: Array,
      required: true,
    },
    onSelectAccessTypes: {
      type: Function,
      required: true,
    },
    selectedEntertainmentTypes: {
      type: Array,
      required: true,
    },
    onSelectEntertainmentTypes: {
      type: Function,
      required: true,
    },
    selectedEntranceTypes: {
      type: Array,
      required: true,
    },
    onSelectEntranceTypes: {
      type: Function,
      required: true,
    },
    selectedKitchenTypes: {
      type: Array,
      required: true,
    },
    onSelectKitchenTypes: {
      type: Function,
      required: true,
    },
    onClearSelectedElement: {
      type: Function,
      default: null,
    },
    condensed: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      paletteOpen: false,
      shopExpanded: false,
      storageExpanded: false,
      hospitalityExpanded: false,
      merchExpanded: false,
      accessExpanded: false,
      entertainmentExpanded: false,
      entranceExpanded: false,
      kitchenExpanded: false,
      storageTypeOptions: [
        { value: 'dry', label: 'Dry storage' },
        { value: 'cold', label: 'Cold storage' },
        { value: 'belowzero', label: 'Below zero storage' },
        { value: 'material', label: 'Material storage' },
        { value: 'merch', label: 'Merch storage' },
      ],
      shopTypeOptions: [
        { value: 'food', label: 'Food' },
        { value: 'beverages', label: 'Beverages' },
        { value: 'beer', label: 'Beer' },
        { value: 'gppremium', label: 'GP Premium' },
        { value: 'temporary', label: 'Temporary' },
        { value: 'drinkee', label: 'Drinkee' },
      ],
      hospitalityTypeOptions: [
        { value: 'lodges', label: 'Lodges' },
        { value: 'salon', label: 'Salon' },
      ],
      merchTypeOptions: [
        { value: 'onsite', label: 'On site' },
        { value: 'offsite', label: 'Off site' },
        { value: 'temporary', label: 'Temporary' },
      ],
      accessTypeOptions: [
        { value: 'lift', label: 'Lift' },
        { value: 'staircase', label: 'Staircase' },
        { value: 'servicelift', label: 'Service Lift' },
        { value: 'venueentrance', label: 'Venue Entrance' },
        { value: 'parking', label: 'Parking' },
        { value: 'reception', label: 'Reception' },
        { value: 'information', label: 'Information' },
      ],
      entertainmentTypeOptions: [
        { value: 'sportground', label: 'Sport Ground' },
        { value: 'stage', label: 'Stage' },
        { value: 'mice', label: 'M.I.C.E.' },
      ],
      entranceTypeOptions: [
        { value: 'public', label: 'Public' },
        { value: 'vip', label: 'VIP' },
        { value: 'staff', label: 'Staff' },
      ],
      kitchenTypeOptions: [
        { value: 'fb', label: 'F&B' },
        { value: 'hospitality', label: 'Hospitality' },
        { value: 'storage', label: 'Storage' },
      ],
      tools: [
        {
          type: 'shop',
          icon: Store,
          label: 'F&B',
          color: 'bg-green-100 text-green-700 border-green-300',
          hasTypes: true,
        },
        {
          type: 'hospitality',
          icon: Crown,
          label: 'Hospitality',
          color: 'bg-pink-100 text-pink-700 border-pink-300',
          hasTypes: true,
        },
        {
          type: 'merchshop',
          icon: ShoppingBag,
          label: 'Merch',
          color: 'bg-stone-100 text-stone-700 border-stone-300',
          hasTypes: true,
        },
        {
          type: 'storage',
          icon: Package,
          label: 'Storage',
          color: 'bg-amber-100 text-amber-700 border-amber-300',
          hasTypes: true,
        },
        {
          type: 'entrance',
          icon: Scan,
          label: 'Ticketing',
          color: 'bg-red-100 text-red-700 border-red-300',
          hasTypes: true,
        },
        {
          type: 'entertainment',
          icon: Sparkles,
          label: 'Entertainment',
          color: 'bg-purple-100 text-purple-700 border-purple-300',
          hasTypes: true,
        },
        {
          type: 'access',
          icon: Move,
          label: 'Access',
          color: 'bg-slate-100 text-slate-700 border-slate-300',
          hasTypes: true,
        },
        {
          type: 'kitchen',
          icon: ChefHat,
          label: 'Kitchen',
          color: 'bg-orange-100 text-orange-700 border-orange-300',
          hasTypes: true,
        },
      ],
    };
  },
  methods: {
    handleToolClick(tool) {
      const isShop = tool.type === 'shop';
      const isStorage = tool.type === 'storage';
      const isHospitality = tool.type === 'hospitality';
      const isMerch = tool.type === 'merchshop';
      const isAccess = tool.type === 'access';
      const isEntertainment = tool.type === 'entertainment';
      const isEntrance = tool.type === 'entrance';
      const isKitchen = tool.type === 'kitchen';
      const isSelected = this.selectedTool === tool.type;

      if (!isShop && !isStorage && !isHospitality && !isMerch && !isAccess && !isEntertainment && !isEntrance && !isKitchen) {
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.merchExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
        this.kitchenExpanded = false;
      }

      this.onSelectTool(isSelected ? null : tool.type);
    },
    isToolExpanded(tool) {
      const isShop = tool.type === 'shop';
      const isStorage = tool.type === 'storage';
      const isHospitality = tool.type === 'hospitality';
      const isMerch = tool.type === 'merchshop';
      const isAccess = tool.type === 'access';
      const isEntertainment = tool.type === 'entertainment';
      const isEntrance = tool.type === 'entrance';
      const isKitchen = tool.type === 'kitchen';
      return (
        (isShop && this.shopExpanded) ||
        (isStorage && this.storageExpanded) ||
        (isHospitality && this.hospitalityExpanded) ||
        (isMerch && this.merchExpanded) ||
        (isAccess && this.accessExpanded) ||
        (isEntertainment && this.entertainmentExpanded) ||
        (isEntrance && this.entranceExpanded) ||
        (isKitchen && this.kitchenExpanded)
      );
    },
    toggleToolExpanded(tool) {
      const isShop = tool.type === 'shop';
      const isStorage = tool.type === 'storage';
      const isHospitality = tool.type === 'hospitality';
      const isMerch = tool.type === 'merchshop';
      const isAccess = tool.type === 'access';
      const isEntertainment = tool.type === 'entertainment';
      const isEntrance = tool.type === 'entrance';
      const isKitchen = tool.type === 'kitchen';

      if (isShop) {
        this.shopExpanded = !this.shopExpanded;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
      } else if (isStorage) {
        this.storageExpanded = !this.storageExpanded;
        this.shopExpanded = false;
        this.hospitalityExpanded = false;
        this.merchExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
      } else if (isHospitality) {
        this.hospitalityExpanded = !this.hospitalityExpanded;
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.merchExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
      } else if (isMerch) {
        this.merchExpanded = !this.merchExpanded;
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
      } else if (isAccess) {
        this.accessExpanded = !this.accessExpanded;
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
      } else if (isEntertainment) {
        this.entertainmentExpanded = !this.entertainmentExpanded;
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.accessExpanded = false;
        this.entranceExpanded = false;
        this.kitchenExpanded = false;
      } else if (isEntrance) {
        this.entranceExpanded = !this.entranceExpanded;
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.kitchenExpanded = false;
      } else if (isKitchen) {
        this.kitchenExpanded = !this.kitchenExpanded;
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.merchExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
      }
    },
    toggleStorageType(type) {
      if (this.selectedStorageTypes.includes(type)) {
        this.onSelectStorageTypes(this.selectedStorageTypes.filter((t) => t !== type));
      } else {
        this.onSelectStorageTypes([...this.selectedStorageTypes, type]);
      }
    },
    toggleShopType(type) {
      if (this.selectedShopTypes.includes(type)) {
        this.onSelectShopTypes(this.selectedShopTypes.filter((t) => t !== type));
      } else {
        this.onSelectShopTypes([...this.selectedShopTypes, type]);
      }
    },
    toggleHospitalityType(type) {
      if (this.selectedHospitalityTypes.includes(type)) {
        this.onSelectHospitalityTypes(
          this.selectedHospitalityTypes.filter((t) => t !== type),
        );
      } else {
        this.onSelectHospitalityTypes([...this.selectedHospitalityTypes, type]);
      }
    },
    toggleMerchType(type) {
      if (this.selectedMerchTypes.includes(type)) {
        this.onSelectMerchTypes(this.selectedMerchTypes.filter((t) => t !== type));
      } else {
        this.onSelectMerchTypes([...this.selectedMerchTypes, type]);
      }
    },
    toggleAccessType(type) {
      if (this.selectedAccessTypes.includes(type)) {
        this.onSelectAccessTypes(this.selectedAccessTypes.filter((t) => t !== type));
      } else {
        this.onSelectAccessTypes([...this.selectedAccessTypes, type]);
      }
    },
    toggleEntertainmentType(type) {
      if (this.selectedEntertainmentTypes.includes(type)) {
        this.onSelectEntertainmentTypes(
          this.selectedEntertainmentTypes.filter((t) => t !== type),
        );
      } else {
        this.onSelectEntertainmentTypes([...this.selectedEntertainmentTypes, type]);
      }
    },
    toggleEntranceType(type) {
      if (this.selectedEntranceTypes.includes(type)) {
        this.onSelectEntranceTypes(this.selectedEntranceTypes.filter((t) => t !== type));
      } else {
        this.onSelectEntranceTypes([...this.selectedEntranceTypes, type]);
      }
    },
    toggleKitchenType(type) {
      if (this.selectedKitchenTypes.includes(type)) {
        this.onSelectKitchenTypes(this.selectedKitchenTypes.filter((t) => t !== type));
      } else {
        this.onSelectKitchenTypes([...this.selectedKitchenTypes, type]);
      }
    },
  },
};
</script>
