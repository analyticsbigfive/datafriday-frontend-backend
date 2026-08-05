<script>
import Card from "../ui/card.vue";
import CardContent from "../ui/cardContent.vue";
import CardHeader from "../ui/cardHeader.vue";
import CardTitle from "../ui/cardTitle.vue";
import { TrendingUp } from "lucide-vue-next";
import * as eventApi from "../utils/eventApi";
import { currentIntlLocale } from "@/composables/useNumberFormat";

// Pour Recharts: en Vue tu n'auras pas Recharts directement.
// Je laisse volontairement de côté l'import chart ici car tu as demandé "script".
// (Si tu veux, je te propose ensuite l'équivalent Vue avec ECharts ou Chart.js.)

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
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    TrendingUp,
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

      SPACE_COLORS,
    };
  },
  computed: {
    // Map spaceId -> spaceName
    spaceNameMap() {
      const map = new Map();
      (this.spaces || []).forEach((space) => {
        if (space && space.id != null) map.set(space.id, space.name);
      });
      return map;
    },

    // Map eventTypeId -> name
    eventTypeMap() {
      const map = new Map();
      (this.eventTypes || []).forEach((type) => {
        if (type && type.id != null) map.set(type.id, type.name);
      });
      return map;
    },

    // Map eventCategoryId -> name
    eventCategoryMap() {
      const map = new Map();
      (this.eventCategories || []).forEach((category) => {
        if (category && category.id != null) map.set(category.id, category.name);
      });
      return map;
    },

    // Aggregate data by month and breakdown dimension
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

      this.events.forEach((event) => {
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

        const monthName = new Date(parseInt(year, 10), parseInt(month, 10) - 1)
          .toLocaleDateString("en-US", { month: "short", year: "2-digit" });

        const dataPoint = {
          month: monthName,
          monthKey,
        };

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

    // Get unique breakdown names for legend
    breakdownNames() {
      if (!this.events || this.events.length === 0) return [];

      if (this.breakdownMode === "space") {
        const uniqueSpaceIds = new Set(
          this.events.map((e) => e && e.spaceId).filter(Boolean)
        );

        return Array.from(uniqueSpaceIds)
          .map((spaceId) => this.spaceNameMap.get(spaceId) || spaceId)
          .sort();
      }

      if (this.breakdownMode === "menuType") {
        const uniqueTypes = new Set(
          this.events.map((e) => e && e.elementType).filter(Boolean)
        );
        if (uniqueTypes.size === 0) uniqueTypes.add("Unknown");
        return Array.from(uniqueTypes).sort();
      }

      const uniqueIds = new Set(
        this.events
          .map((e) => (e && (e.eventTypeId || e.eventCategoryId)) || null)
          .filter(Boolean)
      );
      if (uniqueIds.size === 0) uniqueIds.add("unknown");

      return Array.from(uniqueIds)
        .map((id) => this.eventTypeMap.get(id) || this.eventCategoryMap.get(id) || id)
        .sort();
    },
  },
  watch: {
    breakdownMode: {
      immediate: true,
      handler(newMode) {
        if (newMode === "eventType") {
          this.loadEventData();
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
  },
  methods: {
    updateIsMobile() {
      // Equivalent simple à useIsMobile()
      this.isMobile = window.matchMedia("(max-width: 640px)").matches;
    },

    async loadEventData() {
      try {
        const results = await Promise.all([
          eventApi.getEventTypes(),
          eventApi.getEventCategories(),
        ]);

        const types = results[0];
        const categories = results[1];

        console.log("[SPACE REVENUE CHART] Loaded event types:", (types && types.length) || 0);
        console.log("[SPACE REVENUE CHART] Loaded event categories:", (categories && categories.length) || 0);

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
        const parts = dateString.split("/");
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(date.getTime())) return date;
      }

      if (/^\d{2}-\d{2}-\d{4}/.test(dateString)) {
        const parts = dateString.split("-");
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(date.getTime())) return date;
      }

      const date = new Date(dateString);
      if (!isNaN(date.getTime())) return date;

      console.warn("[SPACE REVENUE CHART] Could not parse date:", dateString);
      return null;
    },

    formatNumber(value) {
      if (!this.isMobile) return Number(value || 0).toLocaleString(currentIntlLocale());

      const v = Number(value || 0);
      if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
      if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
      return String(v);
    },

    // Equivalent Vue du composant tooltip Recharts (renvoie du HTML via template normalement)
    // Ici je te mets la fonction de calcul, et tu l'utiliseras dans ton template tooltip.
    computeTooltipTotal(payload) {
      if (!payload || payload.length === 0) return 0;
      return payload.reduce((sum, entry) => sum + (entry.value || 0), 0);
    },
  },
};
</script>