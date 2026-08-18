<template>
  <div class="pt-wrap">
    <h1>Predict Engine — Test Harness</h1>
    <p class="muted">
      Vérification de la transposition React → Vue de la logique prédictive.
      Données mock JSON, aucune dépendance UI externe.
    </p>

    <!-- Space details -->
    <section class="card">
      <h2>Space</h2>
      <table class="kv">
        <tbody>
          <tr><th>ID</th><td>{{ space.id }}</td></tr>
          <tr><th>Name</th><td>{{ space.name }}</td></tr>
          <tr><th>City</th><td>{{ space.city }}</td></tr>
          <tr><th>Capacity</th><td>{{ space.capacity.toLocaleString() }}</td></tr>
          <tr><th>Currency</th><td>{{ space.currency }}</td></tr>
          <tr><th>Shops</th><td>{{ space.shopsCount }}</td></tr>
        </tbody>
      </table>
    </section>

    <!-- Future events selector -->
    <section class="card">
      <h2>Future Events ({{ futureEvents.length }})</h2>
      <div class="ev-grid">
        <button
          v-for="ev in futureEvents"
          :key="ev.id"
          :class="['ev-btn', { active: selectedId === ev.id }]"
          @click="selectedId = ev.id"
        >
          <div class="ev-name">{{ ev.eventName }}</div>
          <div class="ev-meta">
            {{ ev.eventDate }} · {{ ev.eventType }} / {{ ev.subcategory }}
          </div>
          <div class="ev-meta">
            {{ ev.ticketsSold.toLocaleString() }} tickets ·
            {{ ev.sessions[0].showTime }}
          </div>
        </button>
      </div>
    </section>

    <template v-if="selectedEvent">
      <!-- Past events scoring -->
      <section class="card">
        <h2>Scored Past Events ({{ scored.length }} valides / {{ pastEvents.length }} totaux)</h2>
        <p class="muted small">
          Past events exclus par hard filter (mismatch type/cat, attendance &gt; 40 % diff,
          showTime &gt; 3 h diff) n'apparaissent pas.
        </p>
        <table class="grid">
          <thead>
            <tr>
              <th></th>
              <th>Event</th>
              <th>Date</th>
              <th>Type/Cat/Sub</th>
              <th class="num">Tickets</th>
              <th class="num">Score</th>
              <th class="num">Weight</th>
              <th class="num">Scaling</th>
              <th>Breakdown</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="se in scored" :key="se.event.id"
                :class="{ excluded: !active.has(se.event.id) }">
              <td>
                <input
                  type="checkbox"
                  :checked="active.has(se.event.id)"
                  @change="toggle(se.event.id)"
                />
              </td>
              <td>{{ se.event.eventName }}</td>
              <td>{{ se.event.eventDate }}</td>
              <td>{{ se.event.eventType }} / {{ se.event.category }} / {{ se.event.subcategory }}</td>
              <td class="num">{{ se.event.ticketsSold.toLocaleString() }}</td>
              <td class="num">
                <strong>{{ se.score }}</strong> / {{ se.maxPossibleScore }}
                ({{ se.scorePercentage }} %)
              </td>
              <td class="num">{{ formatWeight(se.event.id) }}</td>
              <td class="num">{{ se.scalingFactor.toFixed(3) }}×</td>
              <td class="bd">
                <span v-for="(v, k) in nonZeroBreakdown(se.breakdown)" :key="k">
                  {{ k }}:{{ v }}
                </span>
              </td>
            </tr>
            <tr v-if="!scored.length">
              <td colspan="9" class="muted">Aucun past event ne passe les hard filters.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Excluded list -->
      <section class="card" v-if="excluded.length">
        <h2>Past Events Exclus ({{ excluded.length }})</h2>
        <ul class="excl">
          <li v-for="x in excluded" :key="x.event.id">
            <strong>{{ x.event.eventName }}</strong>
            ({{ x.event.eventDate }}, {{ x.event.eventType }}/{{ x.event.subcategory }},
            {{ x.event.ticketsSold.toLocaleString() }} tickets,
            show {{ x.event.sessions?.[0]?.showTime }})
            — raison : {{ x.reason }}
          </li>
        </ul>
      </section>

      <!-- KPI summary -->
      <section class="card">
        <h2>Predicted Totals</h2>
        <div class="kpi-grid">
          <div class="kpi">
            <div class="kpi-label">Predicted Units</div>
            <div class="kpi-value">{{ totals.units.toLocaleString() }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Predicted Revenue</div>
            <div class="kpi-value">{{ space.currency }} {{ totals.revenue.toLocaleString() }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Confidence</div>
            <div class="kpi-value">{{ confidence }} %</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Past events utilisés</div>
            <div class="kpi-value">{{ active.size }}</div>
          </div>
        </div>
      </section>

      <!-- Predictions per shop -->
      <section class="card">
        <h2>Prédictions par Shop</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Shop</th>
              <th class="num">Units Sold</th>
              <th class="num">Revenue ({{ space.currency }})</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shopRows" :key="r.label">
              <td>{{ r.label }}</td>
              <td class="num">{{ r.quantity.toLocaleString() }}</td>
              <td class="num">{{ r.revenue.toLocaleString() }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th class="num">{{ totals.units.toLocaleString() }}</th>
              <th class="num">{{ totals.revenue.toLocaleString() }}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      <!-- Predictions per item -->
      <section class="card">
        <h2>Prédictions par Menu Item</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Menu Item</th>
              <th>Shop</th>
              <th class="num">Units</th>
              <th class="num">Revenue ({{ space.currency }})</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in itemRows" :key="r.label + r.shop">
              <td>{{ r.label }}</td>
              <td>{{ r.shop }}</td>
              <td class="num">{{ r.quantity.toLocaleString() }}</td>
              <td class="num">{{ r.revenue.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Computation traces -->
      <section class="card" v-if="trace.length">
        <h2>Trace de Calcul (par item)</h2>
        <p class="muted small">
          Pour chaque item, contribution de chaque past event :
          <code>(quantité_passée × scaling × poids)</code>.
        </p>
        <details v-for="t in trace" :key="t.key">
          <summary>{{ t.key }} — total prédit : {{ Math.round(t.qtySum).toLocaleString() }} units / {{ Math.round(t.revSum).toLocaleString() }} {{ space.currency }}</summary>
          <table class="grid sub">
            <thead>
              <tr>
                <th>Past event</th>
                <th class="num">Q passée</th>
                <th class="num">Scaling</th>
                <th class="num">Poids</th>
                <th class="num">Q × scaling × poids</th>
                <th class="num">R × scaling × poids</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in t.rows" :key="row.eventId">
                <td>{{ row.eventName }}</td>
                <td class="num">{{ row.qty.toLocaleString() }}</td>
                <td class="num">{{ row.scaling.toFixed(3) }}</td>
                <td class="num">{{ (row.weight * 100).toFixed(2) }} %</td>
                <td class="num">{{ row.qContrib.toFixed(1) }}</td>
                <td class="num">{{ row.rContrib.toFixed(1) }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>
    </template>
  </div>
</template>

<script>
import mockData from '@/data/predictMock.json'
import {
  findAndScorePastEvents,
  generatePredictionsForEvent,
  calculateSimilarity,
  WEIGHTS,
} from '@/utils/predictiveAnalytics'

function parseDDMMYYYY(s) {
  if (!s) return null
  const p = String(s).split('/')
  if (p.length === 3) {
    const [d, m, y] = p.map((n) => parseInt(n, 10))
    if ([d, m, y].every(Number.isFinite)) return new Date(y, m - 1, d)
  }
  const iso = String(s).split('-')
  if (iso.length === 3) {
    const [y, m, d] = iso.map((n) => parseInt(n, 10))
    if ([d, m, y].every(Number.isFinite)) return new Date(y, m - 1, d)
  }
  return null
}

export default {
  name: 'PredictTestView',
  data() {
    return {
      space: mockData.space,
      events: mockData.events,
      shopGranularData: mockData.shopGranularData,
      selectedId: null,
      excludedIds: new Set(),
      WEIGHTS,
    }
  },
  computed: {
    today() {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d
    },
    futureEvents() {
      return this.events
        .filter((e) => {
          const d = parseDDMMYYYY(e.eventDate)
          return d && d.getTime() >= this.today.getTime()
        })
        .sort((a, b) => parseDDMMYYYY(a.eventDate) - parseDDMMYYYY(b.eventDate))
    },
    pastEvents() {
      return this.events.filter((e) => {
        const d = parseDDMMYYYY(e.eventDate)
        return d && d.getTime() < this.today.getTime()
      })
    },
    selectedEvent() {
      return this.events.find((e) => e.id === this.selectedId) || null
    },
    scored() {
      if (!this.selectedEvent) return []
      return findAndScorePastEvents(this.selectedEvent, this.pastEvents, this.shopGranularData).slice(0, 10)
    },
    excluded() {
      // Recompute reasons by re-running calculateSimilarity manually
      if (!this.selectedEvent) return []
      const out = []
      const eventsWithDataIds = new Set(this.shopGranularData.map((d) => d.eventId))
      for (const past of this.pastEvents) {
        if (!eventsWithDataIds.has(past.id)) {
          out.push({ event: past, reason: 'aucune donnée de vente' })
          continue
        }
        const r = calculateSimilarity(this.selectedEvent, past)
        if (r === null) {
          // Re-derive a likely reason
          const reasons = []
          if (this.selectedEvent.eventType !== past.eventType) reasons.push('eventType mismatch')
          if (this.selectedEvent.category !== past.category) reasons.push('category mismatch')
          const ts = this.selectedEvent.ticketsSold || 0
          const ps = past.ticketsSold || 0
          if (ts && ps) {
            const diff = Math.abs(ts - ps) / ts
            if (diff > 0.4) reasons.push(`attendance diff ${(diff * 100).toFixed(0)} % > 40 %`)
          }
          const tt = this.selectedEvent.sessions?.[0]?.showTime || '19:00'
          const pt = past.sessions?.[0]?.showTime || '19:00'
          const tm = parseInt(tt.split(':')[0]) * 60 + parseInt(tt.split(':')[1] || 0)
          const pm = parseInt(pt.split(':')[0]) * 60 + parseInt(pt.split(':')[1] || 0)
          if (Math.abs(tm - pm) > 180) reasons.push('showTime > 3 h diff')
          out.push({ event: past, reason: reasons.join(', ') || 'hard filter' })
        }
      }
      return out
    },
    active() {
      const ids = new Set(this.scored.map((s) => s.event.id))
      this.excludedIds.forEach((id) => ids.delete(id))
      return ids
    },
    activeScored() {
      return this.scored.filter((s) => this.active.has(s.event.id))
    },
    totalActiveScore() {
      return this.activeScored.reduce((a, b) => a + b.score, 0)
    },
    predictedRecords() {
      if (!this.selectedEvent) return []
      const ids = Array.from(this.active)
      return generatePredictionsForEvent(
        this.selectedEvent,
        this.pastEvents,
        this.shopGranularData,
        ids,
      )
    },
    totals() {
      return {
        units: this.predictedRecords.reduce((s, r) => s + (r.quantity || 0), 0),
        revenue: this.predictedRecords.reduce((s, r) => s + (r.revenue || 0), 0),
      }
    },
    confidence() {
      return this.predictedRecords[0]?.confidenceScore ?? 0
    },
    shopRows() {
      const map = new Map()
      for (const r of this.predictedRecords) {
        const k = r.shopName || r.elementName || 'Unknown'
        const cur = map.get(k) || { label: k, quantity: 0, revenue: 0 }
        cur.quantity += r.quantity || 0
        cur.revenue += r.revenue || 0
        map.set(k, cur)
      }
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
    },
    itemRows() {
      return this.predictedRecords
        .map((r) => ({
          label: r.menuItemName || r.menuItemId,
          shop: r.shopName || r.elementName,
          quantity: r.quantity || 0,
          revenue: r.revenue || 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
    },
    trace() {
      // Re-run weighted aggregation manually for transparency
      if (!this.selectedEvent || this.activeScored.length === 0) return []
      const total = this.totalActiveScore
      if (!total) return []
      const matched = new Set(this.activeScored.map((s) => s.event.id))
      const relevant = this.shopGranularData.filter((d) => matched.has(d.eventId))
      const items = new Map()
      for (const r of relevant) {
        const key = `${r.shopName} · ${r.menuItemName}`
        if (!items.has(key)) items.set(key, [])
        items.get(key).push(r)
      }
      const out = []
      items.forEach((records, key) => {
        let qtySum = 0
        let revSum = 0
        const rows = []
        for (const m of this.activeScored) {
          const rec = records.find((d) => d.eventId === m.event.id)
          const w = m.score / total
          if (rec) {
            const qC = rec.quantity * m.scalingFactor * w
            const rC = rec.revenue * m.scalingFactor * w
            qtySum += qC
            revSum += rC
            rows.push({
              eventId: m.event.id,
              eventName: m.event.eventName,
              qty: rec.quantity,
              scaling: m.scalingFactor,
              weight: w,
              qContrib: qC,
              rContrib: rC,
            })
          } else {
            rows.push({
              eventId: m.event.id,
              eventName: m.event.eventName + ' (item absent)',
              qty: 0,
              scaling: m.scalingFactor,
              weight: w,
              qContrib: 0,
              rContrib: 0,
            })
          }
        }
        if (qtySum > 0 || revSum > 0) out.push({ key, rows, qtySum, revSum })
      })
      return out.sort((a, b) => b.revSum - a.revSum)
    },
  },
  watch: {
    selectedId() {
      this.excludedIds = new Set()
    },
  },
  mounted() {
    if (this.futureEvents.length) this.selectedId = this.futureEvents[0].id
  },
  methods: {
    toggle(id) {
      const next = new Set(this.excludedIds)
      if (this.excludedIds.has(id)) {
        next.delete(id)
      } else if (this.active.has(id)) {
        next.add(id)
      } else {
        next.delete(id)
      }
      this.excludedIds = next
    },
    formatWeight(eventId) {
      if (!this.active.has(eventId)) return '—'
      const t = this.totalActiveScore
      if (!t) return '0 %'
      const se = this.activeScored.find((s) => s.event.id === eventId)
      return ((se.score / t) * 100).toFixed(1) + ' %'
    },
    nonZeroBreakdown(b) {
      const out = {}
      for (const k of Object.keys(b)) if (b[k]) out[k] = b[k]
      return out
    },
  },
}
</script>

<style scoped>
.pt-wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #111;
}
h1 { margin: 0 0 4px; font-size: 1.4rem; }
h2 { margin: 0 0 12px; font-size: 1.05rem; }
.muted { color: #666; }
.small { font-size: 0.85rem; }

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

.kv { border-collapse: collapse; }
.kv th { text-align: left; padding: 4px 12px 4px 0; color: #555; font-weight: 500; }
.kv td { padding: 4px 0; }

.ev-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.ev-btn {
  text-align: left; padding: 10px 12px;
  border: 1px solid #e5e7eb; border-radius: 6px;
  background: #fafafa; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.ev-btn:hover { background: #f0f0f0; }
.ev-btn.active { background: #dbeafe; border-color: #2563eb; }
.ev-name { font-weight: 600; margin-bottom: 4px; }
.ev-meta { color: #666; font-size: 0.85rem; }

.grid {
  width: 100%; border-collapse: collapse; font-size: 0.9rem;
}
.grid th, .grid td {
  padding: 8px 10px; border-bottom: 1px solid #eee; text-align: left;
}
.grid thead th { background: #f9fafb; font-weight: 600; }
.grid .num { text-align: right; font-variant-numeric: tabular-nums; }
.grid tr.excluded td { opacity: 0.45; text-decoration: line-through; }
.grid tfoot th { background: #f3f4f6; }
.grid.sub { font-size: 0.82rem; margin-top: 6px; }

.bd { font-size: 0.8rem; color: #555; }
.bd span { display: inline-block; margin-right: 8px; padding: 1px 6px; background: #f3f4f6; border-radius: 3px; }

.kpi-grid {
  display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.kpi {
  padding: 12px; background: #f9fafb; border: 1px solid #eee; border-radius: 6px;
}
.kpi-label { font-size: 0.78rem; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-size: 1.4rem; font-weight: 600; margin-top: 4px; }

.excl { margin: 0; padding-left: 18px; font-size: 0.88rem; color: #444; }
.excl li { margin-bottom: 4px; }

details { margin-top: 6px; }
details summary { cursor: pointer; padding: 4px 0; }
</style>
