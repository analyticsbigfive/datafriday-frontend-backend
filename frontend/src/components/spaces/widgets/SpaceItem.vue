<template>
  <div class="si-card" :class="{ 'si-card--dark': isDark }" @click="goToAnalyse">

    <!-- ── Image ── -->
    <div class="si-img">
      <img :src="spaceImage" :alt="space?.name" />

      <!-- Type badge -->
      <div v-if="space?.spaceType" class="si-type-badge">{{ space.spaceType }}</div>

      <!-- Bouton Live (◉) : affiché EN CONTINU (hors .si-actions hover-only) si
           l'espace a un event en cours. Gated backend : champ `space.liveEvent`
           (cf. docs/modules/11_LIVE.md §7/§8bis-A) → masqué tant que le backend
           ne l'expose pas. Mène à la route Live dédiée. -->
      <button
        v-if="isLive"
        class="si-live-btn"
        :title="liveTitle"
        aria-label="Live"
        @click.stop="goLive"
      >
        <span class="si-live-dot"></span>
      </button>

      <!-- Actions (top-right, visible on hover) — RBAC : édition d'espace
           (builder / modifier / supprimer) gardée par `space.edit`. Sans cette
           permission, l'utilisateur voit la carte (nav.spaces) mais pas les actions. -->
      <div v-if="canEditSpace" class="si-actions">
        <button class="si-action-btn" title="3D Builder" @click.stop="goToBuilder">
          <Hammer :size="14" />
        </button>
        <button class="si-action-btn" title="Modifier" @click.stop="editSpaceItem">
          <Pencil :size="14" />
        </button>
        <button class="si-action-btn si-action-btn--del" title="Supprimer" @click.stop="deleteSpaceItem">
          <Trash2 :size="14" />
        </button>
      </div>

      <!-- Bottom overlay: name + meta -->
      <div class="si-overlay">
        <div class="si-name">{{ space?.name || '—' }}</div>
        <div class="si-meta">
          <span v-if="space?.city" class="si-meta__item">
            <MapPin :size="11" />{{ space.city }}
          </span>
          <span v-if="space?.maxCapacity" class="si-meta__item">
            <Users :size="11" />{{ formatNumber(space.maxCapacity) }}
          </span>
          <span v-if="space?.numberOfFloors" class="si-meta__item">
            <Layers :size="11" />{{ formatNumber(space.numberOfFloors) }} niv.
          </span>
        </div>
      </div>
    </div>

    <!-- ── Stats grid ── -->
    <div v-can="'stats.financial.view'" class="si-stats">
      <div class="si-stat">
        <div class="si-stat__label"><TrendingUp :size="11" />{{ t('spaceCardFbRevenue') }}</div>
        <div class="si-stat__value si-stat__value--red">{{ formatCurrency(space?.fbRevenue) }}</div>
      </div>
      <!-- BUG-350-01 — périmètre explicite : ce per-capita rapporte le CA aux
           billets de TOUS les events de l'espace (à venir et sans vente compris),
           là où l'écran Analyse ne prend que les events filtrés. Deux chiffres
           légitimes, deux périmètres — sans la mention ils se contredisent. -->
      <div class="si-stat" :title="t('anPerCapScopeAllSpaceEvents')">
        <div class="si-stat__label"><Coins :size="11" />{{ t('spaceCardPerCapita') }}</div>
        <div class="si-stat__value si-stat__value--green">{{ formatCurrency(space?.perCapita) }}</div>
      </div>
      <div class="si-stat si-stat--bl">
        <div class="si-stat__label"><ShoppingBasket :size="11" />{{ t('spaceCardAvgTx') }}</div>
        <div class="si-stat__value si-stat__value--purple">{{ formatCurrency(space?.avgTransaction) }}</div>
      </div>
      <div class="si-stat si-stat--bl">
        <div class="si-stat__label"><Calendar :size="11" />{{ t('spaceCardAvgEvent') }}</div>
        <div class="si-stat__value si-stat__value--amber">{{ formatCurrency(space?.avgEvent) }}</div>
      </div>
    </div>

  </div>
</template>

<script>
import {
  TrendingUp,
  Coins,
  ShoppingBasket,
  Calendar,
  Pencil,
  Copy,
  Trash2,
  Users,
  Layers,
  Hammer,
  MapPin,
} from "lucide-vue-next";
import { clearDemoMode } from "@/utils/demoMode";
import { getSpaceLiveStatus } from "@/api/endpoints/space.api";
import { formatCurrencyDetailed } from "@/composables/useFormatters";
import { currentIntlLocale } from "@/composables/useNumberFormat";
import { useI18n } from "@/i18n/useI18n";
export default {
  name: 'SpaceItem',
  components: {
    TrendingUp, Coins, ShoppingBasket, Calendar,
    Pencil, Trash2, Users, Layers, Hammer, MapPin,
  },
  // Libellés des 4 tuiles : plus de texte utilisateur en dur dans le template
  // (règle CLAUDE.md). Valeurs FR identiques à l'anglais — c'est un routage i18n,
  // pas une retraduction : l'écran ne change pas d'apparence.
  setup() {
    const { t } = useI18n();
    return { t };
  },
  props: {
    space:         { type: Object,   default: null },
    editSpace:     { type: Function, default: null },
    deleteSpace:   { type: Function, default: null },
    fallbackImage: { type: String,   default: 'https://cdn.vuetifyjs.com/images/cards/docks.jpg' },
    // Thème sombre : passé par SpaceListView (pattern SpaceCreateDrawer / HrSpaceCard).
    isDark:        { type: Boolean,  default: false },
  },
  data() {
    return {
      // Signal live (module Live, greffe A) — renseigné au montage via /live-status.
      isLive: false,
      liveSince: null,
    };
  },
  computed: {
    spaceImage() {
      return this.space?.image || this.fallbackImage
    },
    // RBAC : autorise builder/édition/suppression d'espace (ADMIN bypass dans le getter).
    canEditSpace() {
      return this.$store.getters['auth/can']('space.edit')
    },
    // RBAC : permission de la route Live — sert aussi à ne PAS appeler /live-status
    // (403) pour les rôles sans accès Live.
    canLive() {
      return this.$store.getters['auth/can']('front.fb.live')
    },
    liveTitle() {
      if (!this.liveSince) return 'Live'
      const mins = Math.max(0, Math.round((Date.now() - new Date(this.liveSince).getTime()) / 60000))
      return mins > 0 ? `Live · depuis ${mins} min` : 'Live · à l\'instant'
    },
  },
  methods: {
    goToAnalyse() {
      const spaceId = this.space?.id || this.space?._id;
      if (spaceId) {
        // Choix explicite d'un vrai espace → purge un flag démo collé qui ferait
        // afficher le mock (Adidas Arena) à la place de l'espace demandé.
        clearDemoMode();
        this.$router.push(`/spaces/${spaceId}`);
      }
    },
    goToBuilder() {
      const spaceId = this.space?.id || this.space?._id;
      if (spaceId) {
        clearDemoMode();
        this.$router.push({ name: 'SpaceBuilder2', params: { spaceId } });
      }
    },
    // Module Live (docs/modules/11_LIVE.md, greffe A) : route dédiée /spaces/:id/live.
    goLive() {
      const spaceId = this.space?.id || this.space?._id;
      if (spaceId) {
        clearDemoMode();
        this.$router.push(`/spaces/${spaceId}/live`);
      }
    },
    // Signal live par carte (LIVE_API_GUIDE.md §1.2 : endpoint dédié, pas de champ
    // sur la liste /spaces). Appelé au montage, uniquement si l'utilisateur a la
    // permission Live (sinon 403 inutile en masse sur la Home).
    async checkLiveStatus() {
      const spaceId = this.space?.id || this.space?._id;
      if (!spaceId || !this.canLive) return;
      try {
        const res = await getSpaceLiveStatus(spaceId);
        this.isLive = !!res?.isLive;
        this.liveSince = res?.since || null;
      } catch (_) {
        this.isLive = false;
      }
    },
    editSpaceItem() {
      if (this.editSpace) this.editSpace(this.space);
    },
    deleteSpaceItem() {
      if (this.deleteSpace) this.deleteSpace(this.space);
    },
    formatCurrency(value) {
      return formatCurrencyDetailed(Number(value) || 0)
    },
    formatNumber(value) {
      const n = Number(value)
      return Number.isFinite(n) ? n.toLocaleString(currentIntlLocale()) : '—'
    },
  },
  mounted() {
    this.checkLiveStatus();
  },
}
</script>

<style scoped>
/* ── Card shell ── */
.si-card {
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, .06);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .06);
  cursor: pointer;
  transition: transform .22s ease, box-shadow .22s ease;
  display: flex;
  flex-direction: column;
  user-select: none;
}
.si-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 18px 44px rgba(0, 0, 0, .14);
}

/* ── Image ── */
.si-img {
  position: relative;
  height: 185px;
  overflow: hidden;
  flex-shrink: 0;
}
.si-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform .35s ease;
}
.si-card:hover .si-img img {
  transform: scale(1.05);
}

/* ── Type badge ── */
.si-type-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(255, 255, 255, .18);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, .35);
  color: #fff;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 100px;
}

/* Bouton Live (◉) — module Live. Visible en continu (contrairement à .si-actions
   hover-only). Point rouge « record » pulsant, coin haut-droit. */
.si-live-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, .45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease;
}
.si-live-btn:hover { transform: scale(1.08); background: rgba(0, 0, 0, .6); }
.si-live-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff3131;
  box-shadow: 0 0 0 0 rgba(255, 49, 49, .55);
  animation: si-live-pulse 1.6s infinite;
}
@keyframes si-live-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(255, 49, 49, .55); }
  70%  { box-shadow: 0 0 0 9px rgba(255, 49, 49, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 49, 49, 0); }
}

/* ── Action buttons ── */
.si-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 5px;
  opacity: 0;
  transition: opacity .2s;
}
.si-card:hover .si-actions { opacity: 1; }

.si-action-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, .9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #374151;
  transition: background .15s, color .15s, transform .1s;
}
.si-action-btn:hover          { background: #fff; color: #ff3131; transform: scale(1.08); }
.si-action-btn--del:hover     { color: #dc2626; }

/* ── Bottom overlay ── */
.si-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 32px 14px 13px;
  background: linear-gradient(to top, rgba(0, 0, 0, .72) 0%, transparent 100%);
}
.si-name {
  font-size: var(--fs-md);
  font-weight: 700;
  color: #fff;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 5px;
}
.si-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.si-meta__item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-xs);
  color: rgba(255, 255, 255, .8);
}

/* ── Stats grid ── */
.si-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid #f0f0f0;
}
.si-stat {
  padding: 11px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-right: 1px solid #f0f0f0;
  transition: background .15s;
}
.si-stat:nth-child(2n) { border-right: none; }
.si-stat--bl           { border-top: 1px solid #f0f0f0; }
.si-stat:hover         { background: #fafafa; }

.si-stat__label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: #9ca3af;
}
.si-stat__value {
  font-size: var(--fs-md);
  font-weight: 700;
  line-height: 1.2;
}
.si-stat__value--red    { color: #ff3131; }
.si-stat__value--green  { color: #059669; }
.si-stat__value--purple { color: #7c3aed; }
.si-stat__value--amber  { color: #d97706; }

/* ── Dark (BUG-247-01) — palette slate, copiée de HrSpaceCard (clone documenté
   de cette carte). Uniquement des overrides : les littéraux clairs ci-dessus
   restent la base, le mode clair est inchangé par construction. Le rouge de
   marque #ff3131 est identique dans les deux thèmes (parité BUG-196/197) ;
   badge de type et dégradé du bandeau nom sont posés sur la photo, déjà
   corrects en sombre — non surchargés. ── */
.si-card--dark {
  background: #1e293b;
  border-color: rgba(255, 255, 255, .08);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .35);
}
.si-card--dark .si-stats     { border-top-color: rgba(255, 255, 255, .08); }
.si-card--dark .si-stat      { border-right-color: rgba(255, 255, 255, .08); }
.si-card--dark .si-stat--bl  { border-top-color: rgba(255, 255, 255, .08); }
.si-card--dark .si-stat:hover { background: #24324a; }
.si-card--dark .si-stat__label { color: #94a3b8; }
/* Teintes sémantiques calibrées pour fond clair → membre clair de la même
   famille (pattern BUG-197). Vert/violet/ambre ; rouge inchangé. */
.si-card--dark .si-stat__value--green  { color: #86efac; }
.si-card--dark .si-stat__value--purple { color: #c4b5fd; }
.si-card--dark .si-stat__value--amber  { color: #fcd34d; }
/* Boutons d'action sur photo : fond translucide sombre (parité HrSpaceCard). */
.si-card--dark .si-action-btn { background: rgba(30, 41, 59, .9); color: #cbd5e1; }
.si-card--dark .si-action-btn:hover { background: #0f172a; color: #ff3131; }
.si-card--dark .si-action-btn--del:hover { color: #f87171; }
</style>
