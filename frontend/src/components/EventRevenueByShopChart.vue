<template>
  <Card
    class="min-h-[500px] bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700"
  >
    <CardHeader>
      <div
        class="flex flex-col md:flex-row md:items-center md:justify-between gap-3"
      >
        <div class="flex items-center gap-2">
          <CardTitle class="text-gray-900 dark:text-gray-100">
            {{ chartTitle }}
          </CardTitle>
          <div class="relative">
            <Button
              variant="ghost"
              size="sm"
              @click="dropdownOpen = !dropdownOpen"
              class="h-8 w-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <ChevronRight
                :class="`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-90' : ''}`"
              />
            </Button>
            <div
              v-if="dropdownOpen"
              class="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-10 min-w-[140px]"
            >
              <button
                @click="setAggregationMode('event')"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors"
              >
                Par évènement
              </button>
              <button
                @click="setAggregationMode('monthly')"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors"
              >
                Mensuel
              </button>
              <button
                @click="setAggregationMode('quarterly')"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors"
              >
                Trimestriel
              </button>
              <button
                @click="setAggregationMode('yearly')"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors"
              >
                Annuel
              </button>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <!-- Tri : par date / par CA (visible uniquement en mode "Par évènement") -->
          <Button
            v-if="aggregationMode === 'event'"
            variant="outline"
            size="sm"
            @click="setSortMode"
            class="text-xs"
          >
            <ArrowUpDown class="h-3 w-3 mr-1" />
            {{ sortMode === "date" ? "Par date" : "Par CA" }}
          </Button>

          <!-- Toggle Shops / Types de menu -->
          <div
            class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-0.5"
          >
            <button
              @click="viewMode = 'shop'"
              :class="`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'shop'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`"
            >
              Shops
            </button>
            <button
              @click="viewMode = 'menuItemType'"
              :class="`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'menuItemType'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`"
            >
              Types de menu
            </button>
          </div>

          <!-- Bouton Moyenne : ouvre la timeline minute par minute -->
          <Button
            variant="outline"
            size="sm"
            @click="$emit('show-average')"
            class="text-xs h-8"
          >
            {{ isMobile ? "Moy." : "Moyenne" }}
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div
        v-if="chartData.length === 0"
        class="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400"
      >
        <p>
          Aucune donnée de revenu
          {{ viewMode === "shop" ? "par shop" : "par type de menu" }}
          disponible pour la plage sélectionnée.
        </p>
        <p class="text-sm mt-2">
          {{
            filteredEvents !== undefined &&
            filteredEvents !== null &&
            filteredEvents.length === 0
              ? "Choisissez une autre plage de dates ou vérifiez qu'il existe des évènements sur cette période."
              : "Terminez l'assistant d'intégration F&B pour voir la répartition du CA."
          }}
        </p>
      </div>
      <div
        v-else
        class="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex justify-between items-center mb-2 px-2">
          <div class="flex items-center gap-2">
            <div class="text-xs font-semibold text-gray-600 dark:text-gray-400">
              CA évènement
            </div>
            <span
              v-if="chartData.some((event) => event.isPredictive)"
              class="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-medium"
            >
              Prédictions incluses
            </span>
          </div>
          <div
            v-if="sortMode === 'date' && aggregationMode === 'event'"
            class="text-xs font-semibold text-gray-600 dark:text-gray-400"
          >
            CA cumulé
          </div>
        </div>
        <div class="relative" style="height: 400px">
          <Bar :data="processedChartData" :options="chartOptions" />
          <!-- Tooltip HTML frosted glass (rempli par options.plugins.tooltip.external) -->
          <div ref="tooltipEl" class="erbs-tooltip"></div>
        </div>
        <!-- Légende : déjà affichée par Chart.js dans options.plugins.legend -->
      </div>
    </CardContent>
  </Card>
</template>

<script>
import Card from "../ui/card.vue";
import CardHeader from "../ui/cardHeader.vue";
import CardContent from "../ui/cardContent.vue";
import CardTitle from "../ui/cardTitle.vue";
import Button from "../ui/button.vue";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowUpDown,
} from "lucide-vue-next";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar } from "vue-chartjs";

// Enregistrement des composants Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// Expanded color palette for shops - 30 distinct colors
const SHOP_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#a855f7",
  "#f43f5e",
  "#84cc16",
  "#6366f1",
  "#eab308",
  "#0ea5e9",
  "#d946ef",
  "#22c55e",
  "#fb923c",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
  "#facc15",
  "#818cf8",
  "#4ade80",
  "#fb7185",
  "#38bdf8",
  "#c084fc",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
];

const OTHERS_COLOR = "#9ca3af";

export default {
  components: {
    Bar,
    Card,
    CardHeader,
    CardContent,
    CardTitle,
    Button,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    ArrowUpDown,
  },

  props: {
    spaceName: String,
    title: String,
    filteredEvents: Array,
    shopGranularData: { type: Array, default: () => [] },
    elementIdToNameMap: { type: Map, default: () => new Map() },
    menuItems: { type: Array, default: () => [] },
    onEventClick: Function,
    onShowAverage: Function,
    // Mode Predict : quand vrai, les events passés non prédits sont rendus à 50% d'opacité
    // pour mettre en avant les prédictions futures (cf. doc §8.6).
    isPredictMode: { type: Boolean, default: false },
  },

  data() {
    return {
      showAllShops: false,
      legendExpanded: false,
      viewMode: "shop",
      aggregationMode: "event",
      dropdownOpen: false,
      sortMode: "date",
      chart: null,
    };
  },

  computed: {
    isMobile() {
      return window.innerWidth < 768;
    },

    formatNumber() {
      return (value) => {
        if (!this.isMobile) {
          return value.toLocaleString("fr-FR");
        }
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
        return value.toString();
      };
    },

    menuItemMap() {
      const map = new Map();
      this.menuItems?.forEach((item) => map.set(item.id, item));
      return map;
    },

    filteredGranularData() {
      if (!this.shopGranularData || this.shopGranularData.length === 0)
        return [];

      const filteredEventIds = new Set();
      const filteredEventKeys = new Set();

      if (this.filteredEvents) {
        this.filteredEvents.forEach((event) => {
          filteredEventIds.add(event.id);
          filteredEventKeys.add(`${event.eventName}|${event.eventDate}`);
        });
      }

      return this.filteredEvents !== undefined && this.filteredEvents !== null
        ? this.shopGranularData.filter((record) => {
            if (record.eventId) return filteredEventIds.has(record.eventId);
            const eventKey = `${record.eventName}|${record.eventDate}`;
            return filteredEventKeys.has(eventKey);
          })
        : this.shopGranularData;
    },

    chartDataShop() {
      if (this.filteredGranularData.length === 0) return [];

      const eventDataMap = new Map();

      this.filteredGranularData.forEach((record) => {
        const eventId =
          record.eventId || `${record.eventName}|${record.eventDate}`;

        if (!eventDataMap.has(eventId)) {
          eventDataMap.set(eventId, new Map());
        }

        const eventShopRevenues = eventDataMap.get(eventId);
        const currentRevenue = eventShopRevenues.get(record.elementName) || 0;
        eventShopRevenues.set(
          record.elementName,
          currentRevenue + record.revenue,
        );
      });

      const eventTop10Map = new Map();

      eventDataMap.forEach((shopRevenues, eventId) => {
        const top10Shops = Array.from(shopRevenues.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([elementName]) => elementName);

        eventTop10Map.set(eventId, new Set(top10Shops));
      });

      const eventRevenueMap = new Map();

      this.filteredGranularData.forEach((record) => {
        const eventId =
          record.eventId || `${record.eventName}|${record.eventDate}`;

        if (!eventRevenueMap.has(eventId)) {
          const currentEventName = this.getEventName(
            record.eventId,
            record.eventName,
          );

          let currentEventDate = record.eventDate;
          if (this.filteredEvents && record.eventId) {
            const event = this.filteredEvents.find(
              (e) => e.id === record.eventId,
            );
            if (event) currentEventDate = event.eventDate;
          }

          const uniqueDisplayName = `${currentEventName} (${currentEventDate})`;

          eventRevenueMap.set(eventId, {
            eventId: record.eventId,
            eventName: currentEventName,
            eventDate: currentEventDate,
            displayName: uniqueDisplayName,
            totalRevenue: 0,
            Others: 0,
            _shopDetails: new Map(),
            isPredictive: record.isPredictive || false,
            confidenceScore: 0,
            _confSum: 0,
            _confW: 0,
            isLowConfidence: record.isLowConfidence || false,
          });
        }

        const eventData = eventRevenueMap.get(eventId);
        // OR-aggrégation : si un seul record de l'event est low confidence,
        // tout l'event passe en rouge (cf. React EventRevenueByShopChart §285).
        if (record.isLowConfidence) eventData.isLowConfidence = true;
        // Taux de confiance global de l'event = moyenne pondérée par CA
        // (et non plus le score d'un seul article — cf. demande utilisateur).
        if (Number.isFinite(record.confidenceScore)) {
          eventData._confSum += record.confidenceScore * (record.revenue || 0);
          eventData._confW += record.revenue || 0;
        }
        const eventTop10 = eventTop10Map.get(eventId);

        const currentShopRevenue =
          eventData._shopDetails.get(record.elementName) || 0;
        eventData._shopDetails.set(
          record.elementName,
          currentShopRevenue + record.revenue,
        );

        if (eventTop10?.has(record.elementName)) {
          if (!eventData[record.elementName]) eventData[record.elementName] = 0;
          eventData[record.elementName] += record.revenue;
        } else {
          eventData.Others += record.revenue;
        }

        eventData.totalRevenue += record.revenue;
      });

      const sortedEvents = Array.from(eventRevenueMap.values()).sort(
        (a, b) =>
          this.parseDDMMYYYY(a.eventDate).getTime() -
          this.parseDDMMYYYY(b.eventDate).getTime(),
      );

      let cumulativeRevenue = 0;
      sortedEvents.forEach((event) => {
        cumulativeRevenue += event.totalRevenue;
        event.cumulativeRevenue = cumulativeRevenue;
        if (event._confW) {
          event.confidenceScore = Math.round(event._confSum / event._confW);
        }
        delete event._confSum;
        delete event._confW;
      });

      return sortedEvents;
    },

    chartDataMenuItemType() {
      if (
        this.filteredGranularData.length === 0 ||
        !this.menuItems ||
        this.menuItems.length === 0
      ) {
        return [];
      }

      const eventDataMap = new Map();

      this.filteredGranularData.forEach((record) => {
        const menuItem = this.menuItemMap.get(record.menuItemId);
        if (!menuItem) return;

        const itemType = menuItem.type || "Unknown Type";
        const eventId =
          record.eventId || `${record.eventName}|${record.eventDate}`;

        if (!eventDataMap.has(eventId)) {
          eventDataMap.set(eventId, new Map());
        }

        const eventTypeRevenues = eventDataMap.get(eventId);
        const currentRevenue = eventTypeRevenues.get(itemType) || 0;
        eventTypeRevenues.set(itemType, currentRevenue + record.revenue);
      });

      const eventTop10Map = new Map();

      eventDataMap.forEach((typeRevenues, eventId) => {
        const top10Types = Array.from(typeRevenues.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([typeName]) => typeName);

        eventTop10Map.set(eventId, new Set(top10Types));
      });

      const eventRevenueMap = new Map();

      this.filteredGranularData.forEach((record) => {
        const menuItem = this.menuItemMap.get(record.menuItemId);
        if (!menuItem) return;

        const itemType = menuItem.type || "Unknown Type";
        const eventId =
          record.eventId || `${record.eventName}|${record.eventDate}`;

        if (!eventRevenueMap.has(eventId)) {
          const currentEventName = this.getEventName(
            record.eventId,
            record.eventName,
          );

          let currentEventDate = record.eventDate;
          if (this.filteredEvents && record.eventId) {
            const event = this.filteredEvents.find(
              (e) => e.id === record.eventId,
            );
            if (event) currentEventDate = event.eventDate;
          }

          const uniqueDisplayName = `${currentEventName} (${currentEventDate})`;

          eventRevenueMap.set(eventId, {
            eventId: record.eventId,
            eventName: currentEventName,
            eventDate: currentEventDate,
            displayName: uniqueDisplayName,
            totalRevenue: 0,
            Others: 0,
            _typeDetails: new Map(),
            isPredictive: record.isPredictive || false,
            confidenceScore: 0,
            _confSum: 0,
            _confW: 0,
            isLowConfidence: record.isLowConfidence || false,
          });
        }

        const eventData = eventRevenueMap.get(eventId);
        if (record.isLowConfidence) eventData.isLowConfidence = true;
        if (Number.isFinite(record.confidenceScore)) {
          eventData._confSum += record.confidenceScore * (record.revenue || 0);
          eventData._confW += record.revenue || 0;
        }
        const eventTop10 = eventTop10Map.get(eventId);

        const currentTypeRevenue = eventData._typeDetails.get(itemType) || 0;
        eventData._typeDetails.set(
          itemType,
          currentTypeRevenue + record.revenue,
        );

        if (eventTop10?.has(itemType)) {
          if (!eventData[itemType]) eventData[itemType] = 0;
          eventData[itemType] += record.revenue;
        } else {
          eventData.Others += record.revenue;
        }

        eventData.totalRevenue += record.revenue;
      });

      const sortedEvents = Array.from(eventRevenueMap.values()).sort(
        (a, b) =>
          this.parseDDMMYYYY(a.eventDate).getTime() -
          this.parseDDMMYYYY(b.eventDate).getTime(),
      );

      let cumulativeRevenue = 0;
      sortedEvents.forEach((event) => {
        cumulativeRevenue += event.totalRevenue;
        event.cumulativeRevenue = cumulativeRevenue;
        if (event._confW) {
          event.confidenceScore = Math.round(event._confSum / event._confW);
        }
        delete event._confSum;
        delete event._confW;
      });

      return sortedEvents;
    },

    chartData() {
      const baseData =
        this.viewMode === "shop"
          ? this.chartDataShop
          : this.chartDataMenuItemType;

      if (this.aggregationMode === "monthly")
        return this.aggregateByMonth(baseData);
      if (this.aggregationMode === "quarterly")
        return this.aggregateByQuarter(baseData);
      if (this.aggregationMode === "yearly")
        return this.aggregateByYear(baseData);

      if (this.aggregationMode === "event" && this.sortMode === "revenue") {
        return [...baseData].sort((a, b) => b.totalRevenue - a.totalRevenue);
      }

      return baseData;
    },

    allItems() {
      if (this.filteredGranularData.length === 0) return [];

      if (this.viewMode === "shop") {
        const allTop10Shops = new Set();

        this.chartData.forEach((event) => {
          Object.keys(event).forEach((key) => {
            if (
              key.startsWith("_") ||
              key === "eventId" ||
              key === "eventName" ||
              key === "eventDate" ||
              key === "displayName" ||
              key === "totalRevenue" ||
              key === "cumulativeRevenue" ||
              key === "Others" ||
              key === "isPredictive" ||
              key === "confidenceScore" ||
              key === "isLowConfidence" ||
              key === "eventCount" ||
              key === "monthKey" ||
              key === "quarterKey" ||
              key === "yearKey"
            ) {
              return;
            }

            if (typeof event[key] === "number" && event[key] > 0) {
              allTop10Shops.add(key);
            }
          });
        });

        const shopTotalRevenue = new Map();
        this.filteredGranularData.forEach((record) => {
          const current = shopTotalRevenue.get(record.elementName) || 0;
          shopTotalRevenue.set(record.elementName, current + record.revenue);
        });

        return Array.from(allTop10Shops).sort(
          (a, b) =>
            (shopTotalRevenue.get(b) || 0) - (shopTotalRevenue.get(a) || 0),
        );
      } else {
        const allTop10Types = new Set();

        this.chartData.forEach((event) => {
          Object.keys(event).forEach((key) => {
            if (
              key.startsWith("_") ||
              key === "eventId" ||
              key === "eventName" ||
              key === "eventDate" ||
              key === "displayName" ||
              key === "totalRevenue" ||
              key === "cumulativeRevenue" ||
              key === "Others" ||
              key === "isPredictive" ||
              key === "confidenceScore" ||
              key === "isLowConfidence" ||
              key === "eventCount" ||
              key === "monthKey" ||
              key === "quarterKey" ||
              key === "yearKey"
            ) {
              return;
            }

            if (typeof event[key] === "number" && event[key] > 0) {
              allTop10Types.add(key);
            }
          });
        });

        const typeTotalRevenue = new Map();
        this.filteredGranularData.forEach((record) => {
          const menuItem = this.menuItemMap.get(record.menuItemId);
          if (menuItem) {
            const itemType = menuItem.type || "Unknown Type";
            const current = typeTotalRevenue.get(itemType) || 0;
            typeTotalRevenue.set(itemType, current + record.revenue);
          }
        });

        return Array.from(allTop10Types).sort(
          (a, b) =>
            (typeTotalRevenue.get(b) || 0) - (typeTotalRevenue.get(a) || 0),
        );
      }
    },

    itemColorMap() {
      const colorMap = new Map();
      this.allItems.forEach((itemName, index) => {
        colorMap.set(itemName, SHOP_COLORS[index % SHOP_COLORS.length]);
      });
      colorMap.set("Others", OTHERS_COLOR);
      return colorMap;
    },

    items() {
      return this.allItems;
    },

    itemsToDisplay() {
      const hasOthers = this.chartData.some((event) => (event.Others || 0) > 0);
      if (hasOthers) return [...this.items, "Others"];
      return this.items;
    },

    totalRevenue() {
      return this.chartData.reduce((sum, event) => {
        return (
          sum +
          this.items.reduce(
            (eventSum, item) => eventSum + (event[item] || 0),
            0,
          )
        );
      }, 0);
    },

    // Computed wrappers for vue-chartjs <Bar> reactivity
    chartOptions() {
      return this.getChartOptions();
    },

    processedChartData() {
      return this.getProcessedChartData();
    },

    chartTitle() {
      const periodMap = {
        event: "",
        monthly: "mensuel ",
        quarterly: "trimestriel ",
        yearly: "annuel ",
      };
      const period = periodMap[this.aggregationMode] || "";
      const dim = this.viewMode === "shop" ? "shop" : "type de menu";
      return `CA ${period}par évènement par ${dim} (HT)`;
    },
  },

  methods: {
    aggregateByMonth(eventData) {
      if (eventData.length === 0) return [];

      const monthlyDataMap = new Map();
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      eventData.forEach((event) => {
        const eventDate = this.parseDDMMYYYY(event.eventDate);
        const yearMonth = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}`;
        const monthName = `${monthNames[eventDate.getMonth()]} ${eventDate.getFullYear()}`;

        if (!monthlyDataMap.has(yearMonth)) {
          monthlyDataMap.set(yearMonth, {
            monthKey: yearMonth,
            displayName: monthName,
            totalRevenue: 0,
            Others: 0,
            eventCount: 0,
            _shopDetails: new Map(),
            _typeDetails: new Map(),
          });
        }

        const monthData = monthlyDataMap.get(yearMonth);
        monthData.eventCount += 1;
        monthData.totalRevenue += event.totalRevenue || 0;

        // Aggregate shop or type data
        const detailsKey =
          this.viewMode === "shop" ? "_shopDetails" : "_typeDetails";
        const eventDetails = event[detailsKey] || new Map();

        eventDetails.forEach((revenue, itemName) => {
          const currentRevenue = monthData[detailsKey].get(itemName) || 0;
          monthData[detailsKey].set(itemName, currentRevenue + revenue);
        });

        // Aggregate individual items
        Object.keys(event).forEach((key) => {
          if (
            key.startsWith("_") ||
            key === "eventId" ||
            key === "eventName" ||
            key === "eventDate" ||
            key === "displayName" ||
            key === "totalRevenue" ||
            key === "cumulativeRevenue"
          ) {
            return;
          }

          if (typeof event[key] === "number") {
            monthData[key] = (monthData[key] || 0) + event[key];
          }
        });
      });

      // Convert to array and recalculate top 10 for each month
      const monthlyDataArray = Array.from(monthlyDataMap.values());

      monthlyDataArray.forEach((monthData) => {
        const detailsKey =
          this.viewMode === "shop" ? "_shopDetails" : "_typeDetails";
        const itemDetails = monthData[detailsKey];

        const sortedItems = Array.from(itemDetails.entries()).sort(
          (a, b) => b[1] - a[1],
        );

        const top10 = sortedItems.slice(0, 10);
        const othersItems = sortedItems.slice(10);

        // Reset month data
        Object.keys(monthData).forEach((key) => {
          if (
            !key.startsWith("_") &&
            key !== "monthKey" &&
            key !== "displayName" &&
            key !== "totalRevenue" &&
            key !== "eventCount"
          ) {
            delete monthData[key];
          }
        });

        // Set top 10
        top10.forEach(([itemName, revenue]) => {
          monthData[itemName] = revenue;
        });

        // Set Others
        monthData.Others = othersItems.reduce(
          (sum, [_, revenue]) => sum + revenue,
          0,
        );
      });

      // Sort by date
      monthlyDataArray.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

      // Calculate cumulative revenue
      let cumulativeRevenue = 0;
      monthlyDataArray.forEach((monthData) => {
        cumulativeRevenue += monthData.totalRevenue;
        monthData.cumulativeRevenue = cumulativeRevenue;
      });

      return monthlyDataArray;
    },

    getElementName(elementId) {
      return this.elementIdToNameMap?.get(elementId) || elementId;
    },

    getEventName(eventId, fallbackName) {
      if (!this.filteredEvents || !eventId) return fallbackName;
      const event = this.filteredEvents.find((e) => e.id === eventId);
      return event ? event.eventName || event.name : fallbackName;
    },

    parseDDMMYYYY(dateStr) {
      if (!dateStr) return new Date(0);

      if (dateStr.includes("-")) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;
      }

      const [day, month, year] = dateStr.split("/").map(Number);
      if (!day || !month || !year) return new Date(0);
      return new Date(year, month - 1, day);
    },

    getItemColor(itemName) {
      return this.itemColorMap.get(itemName) || OTHERS_COLOR;
    },

    // Helper : "#RRGGBB" -> "rgba(r,g,b,a)"
    hexToRgba(hex, alpha) {
      const clean = String(hex || "").replace("#", "");
      if (clean.length !== 6) return hex;
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

    // True si la date est strictement avant aujourd'hui (00:00).
    isEventInPast(eventDate) {
      if (!eventDate) return false;
      const d = this.parseDDMMYYYY(eventDate);
      if (!d || isNaN(d.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < today.getTime();
    },

    // Couleur appliquée à un segment de barre (cf. doc §8.6).
    // 1) prédiction low-confidence -> rouge fixe
    // 2) mode Predict + event passé non prédit -> couleur de base à 50%
    // 3) sinon -> couleur de base pleine
    getBarColor(itemName, eventData) {
      const baseColor = this.getItemColor(itemName);
      if (eventData?.isPredictive && eventData?.isLowConfidence) {
        return "#ef4444";
      }
      if (
        this.isPredictMode &&
        eventData?.eventDate &&
        !eventData?.isPredictive &&
        this.isEventInPast(eventData.eventDate)
      ) {
        return this.hexToRgba(baseColor, 0.5);
      }
      return baseColor;
    },

    handleChartClick(event, elements) {
      if (elements && elements.length > 0) {
        const element = elements[0];
        const dataIndex = element.index;
        const data = this.chartData[dataIndex];

        if (this.onEventClick && data.eventId) {
          this.onEventClick(data.eventId);
        }
      }
    },

    // Toggle sort mode (Par date <-> Par CA)
    setSortMode() {
      this.sortMode = this.sortMode === "date" ? "revenue" : "date";
    },

    // Set aggregation mode and close dropdown
    setAggregationMode(mode) {
      this.aggregationMode = mode;
      this.dropdownOpen = false;
    },

    // Chart configuration for Vue ChartJS
    getChartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: this.isMobile
            ? {
                top: 5,
                right: 5,
                left: 5,
                bottom: this.aggregationMode === "event" ? 20 : 40,
              }
            : {
                top: 5,
                right: 60,
                left: 20,
                bottom: this.aggregationMode === "event" ? 20 : 40,
              },
        },
        scales: {
          x: {
            ticks: {
              display: this.aggregationMode !== "event",
              font: { size: 11 },
            },
            grid: { display: false },
          },
          y: {
            type: "linear",
            display: true,
            position: "left",
            ticks: {
              callback: (value) => `€${this.formatNumber(value)}`,
            },
            grid: { display: true, drawBorder: false },
            min: 0,
          },
          y1: {
            type: "linear",
            display: this.sortMode === "date",
            position: "right",
            ticks: {
              callback: (value) => `€${this.formatNumber(value)}`,
              font: { size: 12 },
            },
            grid: { display: false, drawBorder: false },
            min: 0,
          },
        },
        plugins: {
          tooltip: {
            // Tooltip HTML externe (canvas ne peut pas flouter) → effet frosted glass
            // au survol des barres (parité React: bg-gray-800/50 backdrop-blur).
            enabled: false,
            external: (ctx) => this.externalTooltip(ctx),
            callbacks: {
              label: (context) => this.customTooltipLabel(context),
              afterBody: (context) => this.customTooltipAfterBody(context),
            },
          },
          legend: {
            display: true,
            position: "left",
            labels: {
              font: { size: 12 },
              boxWidth: 10,
              padding: 15,
            },
          },
        },
        onClick: (event, elements) => this.handleChartClick(event, elements),
      };
    },

    // Chart datasets for Vue ChartJS
    getChartDatasets() {
      const datasets = [];

      // Ajouter les barres pour chaque item à afficher
      this.itemsToDisplay.forEach((item, index) => {
        // Couleur par barre (cf. doc §8.6) : opacité 50% pour events passés
        // non prédits en mode Predict, rouge pour low-confidence.
        const perBarColors = this.chartData.map((row) =>
          this.getBarColor(item, row),
        );
        datasets.push({
          label: item,
          data: this.chartData.map((d) => d[item] || 0),
          backgroundColor: perBarColors,
          borderColor: perBarColors,
          borderWidth: 1,
          borderRadius: index === this.itemsToDisplay.length - 1 ? 8 : 0,
          borderSkipped: false,
          stack: "revenue",
          yAxisID: "y",
          order: 1,
        });
      });

      // Ajouter la ligne cumulative si en mode date
      if (this.sortMode === "date") {
        datasets.push({
          label: "CA cumulé",
          data: this.chartData.map((d) => d.cumulativeRevenue || 0),
          type: "line",
          borderColor: "#FF6347",
          backgroundColor: "#FF6347",
          borderWidth: 1.5,
          pointRadius: 0.9,
          pointHoverRadius: 1.1,
          fill: false,
          tension: 0.1,
          yAxisID: "y1",
          order: 0,
        });
      }

      return datasets;
    },

    // Processed chart data for Vue ChartJS
    getProcessedChartData() {
      return {
        labels: this.chartData.map((d) => d.displayName || ""),
        datasets: this.getChartDatasets(),
      };
    },

    // Custom tooltip label for Chart.js
    customTooltipLabel(context) {
      const label = context.dataset.label || "";
      const value = context.parsed.y;
      return `${label}: €${this.formatNumber(value)}`;
    },

    // Custom tooltip after body for additional details
    customTooltipAfterBody(context) {
      if (context && context.length > 0) {
        const dataIndex = context[0].dataIndex;
        const eventData = this.chartData[dataIndex];

        if (eventData) {
          const lines = [];
          // Badge en tête : FIABILITÉ FAIBLE > PRÉDIT xx% (cf. doc §8.6)
          if (eventData.isPredictive && eventData.isLowConfidence) {
            lines.push(
              "[FIABILITÉ FAIBLE] Basé sur 3 évènements aléatoires (données insuffisantes)",
            );
          } else if (eventData.isPredictive) {
            const score = eventData.confidenceScore || 0;
            lines.push(
              score > 0 ? `[PRÉDIT ${score}%]` : "[PRÉDIT]",
            );
          }
          lines.push(`Évènement : ${eventData.eventName}`);
          lines.push(`Date : ${eventData.eventDate}`);
          lines.push(
            `Total : €${this.formatNumber(eventData.totalRevenue || 0)}`,
          );
          return lines;
        }
      }
      return [];
    },

    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },

    // Tooltip HTML externe (frosted glass). Reconstruit le contenu à partir du
    // modèle Chart.js : titre (event) + afterBody (date/total/badge) + lignes
    // colorées par shop. Positionné au-dessus du curseur, flou via CSS.
    externalTooltip(context) {
      const el = this.$refs.tooltipEl;
      if (!el) return;
      const tooltip = context.tooltip;

      if (!tooltip || tooltip.opacity === 0) {
        el.style.opacity = 0;
        return;
      }

      const title = (tooltip.title || []).join(" ");
      const after = (tooltip.afterBody || [])
        .map((l) => `<div class="erbs-tt-after">${this.escapeHtml(l)}</div>`)
        .join("");
      const rows = (tooltip.body || [])
        .map((b, i) => {
          const color =
            tooltip.labelColors?.[i]?.backgroundColor || "#888888";
          const text = (b.lines || []).join(" ");
          return `<div class="erbs-tt-row"><span class="erbs-tt-dot" style="background:${color}"></span><span class="erbs-tt-text">${this.escapeHtml(text)}</span></div>`;
        })
        .join("");

      el.innerHTML =
        (title ? `<div class="erbs-tt-title">${this.escapeHtml(title)}</div>` : "") +
        after +
        (rows ? `<div class="erbs-tt-rows">${rows}</div>` : "");

      const canvas = context.chart.canvas;
      el.style.opacity = 1;
      el.style.left = `${canvas.offsetLeft + tooltip.caretX}px`;
      el.style.top = `${canvas.offsetTop + tooltip.caretY}px`;
    },

    // Initialize chart
    initChart() {
      if (this.$refs.barChart) {
        const ctx = this.$refs.barChart.getContext("2d");
        this.chart = new ChartJS(ctx, {
          type: "bar",
          data: this.getProcessedChartData(),
          options: this.getChartOptions(),
        });
      }
    },

    // Update chart
    updateChart() {
      if (this.chart) {
        this.chart.data = this.getProcessedChartData();
        this.chart.options = this.getChartOptions();
        this.chart.update();
      }
    },

    // Aggregate data by year
    aggregateByYear(eventData) {
      if (eventData.length === 0) return [];

      const yearlyDataMap = new Map();

      eventData.forEach((event) => {
        const eventDate = this.parseDDMMYYYY(event.eventDate);
        const year = eventDate.getFullYear().toString();

        if (!yearlyDataMap.has(year)) {
          yearlyDataMap.set(year, {
            yearKey: year,
            displayName: year,
            totalRevenue: 0,
            Others: 0,
            eventCount: 0,
            _shopDetails: new Map(),
            _typeDetails: new Map(),
          });
        }

        const yearData = yearlyDataMap.get(year);
        yearData.eventCount += 1;
        yearData.totalRevenue += event.totalRevenue || 0;

        // Aggregate shop or type data
        const detailsKey =
          this.viewMode === "shop" ? "_shopDetails" : "_typeDetails";
        const eventDetails = event[detailsKey] || new Map();

        eventDetails.forEach((revenue, itemName) => {
          const currentRevenue = yearData[detailsKey].get(itemName) || 0;
          yearData[detailsKey].set(itemName, currentRevenue + revenue);
        });

        // Aggregate individual items
        Object.keys(event).forEach((key) => {
          if (
            key.startsWith("_") ||
            key === "eventId" ||
            key === "eventName" ||
            key === "eventDate" ||
            key === "displayName" ||
            key === "totalRevenue" ||
            key === "cumulativeRevenue"
          ) {
            return;
          }

          if (typeof event[key] === "number") {
            yearData[key] = (yearData[key] || 0) + event[key];
          }
        });
      });

      // Convert to array and recalculate top 10 for each year
      const yearlyDataArray = Array.from(yearlyDataMap.values());

      yearlyDataArray.forEach((yearData) => {
        const detailsKey =
          this.viewMode === "shop" ? "_shopDetails" : "_typeDetails";
        const itemDetails = yearData[detailsKey];

        const sortedItems = Array.from(itemDetails.entries()).sort(
          (a, b) => b[1] - a[1],
        );

        const top10 = sortedItems.slice(0, 10);
        const othersItems = sortedItems.slice(10);

        // Reset year data
        Object.keys(yearData).forEach((key) => {
          if (
            !key.startsWith("_") &&
            key !== "yearKey" &&
            key !== "displayName" &&
            key !== "totalRevenue" &&
            key !== "eventCount"
          ) {
            delete yearData[key];
          }
        });

        // Set top 10
        top10.forEach(([itemName, revenue]) => {
          yearData[itemName] = revenue;
        });

        // Set Others
        yearData.Others = othersItems.reduce(
          (sum, [_, revenue]) => sum + revenue,
          0,
        );
      });

      // Sort by date
      yearlyDataArray.sort((a, b) => a.yearKey.localeCompare(b.yearKey));

      // Calculate cumulative revenue
      let cumulativeRevenue = 0;
      yearlyDataArray.forEach((yearData) => {
        cumulativeRevenue += yearData.totalRevenue;
        yearData.cumulativeRevenue = cumulativeRevenue;
      });

      return yearlyDataArray;
    },

    // Aggregate data by quarter
    aggregateByQuarter(eventData) {
      if (eventData.length === 0) return [];

      const quarterlyDataMap = new Map();

      eventData.forEach((event) => {
        const eventDate = this.parseDDMMYYYY(event.eventDate);
        const quarter = Math.floor(eventDate.getMonth() / 3) + 1;
        const yearQuarter = `${eventDate.getFullYear()}-Q${quarter}`;
        const quarterName = `Q${quarter} ${eventDate.getFullYear()}`;

        if (!quarterlyDataMap.has(yearQuarter)) {
          quarterlyDataMap.set(yearQuarter, {
            quarterKey: yearQuarter,
            displayName: quarterName,
            totalRevenue: 0,
            Others: 0,
            eventCount: 0,
            _shopDetails: new Map(),
            _typeDetails: new Map(),
          });
        }

        const quarterData = quarterlyDataMap.get(yearQuarter);
        quarterData.eventCount += 1;
        quarterData.totalRevenue += event.totalRevenue || 0;

        // Aggregate shop or type data
        const detailsKey =
          this.viewMode === "shop" ? "_shopDetails" : "_typeDetails";
        const eventDetails = event[detailsKey] || new Map();

        eventDetails.forEach((revenue, itemName) => {
          const currentRevenue = quarterData[detailsKey].get(itemName) || 0;
          quarterData[detailsKey].set(itemName, currentRevenue + revenue);
        });

        // Aggregate individual items
        Object.keys(event).forEach((key) => {
          if (
            key.startsWith("_") ||
            key === "eventId" ||
            key === "eventName" ||
            key === "eventDate" ||
            key === "displayName" ||
            key === "totalRevenue" ||
            key === "cumulativeRevenue"
          ) {
            return;
          }

          if (typeof event[key] === "number") {
            quarterData[key] = (quarterData[key] || 0) + event[key];
          }
        });
      });

      // Convert to array and recalculate top 10 for each quarter
      const quarterlyDataArray = Array.from(quarterlyDataMap.values());

      quarterlyDataArray.forEach((quarterData) => {
        const detailsKey =
          this.viewMode === "shop" ? "_shopDetails" : "_typeDetails";
        const itemDetails = quarterData[detailsKey];

        const sortedItems = Array.from(itemDetails.entries()).sort(
          (a, b) => b[1] - a[1],
        );

        const top10 = sortedItems.slice(0, 10);
        const othersItems = sortedItems.slice(10);

        // Reset quarter data
        Object.keys(quarterData).forEach((key) => {
          if (
            !key.startsWith("_") &&
            key !== "quarterKey" &&
            key !== "displayName" &&
            key !== "totalRevenue" &&
            key !== "eventCount"
          ) {
            delete quarterData[key];
          }
        });

        // Set top 10
        top10.forEach(([itemName, revenue]) => {
          quarterData[itemName] = revenue;
        });

        // Set Others
        quarterData.Others = othersItems.reduce(
          (sum, [_, revenue]) => sum + revenue,
          0,
        );
      });

      // Sort by date
      quarterlyDataArray.sort((a, b) =>
        a.quarterKey.localeCompare(b.quarterKey),
      );

      // Calculate cumulative revenue
      let cumulativeRevenue = 0;
      quarterlyDataArray.forEach((quarterData) => {
        cumulativeRevenue += quarterData.totalRevenue;
        quarterData.cumulativeRevenue = cumulativeRevenue;
      });

      return quarterlyDataArray;
    },

    debugItemsToDisplay() {
      console.log("\n[ITEMS TO DISPLAY DEBUG] ===== RENDERING BREAKDOWN =====");
      console.log(
        `[ITEMS TO DISPLAY DEBUG] Total unique items: ${this.itemsToDisplay.length}`,
      );
      console.log("[ITEMS TO DISPLAY DEBUG] Items:", this.itemsToDisplay);

      console.log(
        "\n[ITEMS TO DISPLAY DEBUG] 📊 BAR STACKING ORDER (Bottom to Top):",
      );
      this.itemsToDisplay.forEach((item, idx) => {
        const position =
          idx === 0
            ? "⬇️ BOTTOM"
            : idx === this.itemsToDisplay.length - 1
              ? "⬆️ TOP"
              : `   ${idx}`;
        console.log(`[ITEMS TO DISPLAY DEBUG] ${position}: ${item}`);
      });

      console.log(
        "\n[ITEMS TO DISPLAY DEBUG] ================================\n",
      );
    },
  },
};
</script>

<style scoped>
/* Tooltip frosted glass — affiché au survol des barres (analyse + predict). */
.erbs-tooltip {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -108%);
  transition: opacity 0.15s ease, left 0.08s ease, top 0.08s ease;
  min-width: 190px;
  max-width: 320px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(17, 24, 39, 0.55);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
  color: #f3f4f6;
  font-size: 12px;
  line-height: 1.5;
}
.erbs-tooltip :deep(.erbs-tt-title) {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 2px;
}
.erbs-tooltip :deep(.erbs-tt-after) {
  color: #cbd5e1;
  font-size: 11px;
}
.erbs-tooltip :deep(.erbs-tt-rows) {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.erbs-tooltip :deep(.erbs-tt-row) {
  display: flex;
  align-items: center;
  gap: 8px;
}
.erbs-tooltip :deep(.erbs-tt-dot) {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.erbs-tooltip :deep(.erbs-tt-text) {
  white-space: nowrap;
}
</style>
