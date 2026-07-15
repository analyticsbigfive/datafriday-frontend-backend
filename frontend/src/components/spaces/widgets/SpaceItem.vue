<template>
  <div class="si-card" @click="goToAnalyse">

    <!-- ── Image ── -->
    <div class="si-img">
      <img :src="spaceImage" :alt="space?.name" />

      <!-- Type badge -->
      <div v-if="space?.spaceType" class="si-type-badge">{{ space.spaceType }}</div>

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
    <div class="si-stats">
      <div class="si-stat">
        <div class="si-stat__label"><TrendingUp :size="11" />F&B Revenue</div>
        <div class="si-stat__value si-stat__value--red">{{ formatCurrency(space?.fbRevenue) }}</div>
      </div>
      <div class="si-stat">
        <div class="si-stat__label"><Coins :size="11" />Per Capita</div>
        <div class="si-stat__value si-stat__value--green">{{ formatCurrency(space?.perCapita) }}</div>
      </div>
      <div class="si-stat si-stat--bl">
        <div class="si-stat__label"><ShoppingBasket :size="11" />Avg / Tx</div>
        <div class="si-stat__value si-stat__value--purple">{{ formatCurrency(space?.avgTransaction) }}</div>
      </div>
      <div class="si-stat si-stat--bl">
        <div class="si-stat__label"><Calendar :size="11" />Avg / Event</div>
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
export default {
  name: 'SpaceItem',
  components: {
    TrendingUp, Coins, ShoppingBasket, Calendar,
    Pencil, Trash2, Users, Layers, Hammer, MapPin,
  },
  props: {
    space:         { type: Object,   default: null },
    editSpace:     { type: Function, default: null },
    deleteSpace:   { type: Function, default: null },
    fallbackImage: { type: String,   default: 'https://cdn.vuetifyjs.com/images/cards/docks.jpg' },
  },
  computed: {
    spaceImage() {
      return this.space?.image || this.fallbackImage
    },
    // RBAC : autorise builder/édition/suppression d'espace (ADMIN bypass dans le getter).
    canEditSpace() {
      return this.$store.getters['auth/can']('space.edit')
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
    editSpaceItem() {
      if (this.editSpace) this.editSpace(this.space);
    },
    deleteSpaceItem() {
      if (this.deleteSpace) this.deleteSpace(this.space);
    },
    formatCurrency(value) {
      return (Number(value) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
    },
    formatNumber(value) {
      const n = Number(value)
      return Number.isFinite(n) ? n.toLocaleString('fr-FR') : '—'
    },
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
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 100px;
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
  font-size: 15px;
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
  font-size: 11.5px;
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
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: #9ca3af;
}
.si-stat__value {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}
.si-stat__value--red    { color: #ff3131; }
.si-stat__value--green  { color: #059669; }
.si-stat__value--purple { color: #7c3aed; }
.si-stat__value--amber  { color: #d97706; }
</style>
