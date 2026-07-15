<script>
import { publicAnonKey, projectId } from '../utils/supabase/info';
export default {
  data() {
    return {
      cache: null,
      loading: false,
      error: null,
      _abortController: null,
    };
  },

  props: {
    spaceId: {
      type: String,
      default: null,
    },
  },


  methods: {
    async fetchCache() {
      if (!this.spaceId) {
        this.cache = null;
        this.loading = false;
        this.error = null;
        return;
      }

      this.loading = true;
      this.error = null;

      try {
        console.log("[SHOP CACHE] ========================================");
        console.log("[SHOP CACHE] FETCHING cache for space:", this.spaceId);
        console.log("[SHOP CACHE] ========================================");

        const cacheKey = `shop-performance-cache:${this.spaceId}`;
        console.log("[SHOP CACHE] Cache key:", cacheKey);
        console.log(
          "[SHOP CACHE] Endpoint:",
          `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/kv/${cacheKey}`,
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/kv/${cacheKey}`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        console.log(
          "[SHOP CACHE] Response status:",
          response.status,
          response.statusText,
        );

        if (!response.ok) {
          if (response.status === 404) {
            console.log("[SHOP CACHE] ❌ No cache found (404)");
            this.cache = null;
            this.error =
              "No cache available. Run Data Integration wizard to generate.";
            this.loading = false;
            return;
          }
          throw new Error(`Failed to fetch cache: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("[SHOP CACHE] Response data:", result);

        if (!result.success || !result.data) {
          console.log("[SHOP CACHE] ❌ Invalid cache response format");
          console.log("[SHOP CACHE] result.success:", result.success);
          console.log("[SHOP CACHE] result.data:", result.data);
          this.cache = null;
          this.error = "Invalid cache format";
          this.loading = false;
          return;
        }

        const cacheData = result.data;
        console.log("[SHOP CACHE] ✅ Cache loaded successfully");
        console.log("[SHOP CACHE] Shop count:", cacheData.shopCount);
        console.log("[SHOP CACHE] Menu item count:", cacheData.menuItemCount);
        console.log("[SHOP CACHE] Total revenue:", cacheData.totalRevenue);
        console.log("[SHOP CACHE] Source:", cacheData.source);
        console.log("[SHOP CACHE] Last updated:", cacheData.lastUpdated);
        console.log(
          "[SHOP CACHE] Shop keys:",
          Object.keys(cacheData.shops || {}).slice(0, 5),
        );
        console.log("[SHOP CACHE] ========================================");

        this.cache = cacheData;
        this.error = null;
      } catch (err) {
        console.error("[SHOP CACHE] ❌ Error fetching cache:", err);
        this.error =
          err instanceof Error ? err.message : "Failed to load cache";
        this.cache = null;
      } finally {
        this.loading = false;
      }
    },
  },

  watch: {
    spaceId: {
      immediate: true,
      handler() {
        this.fetchCache();
      },
    },
  },
};
</script>
