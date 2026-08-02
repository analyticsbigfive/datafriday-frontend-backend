<template>
  <Card
    v-if="!events || events.length === 0"
    class="bg-white dark:bg-gray-900 dark:border-gray-800"
  >
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <TrendingUp class="w-5 h-5" />
        F&amp;B Revenue by Space &amp; Month
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="text-center py-12 text-gray-500 dark:text-gray-400">
        No event data available
      </div>
    </CardContent>
  </Card>

  <Card
    v-else-if="chartData.length === 0"
    class="bg-white dark:bg-gray-900 dark:border-gray-800"
  >
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <TrendingUp class="w-5 h-5" />
        F&amp;B Revenue by Space &amp; Month
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="text-center py-12 text-gray-500 dark:text-gray-400">
        No revenue data available for the selected period
      </div>
    </CardContent>
  </Card>

  <Card
    v-else
    class="bg-white dark:bg-gray-900 dark:border-gray-800"
  >
    <CardHeader>
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <CardTitle class="flex items-center gap-2">
            <TrendingUp class="w-5 h-5" />
            F&amp;B Revenue by
            {{
              breakdownMode === 'space'
                ? 'Space'
                : breakdownMode === 'menuType'
                  ? 'Menu Type'
                  : 'Event Type'
            }}
            &amp; Month
          </CardTitle>

          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Monthly revenue breakdown by
            {{
              breakdownMode === 'space'
                ? 'space'
                : breakdownMode === 'menuType'
                  ? 'element type'
                  : 'event category'
            }}
          </p>
        </div>

        <div class="flex gap-2">
          <button
            @click="setBreakdownMode('space')"
            :class="[
              'px-3 py-1.5 text-xs rounded-md transition-colors',
              breakdownMode === 'space'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            ]"
          >
            Space
          </button>

          <button
            @click="setBreakdownMode('menuType')"
            :class="[
              'px-3 py-1.5 text-xs rounded-md transition-colors',
              breakdownMode === 'menuType'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            ]"
          >
            Type
          </button>

          <button
            @click="setBreakdownMode('eventType')"
            :class="[
              'px-3 py-1.5 text-xs rounded-md transition-colors',
              breakdownMode === 'eventType'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            ]"
          >
            Event
          </button>
        </div>
      </div>
    </CardHeader>

    <CardContent>
      <div class="w-full" :style="{ height: isMobile ? '300px' : '400px' }">
        <Bar :data="chartJsData" :options="chartJsOptions" />
      </div>
    </CardContent>
  </Card>
</template>

<script>
import { Bar } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";

import { TrendingUp } from "lucide-vue-next";
import * as eventApi from "../utils/eventApi";
import { currentIntlLocale } from "@/composables/useNumberFormat";

// NOTE: dans ton projet actuel, Card est en TSX (React).
// Je garde les imports/tags pour coller à ton style existant en Vue.
// Si tu as une version Vue de Card, ajuste ces imports.
import Card from "../ui/card.vue";
import CardContent from "../ui/cardContent.vue";
import CardHeader from "../ui/cardHeader.vue";
import CardTitle from "../ui/cardTitle.vue";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const SPACE_COLORS = [
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
];

export default {
  name: "SpaceRevenueByMonthChart",
  components: {
    Bar,
    TrendingUp,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  },
  props: {
    events: { type: Array, required: true },
    spaces: { type: Array, required: true },
  },
  data() {
    return {
      isMobile: false,
      breakdownMode: "space", // 'space' | 'menuType' | 'eventType'
      eventTypes: [],
      eventCategories: [],
    };
  },
  watch: {
    breakdownMode: {
      immediate: true,
      async handler(mode) {
        if (mode === "eventType") {
          await this.loadEventData();
        }
      },
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
  computed: {
    spaceNameMap() {
      const map = new Map();
      (this.spaces || []).forEach((space) => {
        if (space && space.id != null) map.set(space.id, space.name);
      });
      return map;
    },
    eventTypeMap() {
      const map = new Map();
      (this.eventTypes || []).forEach((type) => {
        if (type && type.id != null) map.set(type.id, type.name);
      });
      return map;
    },
    eventCategoryMap() {
      const map = new Map();
      (this.eventCategories || []).forEach((category) => {
        if (category && category.id != null) map.set(category.id, category.name);
      });
      return map;
    },

    chartData() {
      console.log(
        "[SPACE REVENUE CHART] Processing events:",
        (this.events && this.events.length) || 0,
        "Mode:",
        this.breakdownMode
      );

      if (!this.events || this.events.length === 0) return [];

      const monthBreakdownRevenue = new Map(); // monthKey -> Map(breakdownKey -> revenue)
      const allBreakdownKeys = new Set();

      (this.events || []).forEach((event) => {
        if (!event || !event.eventDate) return;

        const date = this.parseEventDate(event.eventDate);
        if (!date) return;

        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

        const revenue = event.event_revenue_HT || 0;

        let breakdownKey = null;

        if (this.breakdownMode === "space") {
          breakdownKey = event.spaceId;
        } else if (this.breakdownMode === "menuType") {
          breakdownKey = event.elementType || "Unknown";
        } else if (this.breakdownMode === "eventType") {
          breakdownKey = event.eventTypeId || event.eventCategoryId || "unknown";
        }

        if (!breakdownKey) return;

        allBreakdownKeys.add(breakdownKey);

        if (!monthBreakdownRevenue.has(monthKey)) {
          monthBreakdownRevenue.set(monthKey, new Map());
        }

        const monthData = monthBreakdownRevenue.get(monthKey);
        monthData.set(breakdownKey, (monthData.get(breakdownKey) || 0) + revenue);
      });

      console.log("[SPACE REVENUE CHART] Unique months:", monthBreakdownRevenue.size);
      console.log("[SPACE REVENUE CHART] Unique breakdown keys:", allBreakdownKeys.size);

      const sortedMonths = Array.from(monthBreakdownRevenue.keys()).sort();

      const data = sortedMonths.map((monthKey) => {
        const parts = monthKey.split("-");
        const year = parts[0];
        const month = parts[1];

        const monthName = new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleDateString(
          "en-US",
          { month: "short", year: "2-digit" }
        );

        const dataPoint = { month: monthName, monthKey };

        const monthData = monthBreakdownRevenue.get(monthKey);

        allBreakdownKeys.forEach((key) => {
          let displayName = key;

          if (this.breakdownMode === "space") {
            displayName = this.spaceNameMap.get(key) || key;
          } else if (this.breakdownMode === "menuType") {
            displayName = key;
          } else {
            displayName =
              this.eventTypeMap.get(key) ||
              this.eventCategoryMap.get(key) ||
              key;
          }

          dataPoint[displayName] = monthData.get(key) || 0;
        });

        return dataPoint;
      });

      console.log("[SPACE REVENUE CHART] Chart data points:", data.length);
      console.log("[SPACE REVENUE CHART] Sample data:", data[0]);

      return data;
    },

    breakdownNames() {
      if (!this.events || this.events.length === 0) return [];

      if (this.breakdownMode === "space") {
        const uniqueSpaceIds = new Set((this.events || []).map((e) => e && e.spaceId).filter(Boolean));
        return Array.from(uniqueSpaceIds)
          .map((spaceId) => this.spaceNameMap.get(spaceId) || spaceId)
          .sort();
      }

      if (this.breakdownMode === "menuType") {
        const uniqueTypes = new Set((this.events || []).map((e) => e && e.elementType).filter(Boolean));
        if (uniqueTypes.size === 0) uniqueTypes.add("Unknown");
        return Array.from(uniqueTypes).sort();
      }

      const uniqueIds = new Set(
        (this.events || []).map((e) => (e && (e.eventTypeId || e.eventCategoryId)) || null).filter(Boolean)
      );
      if (uniqueIds.size === 0) uniqueIds.add("unknown");

      return Array.from(uniqueIds)
        .map((id) => this.eventTypeMap.get(id) || this.eventCategoryMap.get(id) || id)
        .sort();
    },

    chartJsData() {
      const labels = (this.chartData || []).map((d) => d.month);

      const datasets = (this.breakdownNames || []).map((name, index) => ({
        label: name,
        data: (this.chartData || []).map((d) => d[name] || 0),
        backgroundColor: SPACE_COLORS[index % SPACE_COLORS.length],
        stack: "a",
      }));

      return { labels, datasets };
    },

    chartJsOptions() {
      // IMPORTANT: on désactive le tooltip natif et on le remplace par external (HTML identique)
      return {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            labels: {
              boxWidth: 12,
              font: { size: this.isMobile ? 11 : 12 },
            },
          },

          tooltip: {
            enabled: false,
            external: (context) => this.renderExternalTooltip(context),
          },
        },

        scales: {
          x: {
            stacked: true,
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              autoSkip: false,
            },
            grid: {
              display: true,
            },
          },
          y: {
            stacked: true,
            ticks: {
              callback: (value) => this.formatNumber(Number(value)),
            },
            grid: {
              display: true,
            },
          },
        },
      };
    },
  },

  methods: {
    setBreakdownMode(mode) {
      this.breakdownMode = mode;
    },

    updateIsMobile() {
      this.isMobile = window.matchMedia("(max-width: 640px)").matches;
    },

    async loadEventData() {
      try {
        const [types, categories] = await Promise.all([
          eventApi.getEventTypes(),
          eventApi.getEventCategories(),
        ]);

        console.log("[SPACE REVENUE CHART] Loaded event types:", (types && types.length) || 0);
        console.log(
          "[SPACE REVENUE CHART] Loaded event categories:",
          (categories && categories.length) || 0
        );

        this.eventTypes = types || [];
        this.eventCategories = categories || [];
      } catch (error) {
        console.error("[SPACE REVENUE CHART] Error loading event data:", error);
      }
    },

    parseEventDate(dateString) {
      if (!dateString) return null;

      if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;
      }

      if (/^\d{2}\/\d{2}\/\d{4}/.test(dateString)) {
        const [day, month, year] = dateString.split("/");
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(date.getTime())) return date;
      }

      if (/^\d{2}-\d{2}-\d{4}/.test(dateString)) {
        const [day, month, year] = dateString.split("-");
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(date.getTime())) return date;
      }

      const date = new Date(dateString);
      if (!isNaN(date.getTime())) return date;

      console.warn("[SPACE REVENUE CHART] Could not parse date:", dateString);
      return null;
    },

    formatNumber(value) {
      const v = Number(value || 0);

      if (!this.isMobile) return v.toLocaleString(currentIntlLocale());

      if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
      if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
      return String(v);
    },

    // ===== Tooltip HTML identique à CustomTooltip (Recharts) =====

    getOrCreateTooltipEl(chart) {
      const parent = chart.canvas.parentNode;
      if (!parent) return null;

      let el = parent.querySelector(".chartjs-custom-tooltip");
      if (el) return el;

      el = document.createElement("div");
      el.className = "chartjs-custom-tooltip";
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.zIndex = "50";
      el.style.opacity = "0";

      parent.style.position = parent.style.position || "relative";
      parent.appendChild(el);

      return el;
    },

    cleanupExternalTooltip() {
      const els = document.querySelectorAll(".chartjs-custom-tooltip");
      els.forEach((el) => el.remove());
    },

    renderExternalTooltip(context) {
      const { chart, tooltip } = context;
      const tooltipEl = this.getOrCreateTooltipEl(chart);
      if (!tooltipEl) return;

      if (!tooltip || tooltip.opacity === 0) {
        tooltipEl.style.opacity = "0";
        return;
      }

      const title = (tooltip.title && tooltip.title[0]) || "";
      const dataPoints = (tooltip.dataPoints || [])
        .map((dp, idx) => {
          const raw = Number(dp.raw || 0);
          const label = dp.dataset && dp.dataset.label ? dp.dataset.label : "";
          const colorObj = tooltip.labelColors && tooltip.labelColors[idx];
          const color = (colorObj && colorObj.backgroundColor) || "#000000";
          return { label, value: raw, color };
        })
        .filter((e) => e.value > 0)
        .sort((a, b) => b.value - a.value);

      const total = dataPoints.reduce((sum, e) => sum + (e.value || 0), 0);

      // HTML identique à ton CustomTooltip JSX (classes Tailwind)
      tooltipEl.innerHTML = `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p class="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100">${title}</p>
          <div class="space-y-1">
            ${dataPoints
              .map(
                (e) => `
                  <div class="flex items-center justify-between gap-4 text-xs">
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 rounded-sm" style="background-color: ${e.color};"></div>
                      <span class="text-gray-700 dark:text-gray-300">${e.label}</span>
                    </div>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">
                      €${this.formatNumber(e.value)}
                    </span>
                  </div>
                `
              )
              .join("")}
          </div>
          <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between text-xs">
            <span class="text-gray-600 dark:text-gray-400">Total</span>
            <span class="font-bold text-gray-900 dark:text-gray-100">€${this.formatNumber(total)}</span>
          </div>
        </div>
      `;

      const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;

      tooltipEl.style.opacity = "1";
      tooltipEl.style.left = positionX + tooltip.caretX + "px";
      tooltipEl.style.top = positionY + tooltip.caretY + "px";
      tooltipEl.style.transform = "translate(10px, 10px)";
    },
  },
};
</script>