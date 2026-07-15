<script>
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import Button from '../ui/button.vue'
import Popover from '../ui/popover.vue'
import PopoverContent from '../ui/popoverContent.vue'
import PopoverTrigger from '../ui/popoverTrigger.vue'
import Input from "../ui/input.vue";
import Label from "../ui/label.vue";

import { X, ChevronDown, ChevronUp, Clock } from "lucide-vue-next";

/**
 * Recharts (React) n’existe pas en Vue.
 * Ici je ne mets pas le chart import, car tu m’as demandé uniquement la transcription du script.
 * On branchera ensuite Chart.js/vue-chartjs dans le template + options.
 */

// Color palette for menu items
const MENU_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // violet
  "#f43f5e", // rose
  "#84cc16", // lime
  "#6366f1", // indigo
  "#eab308", // yellow
  "#0ea5e9", // sky
  "#d946ef", // fuchsia
  "#22c55e", // emerald
  "#fb923c", // orange-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#2dd4bf", // teal-400
  "#facc15", // yellow-400
  "#818cf8", // indigo-400
  "#4ade80", // green-400
  "#fb7185", // rose-400
  "#38bdf8", // sky-400
  "#c084fc", // purple-400
  "#fbbf24", // amber-400
  "#34d399", // emerald-400
  "#60a5fa", // blue-400
];

const OTHERS_COLOR = "#9ca3af";

export default {
  name: "EventTimelineChart",
  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Input,
    Label,

    X,
    ChevronDown,
    ChevronUp,
    Clock,
  },
  props: {
    eventId: { type: String, required: true },
    eventName: { type: String, required: true },
    eventDate: { type: String, required: true },

    timelineData: { type: Array, required: true }, // Array of { minute, shopId, menuItemId, totalRevenue, totalQuantity, transactionCount }
    menuItems: { type: Array, required: true }, // Menu items for getting names and colors

    selectedShops: { type: Array, default: undefined },
    selectedMenuItems: { type: Array, default: undefined },
    selectedShopTypes: { type: Array, default: undefined },
    selectedShopAreas: { type: Array, default: undefined },
    selectedTypes: { type: Array, default: undefined },
    selectedCategories: { type: Array, default: undefined },

    elementIdToNameMap: { type: Object, default: undefined }, // Map-like
    elementIdToTypesMap: { type: Object, default: undefined }, // Map-like
    elementIdToAreaMap: { type: Object, default: undefined }, // Map-like
    elementIdToShopNameMap: { type: Object, default: undefined }, // Map-like
    itemNameToMenuItemIdMap: { type: Object, default: undefined }, // Map-like

    onClose: { type: Function, required: true },
    onTimeRangeChange: { type: Function, default: undefined },
    onTimelineInteractionAttempt: { type: Function, default: undefined },
    averagedEventCount: { type: Number, default: undefined },
  },

  data() {
    return {
      isMobile: false,

      viewMode: "revenue", // 'revenue' | 'quantity'
      legendExpanded: false,
      breakdownMode: "menuItem", // 'menuItem' | 'shop'

      timeRangeStart: 0,
      timeRangeEnd: 100,
      activeSlider: null, // 'start' | 'end' | null

      // Time picker state
      startTimePickerOpen: false,
      endTimePickerOpen: false,
      tempStartHour: "00",
      tempStartMinute: "00",
      tempEndHour: "00",
      tempEndMinute: "00",
    };
  },

  watch: {
    // Performance tracking
    "timelineData.length": {
      immediate: true,
      handler(len) {
        console.log(
          "[EVENT TIMELINE CHART] Component rendered with",
          len,
          "records",
        );
      },
    },

    timeRangeStart() {
      this.notifyTimeRangeChange();
    },
    timeRangeEnd() {
      this.notifyTimeRangeChange();
    },
    activeChartData() {
      this.notifyTimeRangeChange();
    },

    // Reset time range only when event changes (not when filters change)
    eventId() {
      this.timeRangeStart = 0;
      this.timeRangeEnd = 100;
    },
  },

  mounted() {
    this.updateIsMobile();
    window.addEventListener("resize", this.updateIsMobile);
  },

  beforeUnmount() {
    window.removeEventListener("resize", this.updateIsMobile);
    this.cleanupExternalTooltip();
  },

  methods: {
    updateIsMobile() {
      this.isMobile = window.matchMedia("(max-width: 640px)").matches;
    },

    notifyTimeRangeChange() {
      if (
        !this.onTimeRangeChange ||
        !this.activeChartData ||
        this.activeChartData.length === 0
      )
        return;
      // When time range is reset (0-100), pass null to indicate no filtering
      if (this.timeRangeStart === 0 && this.timeRangeEnd === 100) {
        this.onTimeRangeChange(null, null);
        return;
      }
      // Calculate the actual time strings for the current range
      const startIndex = Math.floor(
        (this.timeRangeStart / 100) * this.activeChartData.length,
      );
      const endIndex = Math.min(
        Math.ceil((this.timeRangeEnd / 100) * this.activeChartData.length) - 1,
        this.activeChartData.length - 1,
      );
      const startTime = this.activeChartData[startIndex]?.minute || null;
      const endTime = this.activeChartData[endIndex]?.minute || null;
      console.log("[EVENT TIMELINE CHART] Time range changed:", {
        percentages: { start: this.timeRangeStart, end: this.timeRangeEnd },
        times: { start: startTime, end: endTime },
      });
      this.onTimeRangeChange(startTime, endTime);
    },

    // Helper function to convert time string to slider percentage
    timeToPercentage(timeStr) {
      if (!this.activeChartData || this.activeChartData.length === 0) return 0;

      // Find the closest data point to the target time
      const parseTime = (ts) => {
        const [hours, minutes] = ts.split(":").map(Number);
        return hours * 60 + minutes;
      };

      const targetMinutes = parseTime(timeStr);
      let closestIndex = 0;
      let closestDiff = Infinity;

      this.activeChartData.forEach((dataPoint, index) => {
        const dataMinutes = parseTime(dataPoint.minute);
        const diff = Math.abs(dataMinutes - targetMinutes);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIndex = index;
        }
      });

      return (closestIndex / this.activeChartData.length) * 100;
    },

    // Handle time selection from picker
    handleStartTimePicked() {
      const selectedTime = `${this.tempStartHour}:${this.tempStartMinute}`;
      let newPercentage = this.timeToPercentage(selectedTime);

      // Ensure minimum 15-minute gap by constraining start to not exceed (end - 15 min)
      const parseTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
      };

      // Find the maximum allowed start position (15 minutes before current end)
      const endIndex = Math.floor(
        (this.timeRangeEnd / 100) * this.activeChartData.length,
      );
      const endTime = this.activeChartData[endIndex]?.minute || "23:59";
      const endMinutes = parseTime(endTime);
      const maxStartMinutes = endMinutes - 15;

      // Find the closest data point that satisfies the constraint
      let maxAllowedIndex = 0;
      for (let i = 0; i < this.activeChartData.length; i++) {
        const dataMinutes = parseTime(this.activeChartData[i].minute);
        if (dataMinutes <= maxStartMinutes) {
          maxAllowedIndex = i;
        } else {
          break;
        }
      }

      const maxAllowedPercentage =
        (maxAllowedIndex / this.activeChartData.length) * 100;

      // Constrain the new percentage to the allowed range
      newPercentage = Math.min(newPercentage, maxAllowedPercentage);
      newPercentage = Math.max(0, newPercentage); // Also ensure it's not negative

      this.timeRangeStart = newPercentage;
      this.startTimePickerOpen = false;
    },

    handleEndTimePicked() {
      const selectedTime = `${this.tempEndHour}:${this.tempEndMinute}`;
      let newPercentage = this.timeToPercentage(selectedTime);

      // Ensure minimum 15-minute gap by constraining end to not be before (start + 15 min)
      const parseTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
      };

      // Find the minimum allowed end position (15 minutes after current start)
      const startIndex = Math.floor(
        (this.timeRangeStart / 100) * this.activeChartData.length,
      );
      const startTime = this.activeChartData[startIndex]?.minute || "00:00";
      const startMinutes = parseTime(startTime);
      const minEndMinutes = startMinutes + 15;

      // Find the closest data point that satisfies the constraint
      let minAllowedIndex = this.activeChartData.length - 1;
      for (let i = 0; i < this.activeChartData.length; i++) {
        const dataMinutes = parseTime(this.activeChartData[i].minute);
        if (dataMinutes >= minEndMinutes) {
          minAllowedIndex = i;
          break;
        }
      }

      const minAllowedPercentage =
        (minAllowedIndex / this.activeChartData.length) * 100;

      // Constrain the new percentage to the allowed range
      newPercentage = Math.max(newPercentage, minAllowedPercentage);
      newPercentage = Math.min(100, newPercentage); // Also ensure it doesn't exceed 100%

      this.timeRangeEnd = newPercentage;
      this.endTimePickerOpen = false;
    },

    toggleLegendExpanded() {
      this.legendExpanded = !this.legendExpanded;
    },

    // Tooltip cleanup (Chart.js external tooltip pattern)
    cleanupExternalTooltip() {
      const els = document.querySelectorAll(".chartjs-custom-tooltip");
      els.forEach((el) => el.remove());
    },
  },

  computed: {
    // Create menu item map for quick lookup
    menuItemMap() {
      const map = new Map();
      (this.menuItems || []).forEach((item) => {
        map.set(item.id, item);
      });
      return map;
    },

    // Process timeline data into chart format (MENU ITEM)
    menuTimelineBundle() {
      const startTime = performance.now();
      console.log("[EVENT TIMELINE CHART] Processing timeline data:", {
        eventId: this.eventId,
        timelineDataLength: this.timelineData?.length || 0,
        sampleRecord: this.timelineData?.[0],
        filters: {
          shops: this.selectedShops?.length || 0,
          shopsActive: this.selectedShops,
          menuItems: this.selectedMenuItems?.length || 0,
          menuItemsActive: this.selectedMenuItems,
          shopTypes: this.selectedShopTypes?.length || 0,
          shopTypesActive: this.selectedShopTypes,
          shopAreas: this.selectedShopAreas?.length || 0,
          shopAreasActive: this.selectedShopAreas,
          types: this.selectedTypes?.length || 0,
          typesActive: this.selectedTypes,
          categories: this.selectedCategories?.length || 0,
          categoriesActive: this.selectedCategories,
        },
        hasElementIdToTypesMap: !!this.elementIdToTypesMap,
        hasElementIdToAreaMap: !!this.elementIdToAreaMap,
        hasElementIdToShopNameMap: !!this.elementIdToShopNameMap,
        elementIdToTypesMapSize: this.elementIdToTypesMap?.size || 0,
        elementIdToAreaMapSize: this.elementIdToAreaMap?.size || 0,
        elementIdToShopNameMapSize: this.elementIdToShopNameMap?.size || 0,
      });

      if (!this.timelineData || this.timelineData.length === 0) {
        return { chartData: [], allMenuItems: [], menuColorMap: new Map() };
      }

      // Create reverse map: shopName -> elementId (for type/area lookups)
      const shopNameToElementIdMap = new Map();
      if (this.elementIdToShopNameMap) {
        this.elementIdToShopNameMap.forEach((shopName, elementId) => {
          shopNameToElementIdMap.set(shopName, elementId);
        });
      }
      console.log(
        "[EVENT TIMELINE CHART] Created reverse map (shopName -> elementId):",
        shopNameToElementIdMap.size,
        "entries",
      );
      if (shopNameToElementIdMap.size > 0) {
        console.log(
          "[EVENT TIMELINE CHART] Sample reverse map entries:",
          Array.from(shopNameToElementIdMap.entries()).slice(0, 3),
        );
      }

      // Apply filters to timeline data
      const filteredTimeline = this.timelineData.filter((record) => {
        // Debug: Log first record to see structure
        if (this.timelineData.indexOf(record) === 0) {
          console.log("[EVENT TIMELINE CHART] First record structure:", {
            shopId: record.shopId,
            elementId: record.elementId,
            menuItemId: record.menuItemId,
            mappedMenuItemId: record.mappedMenuItemId,
            allFields: Object.keys(record),
          });
        }

        // Filter by shop
        if (this.selectedShops && this.selectedShops.length > 0) {
          const recordElementId = record.shopId; // shopId field actually contains elementId

          // Direct comparison since both are elementIds
          if (!this.selectedShops.includes(recordElementId)) {
            return false;
          }
        }

        // Filter by shop type using elementIdToTypesMap
        if (
          this.selectedShopTypes &&
          this.selectedShopTypes.length > 0 &&
          this.elementIdToTypesMap
        ) {
          const elementId = record.shopId; // shopId field actually contains elementId

          const shopTypes = this.elementIdToTypesMap.get(elementId);
          if (!shopTypes || shopTypes.length === 0) {
            return false;
          }
          // Check if any of the shop's types match the selected types
          const hasMatchingType = shopTypes.some((type) =>
            this.selectedShopTypes.includes(type),
          );
          if (!hasMatchingType) {
            return false;
          }
        }

        // Filter by shop area using elementIdToAreaMap
        if (
          this.selectedShopAreas &&
          this.selectedShopAreas.length > 0 &&
          this.elementIdToAreaMap
        ) {
          const elementId = record.shopId; // shopId field actually contains elementId

          const shopArea = this.elementIdToAreaMap.get(elementId);
          if (!shopArea || !this.selectedShopAreas.includes(shopArea)) {
            return false;
          }
        }

        // Filter by menu item
        const menuItemId = record.mappedMenuItemId || record.menuItemId;
        if (this.selectedMenuItems && this.selectedMenuItems.length > 0) {
          // First try direct ID match (if item was mapped)
          let matches =
            menuItemId && this.selectedMenuItems.includes(menuItemId);

          // If no direct match and we have the mapping, try matching by item name
          if (!matches && this.itemNameToMenuItemIdMap && record.itemName) {
            const recordMenuItemId = this.itemNameToMenuItemIdMap.get(
              record.itemName,
            );
            matches =
              recordMenuItemId &&
              this.selectedMenuItems.includes(recordMenuItemId);
          }

          if (!matches) {
            if (this.timelineData.indexOf(record) < 3) {
              console.log("[EVENT TIMELINE CHART] Menu item filter rejected:", {
                recordItemName: record.itemName,
                recordMenuItemId: menuItemId,
                rawMenuItemId: record.menuItemId,
                mappedMenuItemId: record.mappedMenuItemId,
                mappedIdFromName: this.itemNameToMenuItemIdMap?.get(
                  record.itemName,
                ),
                selectedMenuItems: this.selectedMenuItems,
                index: this.timelineData.indexOf(record),
              });
            }
            return false;
          }
        }

        // Filter by menu item type and category
        let filterMenuItemId = menuItemId;
        if (
          !filterMenuItemId &&
          this.itemNameToMenuItemIdMap &&
          record.itemName
        ) {
          filterMenuItemId = this.itemNameToMenuItemIdMap.get(record.itemName);
        }

        if (
          filterMenuItemId &&
          (this.selectedTypes?.length || this.selectedCategories?.length)
        ) {
          const menuItem = this.menuItemMap.get(filterMenuItemId);
          if (menuItem) {
            if (this.selectedTypes && this.selectedTypes.length > 0) {
              if (!this.selectedTypes.includes(menuItem.type)) {
                if (this.timelineData.indexOf(record) < 3) {
                  console.log("[EVENT TIMELINE CHART] Type filter rejected:", {
                    recordItemName: record.itemName,
                    menuItemId: filterMenuItemId,
                    menuItemType: menuItem.type,
                    selectedTypes: this.selectedTypes,
                    index: this.timelineData.indexOf(record),
                  });
                }
                return false;
              }
            }
            if (this.selectedCategories && this.selectedCategories.length > 0) {
              if (!this.selectedCategories.includes(menuItem.category)) {
                if (this.timelineData.indexOf(record) < 3) {
                  console.log(
                    "[EVENT TIMELINE CHART] Category filter rejected:",
                    {
                      recordItemName: record.itemName,
                      menuItemId: filterMenuItemId,
                      menuItemCategory: menuItem.category,
                      selectedCategories: this.selectedCategories,
                      index: this.timelineData.indexOf(record),
                    },
                  );
                }
                return false;
              }
            }
          } else {
            // No menu item found - if type/category filters are active, exclude this record
            if (
              (this.selectedTypes && this.selectedTypes.length > 0) ||
              (this.selectedCategories && this.selectedCategories.length > 0)
            ) {
              if (this.timelineData.indexOf(record) < 3) {
                console.log(
                  "[EVENT TIMELINE CHART] Type/Category filter rejected - menu item not found:",
                  {
                    recordItemName: record.itemName,
                    filterMenuItemId,
                    index: this.timelineData.indexOf(record),
                  },
                );
              }
              return false;
            }
          }
        } else if (
          (this.selectedTypes?.length || this.selectedCategories?.length) &&
          !filterMenuItemId
        ) {
          // Type/Category filters are active but we couldn't find a menu item ID - exclude this record
          if (this.timelineData.indexOf(record) < 3) {
            console.log(
              "[EVENT TIMELINE CHART] Type/Category filter rejected - no menu item ID:",
              {
                recordItemName: record.itemName,
                mappedMenuItemId: record.mappedMenuItemId,
                index: this.timelineData.indexOf(record),
              },
            );
          }
          return false;
        }

        return true;
      });

      console.log("[EVENT TIMELINE CHART] Filtered data:", {
        originalCount: this.timelineData.length,
        filteredCount: filteredTimeline.length,
      });

      // Group data by minute (using menuItemId as key)
      const minuteMap = new Map();

      // Create menuItemId to display name mapping (snapshot at processing time)
      const menuItemIdToDisplayName = new Map();

      filteredTimeline.forEach((record) => {
        const minute = record.minute;
        const menuItemId = record.mappedMenuItemId || record.menuItemId; // Use mapped ID first, fallback to direct ID

        // Create display name mapping if not exists (snapshot the name once)
        if (menuItemId && !menuItemIdToDisplayName.has(menuItemId)) {
          const menuItem = this.menuItemMap.get(menuItemId);
          const displayName =
            menuItem?.name ||
            record.mappedMenuItemName ||
            record.itemName ||
            "Unknown";
          menuItemIdToDisplayName.set(menuItemId, displayName);
        }

        // Debug logging for first record
        if (minuteMap.size === 0) {
          console.log("[EVENT TIMELINE CHART] First record processing:", {
            minute,
            rawMenuItemId: record.menuItemId,
            mappedMenuItemId: record.mappedMenuItemId,
            mappedMenuItemName: record.mappedMenuItemName,
            itemName: record.itemName,
            finalMenuItemId: menuItemId,
            finalDisplayName: menuItemIdToDisplayName.get(menuItemId),
          });
        }

        if (!minuteMap.has(minute)) {
          minuteMap.set(minute, {
            minute,
            displayMinute: minute, // For X-axis
            totalRevenue: 0,
            totalQuantity: 0,
            _menuDetails: new Map(), // Map<menuItemId, {revenue, quantity}>
          });
        }

        const minuteData = minuteMap.get(minute);

        // Add to specific menu item using ID as key
        if (menuItemId) {
          if (!minuteData[menuItemId]) {
            minuteData[menuItemId] = { revenue: 0, quantity: 0 };
          }
          minuteData[menuItemId].revenue += record.totalRevenue || 0;
          minuteData[menuItemId].quantity += record.totalQuantity || 0;

          // Store details for tooltip using menuItemId
          const currentDetails = minuteData._menuDetails.get(menuItemId) || {
            revenue: 0,
            quantity: 0,
          };
          minuteData._menuDetails.set(menuItemId, {
            revenue: currentDetails.revenue + (record.totalRevenue || 0),
            quantity: currentDetails.quantity + (record.totalQuantity || 0),
          });
        }

        // Track totals
        minuteData.totalRevenue += record.totalRevenue || 0;
        minuteData.totalQuantity += record.totalQuantity || 0;
      });

      // Get all unique menu items sorted by total revenue (use menuItemId)
      const menuRevenueMap = new Map();
      filteredTimeline.forEach((record) => {
        const menuItemId = record.mappedMenuItemId || record.menuItemId;
        if (menuItemId) {
          const current = menuRevenueMap.get(menuItemId) || 0;
          menuRevenueMap.set(menuItemId, current + (record.totalRevenue || 0));
        }
      });

      const sortedMenuItemIds = Array.from(menuRevenueMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([menuItemId]) => menuItemId);

      // Convert to array and sort by minute
      const sortedData = Array.from(minuteMap.values()).sort((a, b) => {
        return a.minute.localeCompare(b.minute);
      });

      // Format data for the selected view mode - convert menuItemIds to display names
      const formattedData = sortedData.map((minuteData) => {
        const formatted = {
          minute: minuteData.minute,
          displayMinute: minuteData.displayMinute,
          totalRevenue: minuteData.totalRevenue,
          totalQuantity: minuteData.totalQuantity,
          _menuDetails: minuteData._menuDetails,
          _menuItemIdToName: menuItemIdToDisplayName, // Add mapping for tooltip
        };

        // Add menu item values using display names (convert from menuItemId)
        sortedMenuItemIds.forEach((menuItemId) => {
          const displayName =
            menuItemIdToDisplayName.get(menuItemId) || menuItemId;
          if (minuteData[menuItemId]) {
            formatted[displayName] =
              this.viewMode === "revenue"
                ? minuteData[menuItemId].revenue
                : minuteData[menuItemId].quantity;
          } else {
            formatted[displayName] = 0;
          }
        });

        return formatted;
      });

      // Convert sorted menuItemIds to display names for return
      const sortedMenuItemNames = sortedMenuItemIds.map(
        (menuItemId) => menuItemIdToDisplayName.get(menuItemId) || menuItemId,
      );

      // Create color map with display names
      const displayNameColorMap = new Map();
      sortedMenuItemIds.forEach((menuItemId, index) => {
        const displayName =
          menuItemIdToDisplayName.get(menuItemId) || menuItemId;
        displayNameColorMap.set(
          displayName,
          MENU_COLORS[index % MENU_COLORS.length],
        );
      });
      displayNameColorMap.set("Others", OTHERS_COLOR);

      console.log("[EVENT TIMELINE CHART] Processed data:", {
        minuteCount: formattedData.length,
        menuItemCount: sortedMenuItemNames.length,
        sampleMinutes: formattedData.slice(0, 3).map((d) => d.minute),
      });

      const endTime = performance.now();
      console.log(
        "[EVENT TIMELINE CHART] Menu item processing completed in",
        (endTime - startTime).toFixed(2),
        "ms",
      );

      return {
        chartData: formattedData,
        allMenuItems: sortedMenuItemNames,
        menuColorMap: displayNameColorMap,
      };
    },

    // Process timeline data by SHOP
    shopTimelineBundle() {
      const startTime = performance.now();
      console.log("[EVENT TIMELINE CHART] Processing shop-based timeline data");

      if (!this.timelineData || this.timelineData.length === 0) {
        return { chartData: [], allShops: [], shopColorMap: new Map() };
      }

      // Apply filters to timeline data (same filtering as menu item view)
      const filteredTimeline = this.timelineData.filter((record) => {
        // Filter by shop
        if (this.selectedShops && this.selectedShops.length > 0) {
          const elementId = record.shopId; // shopId field actually contains elementId
          if (!this.selectedShops.includes(elementId)) return false;
        }

        // Filter by shop type
        if (
          this.selectedShopTypes &&
          this.selectedShopTypes.length > 0 &&
          this.elementIdToTypesMap
        ) {
          const elementId = record.shopId;
          const shopTypes = this.elementIdToTypesMap.get(elementId);
          if (!shopTypes || shopTypes.length === 0) return false;
          const hasMatchingType = shopTypes.some((type) =>
            this.selectedShopTypes.includes(type),
          );
          if (!hasMatchingType) return false;
        }

        // Filter by shop area
        if (
          this.selectedShopAreas &&
          this.selectedShopAreas.length > 0 &&
          this.elementIdToAreaMap
        ) {
          const elementId = record.shopId;
          const shopArea = this.elementIdToAreaMap.get(elementId);
          if (!shopArea || !this.selectedShopAreas.includes(shopArea))
            return false;
        }

        // Filter by menu item
        const menuItemId = record.mappedMenuItemId || record.menuItemId;
        if (this.selectedMenuItems && this.selectedMenuItems.length > 0) {
          let matches =
            menuItemId && this.selectedMenuItems.includes(menuItemId);
          if (!matches && this.itemNameToMenuItemIdMap && record.itemName) {
            const recordMenuItemId = this.itemNameToMenuItemIdMap.get(
              record.itemName,
            );
            matches =
              recordMenuItemId &&
              this.selectedMenuItems.includes(recordMenuItemId);
          }
          if (!matches) return false;
        }

        // Filter by menu item type and category
        let filterMenuItemId = menuItemId;
        if (
          !filterMenuItemId &&
          this.itemNameToMenuItemIdMap &&
          record.itemName
        ) {
          filterMenuItemId = this.itemNameToMenuItemIdMap.get(record.itemName);
        }

        if (
          filterMenuItemId &&
          (this.selectedTypes?.length || this.selectedCategories?.length)
        ) {
          const menuItem = this.menuItemMap.get(filterMenuItemId);
          if (menuItem) {
            if (this.selectedTypes && this.selectedTypes.length > 0) {
              if (!this.selectedTypes.includes(menuItem.type)) return false;
            }
            if (this.selectedCategories && this.selectedCategories.length > 0) {
              if (!this.selectedCategories.includes(menuItem.category))
                return false;
            }
          } else {
            if (
              (this.selectedTypes && this.selectedTypes.length > 0) ||
              (this.selectedCategories && this.selectedCategories.length > 0)
            ) {
              return false;
            }
          }
        } else if (
          (this.selectedTypes?.length || this.selectedCategories?.length) &&
          !filterMenuItemId
        ) {
          return false;
        }

        return true;
      });

      console.log("[EVENT TIMELINE CHART] Filtered shop data:", {
        originalCount: this.timelineData.length,
        filteredCount: filteredTimeline.length,
      });

      // Group data by minute and shop (using elementId as key)
      const minuteMap = new Map();

      // Create elementId to display name mapping (snapshot at processing time)
      const elementIdToDisplayName = new Map();

      filteredTimeline.forEach((record) => {
        const minute = record.minute;
        const elementId = record.shopId;

        // Create display name mapping if not exists (snapshot the name once)
        if (!elementIdToDisplayName.has(elementId)) {
          const displayName =
            this.elementIdToNameMap?.get(elementId) ||
            this.elementIdToShopNameMap?.get(elementId) ||
            elementId ||
            "Unknown Shop";
          elementIdToDisplayName.set(elementId, displayName);
        }

        if (!minuteMap.has(minute)) {
          minuteMap.set(minute, {
            minute,
            displayMinute: minute,
            totalRevenue: 0,
            totalQuantity: 0,
            _shopDetails: new Map(), // Map<elementId, {revenue, quantity}>
          });
        }

        const minuteData = minuteMap.get(minute);

        // Add to specific shop using elementId as key
        if (!minuteData[elementId]) {
          minuteData[elementId] = { revenue: 0, quantity: 0 };
        }
        minuteData[elementId].revenue += record.totalRevenue || 0;
        minuteData[elementId].quantity += record.totalQuantity || 0;

        // Track totals
        minuteData.totalRevenue += record.totalRevenue || 0;
        minuteData.totalQuantity += record.totalQuantity || 0;

        // Store details for tooltip using elementId
        const currentDetails = minuteData._shopDetails.get(elementId) || {
          revenue: 0,
          quantity: 0,
        };
        minuteData._shopDetails.set(elementId, {
          revenue: currentDetails.revenue + (record.totalRevenue || 0),
          quantity: currentDetails.quantity + (record.totalQuantity || 0),
        });
      });

      // Get all unique shops sorted by total revenue (use elementId)
      const shopRevenueMap = new Map();
      filteredTimeline.forEach((record) => {
        const elementId = record.shopId;
        const current = shopRevenueMap.get(elementId) || 0;
        shopRevenueMap.set(elementId, current + (record.totalRevenue || 0));
      });

      const sortedShopIds = Array.from(shopRevenueMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([elementId]) => elementId);

      // Convert to array and sort by minute
      const sortedData = Array.from(minuteMap.values()).sort((a, b) =>
        a.minute.localeCompare(b.minute),
      );

      // Format data for the selected view mode - convert elementIds to display names
      const formattedData = sortedData.map((minuteData) => {
        const formatted = {
          minute: minuteData.minute,
          displayMinute: minuteData.displayMinute,
          totalRevenue: minuteData.totalRevenue,
          totalQuantity: minuteData.totalQuantity,
          _shopDetails: minuteData._shopDetails,
          _elementIdToName: elementIdToDisplayName, // Add mapping for tooltip
        };

        // Add shop values using display names (convert from elementId)
        sortedShopIds.forEach((elementId) => {
          const displayName =
            elementIdToDisplayName.get(elementId) || elementId;
          if (minuteData[elementId]) {
            formatted[displayName] =
              this.viewMode === "revenue"
                ? minuteData[elementId].revenue
                : minuteData[elementId].quantity;
          } else {
            formatted[displayName] = 0;
          }
        });

        return formatted;
      });

      // Convert sorted elementIds to display names for return
      const sortedShopNames = sortedShopIds.map(
        (elementId) => elementIdToDisplayName.get(elementId) || elementId,
      );

      // Create color map with display names
      const displayNameColorMap = new Map();
      sortedShopIds.forEach((elementId, index) => {
        const displayName = elementIdToDisplayName.get(elementId) || elementId;
        displayNameColorMap.set(
          displayName,
          MENU_COLORS[index % MENU_COLORS.length],
        );
      });
      displayNameColorMap.set("Others", OTHERS_COLOR);

      console.log("[EVENT TIMELINE CHART] Processed shop data:", {
        minuteCount: formattedData.length,
        shopCount: sortedShopNames.length,
        sampleMinutes: formattedData.slice(0, 3).map((d) => d.minute),
      });

      const endTime = performance.now();
      console.log(
        "[EVENT TIMELINE CHART] Shop processing completed in",
        (endTime - startTime).toFixed(2),
        "ms",
      );

      return {
        chartData: formattedData,
        allShops: sortedShopNames,
        shopColorMap: displayNameColorMap,
      };
    },

    // ... garde les computed Part 2/3 ici au-dessus
    // Select data based on breakdown mode
    activeChartData() {
      return this.breakdownMode === "menuItem"
        ? this.menuTimelineBundle.chartData || []
        : this.shopTimelineBundle.chartData || [];
    },
    activeItems() {
      return this.breakdownMode === "menuItem"
        ? this.menuTimelineBundle.allMenuItems || []
        : this.shopTimelineBundle.allShops || [];
    },
    activeColorMap() {
      return this.breakdownMode === "menuItem"
        ? this.menuTimelineBundle.menuColorMap || new Map()
        : this.shopTimelineBundle.shopColorMap || new Map();
    },
    activeDetailsKey() {
      return this.breakdownMode === "menuItem"
        ? "_menuDetails"
        : "_shopDetails";
    },
    // Apply time range filter
    filteredByTimeData() {
      if (!this.activeChartData || this.activeChartData.length === 0) return [];
      const totalDataPoints = this.activeChartData.length;
      const startIndex = Math.floor(
        (this.timeRangeStart / 100) * totalDataPoints,
      );
      const endIndex = Math.ceil((this.timeRangeEnd / 100) * totalDataPoints);
      return this.activeChartData.slice(startIndex, endIndex);
    },
    // Determine which items to display in legend
    displayMenuItems() {
      return this.legendExpanded
        ? this.activeItems
        : this.activeItems.slice(0, 10);
    },
    hasMore() {
      return (this.activeItems || []).length > 10;
    },
    // Calculate optimized Y-axis domain
    yDomain() {
      if (!this.activeChartData || this.activeChartData.length === 0)
        return [0, 100];
      let maxValue = 0;
      let minValue = 0;
      // Find the actual max and min values across all menu items
      this.activeChartData.forEach((dataPoint) => {
        this.activeItems.forEach((menuItem) => {
          const value = dataPoint[menuItem] || 0;
          maxValue = Math.max(maxValue, value);
          minValue = Math.min(minValue, value);
        });
      });
      // Round max up to nearest multiple of 5
      const roundedMax = Math.ceil(maxValue / 5) * 5;
      // Round min down to nearest multiple of 5
      const roundedMin = Math.floor(minValue / 5) * 5;
      console.log("[EVENT TIMELINE CHART] Y-axis domain:", {
        actualMax: maxValue,
        actualMin: minValue,
        roundedMax,
        roundedMin,
      });
      return [roundedMin, roundedMax];
    },
    // Calculate X-axis ticks every 15 minutes
    xAxisTicks() {
      if (!this.activeChartData || this.activeChartData.length === 0) return [];
      // Parse time string "HH:MM" to minutes since midnight
      const parseTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
      };
      // Format minutes since midnight to "HH:MM"
      const formatTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
      };
      // Round down to nearest 15-minute interval
      const roundDown15 = (minutes) => Math.floor(minutes / 15) * 15;
      // Round up to nearest 15-minute interval
      const roundUp15 = (minutes) => Math.ceil(minutes / 15) * 15;
      // Get first and last times
      const firstTime = parseTime(this.activeChartData[0].minute);
      const lastTime = parseTime(
        this.activeChartData[this.activeChartData.length - 1].minute,
      );
      // Start 15 minutes before first transaction (rounded to 15-min interval)
      const startTime = roundDown15(firstTime) - 15;
      // End 15 minutes after last transaction (rounded to 15-min interval)
      const endTime = roundUp15(lastTime) + 15;
      // Generate ticks every 15 minutes
      const ticks = [];
      for (let time = startTime; time <= endTime; time += 15) {
        ticks.push(formatTime(time));
      }
      console.log("[EVENT TIMELINE CHART] X-axis ticks:", {
        firstDataTime: this.activeChartData[0].minute,
        lastDataTime:
          this.activeChartData[this.activeChartData.length - 1].minute,
        startTime: formatTime(startTime),
        endTime: formatTime(endTime),
        tickCount: ticks.length,
      });
      return ticks;
    },
  },
};
</script>
