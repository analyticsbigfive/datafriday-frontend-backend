<template>
  <!-- Traçabilité de l'algo de prédiction, en POPUP dismissable.
       Un déclencheur discret sous la timeline ouvre une fenêtre façon terminal
       qui explique, en clair et compact, POURQUOI les évènements passés retenus
       l'ont été (contributions pondérées). Rassure le client : prédiction = algo
       explicite. LECTURE SEULE : données DÉJÀ calculées par usePredictiveTimeline
       (candidateEvents + breakdown + selectedPredictionEventIds). Aucun re-scoring,
       aucun timer bloquant. Le corps est rendu à l'ouverture (v-dialog lazy) → coût
       nul tant que fermé. Voir docs/DESIGN_EVENTPREDICT_ALGO_TERMINAL.md.

       MODE DEBUG (prop `debug`) : quand actif, le corps affiche des onglets de
       trace COMPLÈTE (candidats retenus + exclus avec raison/gate, diagnostics
       dataset, fetch timeline, fallback/sélection). Données déjà produites par
       l'algo déterministe (predictionTrace / timelineTrace) — toujours lecture
       seule, aucune influence sur la prédiction. Hors debug : rendu inchangé. -->
  <div v-if="visible" class="att-wrap">
    <button type="button" class="att-trigger" @click="open = true">
      <span class="att-dot" aria-hidden="true"></span>
      {{ triggerLabel }}
    </button>

    <v-dialog v-model="open" :max-width="debug ? 920 : 760" scrollable>
      <div class="att-modal">
        <div class="att-modal-head">
          <span class="att-dot" aria-hidden="true"></span>
          <span class="att-modal-title">
            {{ debug ? 'Mode debug · Trace de la prédiction' : 'Détails du calcul · Comment la prédiction est établie' }}
          </span>
          <button
            type="button"
            class="att-modal-close"
            aria-label="Fermer"
            @click="open = false"
          >✕</button>
        </div>

        <!-- ─────────── MODE DEBUG : onglets de trace complète ─────────── -->
        <div v-if="debug" class="att-body" role="log" aria-live="polite">
          <div class="att-tabs" role="tablist">
            <button
              v-for="t in tabs"
              :key="t.key"
              type="button"
              class="att-tab"
              :class="{ 'att-tab-active': activeTab === t.key }"
              role="tab"
              :aria-selected="activeTab === t.key ? 'true' : 'false'"
              @click="activeTab = t.key"
            >{{ t.label }}</button>
          </div>

          <div v-if="loading" class="att-line att-muted">▸ Calcul de la prédiction en cours…</div>

          <!-- Résumé -->
          <section v-else-if="activeTab === 'resume'" class="att-tabpanel" role="tabpanel">
            <div class="att-line att-muted">▸ Évènement cible</div>
            <div class="att-kv"><span class="att-k">Nom</span><span class="att-v">{{ tv(targetEvent && (targetEvent.eventName || targetEvent.name)) }}</span></div>
            <div class="att-kv"><span class="att-k">Date</span><span class="att-v">{{ tv(targetEvent && targetEvent.eventDate) }}</span></div>
            <div class="att-kv"><span class="att-k">Type</span><span class="att-v">{{ tv(targetEvent && (targetEvent.eventType || targetEvent.eventTypeId)) }}</span></div>
            <div class="att-kv"><span class="att-k">Catégorie</span><span class="att-v">{{ tv(targetEvent && (targetEvent.category || targetEvent.eventCategoryId)) }}</span></div>
            <div class="att-kv"><span class="att-k">Sous-catégorie</span><span class="att-v">{{ tv(targetEvent && (targetEvent.subcategory || targetEvent.eventSubcategoryId)) }}</span></div>
            <div class="att-kv"><span class="att-k">configurationId</span><span class="att-v">{{ tv(targetEvent && targetEvent.configurationId) }}</span></div>
            <div class="att-kv"><span class="att-k">Horaire</span><span class="att-v">{{ tv(targetShowTime) }}</span></div>
            <div class="att-kv"><span class="att-k">Billets vendus / scannés</span><span class="att-v">{{ tv(targetEvent && targetEvent.ticketsSold) }} / {{ tv(targetEvent && targetEvent.ticketsScanned) }}</span></div>

            <div class="att-line att-muted att-mt">▸ Diagnostics dataset</div>
            <div class="att-kv"><span class="att-k">Évènements chargés</span><span class="att-v">{{ diagnostics.totalEvents ?? '—' }}</span></div>
            <div class="att-kv"><span class="att-k">Candidats retenus (scorés)</span><span class="att-v">{{ diagnostics.validPastEvents ?? '—' }}</span></div>
            <div class="att-kv"><span class="att-k">Records de vente (granular)</span><span class="att-v">{{ diagnostics.granularRecords ?? '—' }}</span></div>
            <div class="att-kv"><span class="att-k">Event IDs avec ventes</span><span class="att-v">{{ diagnostics.eventsWithSalesData ?? '—' }}</span></div>
            <div class="att-kv">
              <span class="att-k">Overlap (events ∩ ventes)</span>
              <span class="att-v" :class="{ 'att-warn': diagnostics.eventIdOverlap === 0 }">{{ diagnostics.eventIdOverlap ?? '—' }}</span>
            </div>
            <div v-if="!predictionTrace" class="att-line att-muted att-mt">▸ Aucune trace de scoring (prédiction directe/mock ou pas encore calculée).</div>
          </section>

          <!-- Candidats retenus -->
          <section v-else-if="activeTab === 'included'" class="att-tabpanel" role="tabpanel">
            <div class="att-line att-muted">▸ {{ included.length }} candidat(s) retenu(s) · poids = score ÷ Σ scores</div>
            <div v-if="!included.length" class="att-line att-warn">▸ Aucun candidat retenu.</div>
            <div v-for="c in includedRows" :key="c.id" class="att-card">
              <div class="att-card-head">
                <span class="att-ok" v-if="c.selected">✓</span>
                <span class="att-muted" v-else>○</span>
                <span class="att-name">{{ c.name }}</span>
                <span class="att-date">{{ c.date }}</span>
                <span class="att-score">score {{ c.score }} / {{ c.maxScore }} · {{ c.pct }}%</span>
                <span class="att-weight">poids {{ c.weight }}%</span>
              </div>
              <div class="att-card-sub att-muted">
                scaling ×{{ c.scaling }} · {{ c.selected ? 'sélectionné' : 'non sélectionné (hors top-10 / exclu manuel)' }} · {{ c.reason }}
              </div>
              <div class="att-dims">{{ c.dims }}</div>
            </div>
          </section>

          <!-- Évènements exclus -->
          <section v-else-if="activeTab === 'excluded'" class="att-tabpanel" role="tabpanel">
            <div class="att-line att-muted">▸ {{ excluded.length }} évènement(s) exclu(s)</div>
            <div v-if="!excluded.length" class="att-line att-muted">▸ Aucun évènement exclu.</div>
            <div v-for="(e, i) in excludedRows" :key="e.id || i" class="att-card">
              <div class="att-card-head">
                <span class="att-warn">✕</span>
                <span class="att-name">{{ e.name }}</span>
                <span class="att-date">{{ e.date }}</span>
                <span class="att-gate">gate: {{ e.gate }}</span>
              </div>
              <div class="att-card-sub">{{ e.reason }}</div>
              <div v-if="e.hasValues" class="att-card-sub att-muted">
                cible: {{ e.targetValue }} · passé: {{ e.pastValue }}
              </div>
            </div>
          </section>

          <!-- Timeline fetch -->
          <section v-else-if="activeTab === 'timeline'" class="att-tabpanel" role="tabpanel">
            <div class="att-line att-muted">▸ Récupération des timelines minute des events sélectionnés</div>
            <div class="att-kv">
              <span class="att-k">usedFallback</span>
              <span class="att-v" :class="{ 'att-warn': timelineTrace && timelineTrace.usedFallback }">{{ timelineTrace ? String(!!timelineTrace.usedFallback) : '—' }}</span>
            </div>
            <div v-if="!timelineFetch.length" class="att-line att-muted att-mt">▸ Aucun fetch de timeline enregistré.</div>
            <div v-for="(f, i) in timelineFetch" :key="f.eventId || i" class="att-line">
              <span :class="f.hadData ? 'att-ok' : 'att-warn'">{{ f.hadData ? '✓' : (f.failed ? '✕' : '∅') }}</span>
              <span class="att-name">{{ f.eventId }}</span>
              <span class="att-v">{{ f.hadData ? 'données minute OK' : (f.failed ? 'fetch échoué' : 'aucune minute (vide)') }}</span>
              <span v-if="f.aborted" class="att-muted">· annulé</span>
            </div>
          </section>

          <!-- Fallback / sélection -->
          <section v-else-if="activeTab === 'fallback'" class="att-tabpanel" role="tabpanel">
            <div class="att-line att-muted">▸ Confiance / fallback</div>
            <div class="att-kv"><span class="att-k">insufficientData</span><span class="att-v">{{ dbgFlag('insufficientData') }}</span></div>
            <div class="att-kv"><span class="att-k">Confiance faible (fallback)</span><span class="att-v" :class="{ 'att-warn': lowConfidence }">{{ String(!!lowConfidence) }}</span></div>
            <div v-if="lowConfIds.length" class="att-line">
              <span class="att-muted">Basée sur (events récents) :</span>
              <span v-for="id in lowConfIds" :key="id" class="att-name">{{ id }}</span>
            </div>
            <div v-if="lowConfidence" class="att-card-sub att-muted">
              Aucun candidat n'a passé les gates (type/config/catégorie/affluence/horaire) → repli déterministe sur les 3 events récents ayant des ventes.
            </div>

            <div class="att-line att-muted att-mt">▸ Sélection sauvegardée / manuelle</div>
            <template v-if="selection">
              <div class="att-kv"><span class="att-k">IDs sauvegardés/override</span><span class="att-v">{{ selection.savedSelectionIds && selection.savedSelectionIds.length ? selection.savedSelectionIds.join(', ') : '— (aucun)' }}</span></div>
              <div class="att-kv"><span class="att-k">Override utilisé</span><span class="att-v">{{ String(!!selection.overrideUsed) }}</span></div>
              <div class="att-kv"><span class="att-k">IDs sauvegardés introuvables</span><span class="att-v" :class="{ 'att-warn': selection.missingSavedIds && selection.missingSavedIds.length }">{{ selection.missingSavedIds && selection.missingSavedIds.length ? selection.missingSavedIds.join(', ') : '— (aucun)' }}</span></div>
              <div class="att-kv"><span class="att-k">Sélection ≠ top-10 défaut</span><span class="att-v" :class="{ 'att-warn': selection.selectionChangedFinalSet }">{{ String(!!selection.selectionChangedFinalSet) }}</span></div>
            </template>
            <div v-else class="att-line att-muted">▸ Pas de diagnostic de sélection (chemin insuffisant/mock).</div>

            <div v-if="excludedIds && excludedIds.length" class="att-line att-mt">
              <span class="att-muted">Exclus manuellement (UI) :</span>
              <span v-for="id in excludedIds" :key="id" class="att-name">{{ id }}</span>
            </div>
          </section>
        </div>

        <!-- ─────────── RENDU PRODUCTION (inchangé) ─────────── -->
        <div v-else class="att-body" role="log" aria-live="polite">
          <div class="att-line att-muted">▸ Prédiction · {{ targetLabel || 'évènement sélectionné' }}</div>

          <div v-if="loading" class="att-line att-muted">
            ▸ Scoring des évènements passés en cours…
          </div>

          <template v-else>
            <div class="att-line att-muted">▸ {{ scanSummary }}</div>

            <div v-for="l in lines" :key="l.id" class="att-line">
              <span class="att-ok">✓</span>
              <span class="att-name">{{ l.name }}</span>
              <span class="att-date">{{ l.date }}</span>
              <span class="att-dims">{{ l.dims }}</span>
              <span class="att-score">score {{ l.score }} · {{ l.pct }}%</span>
              <span class="att-weight">poids {{ l.weight }}%</span>
            </div>

            <div v-if="!lines.length" class="att-line att-warn">
              ▸ Aucun évènement passé comparable retenu (voir bandeau ci-dessus).
            </div>
            <div v-else class="att-line att-muted">
              ▸ Mélange pondéré des {{ lines.length }} meilleurs (poids = score ÷ Σ scores) → projection minute par minute
            </div>

            <div class="att-line att-muted">▸ Confiance : <span :class="confidenceClass">{{ confidenceLabel }}</span></div>
          </template>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<script>
// Libellés FR courts des dimensions du scoring (clés = breakdown de predictiveAnalytics.js).
const DIM_LABELS = {
  eventType: 'type',
  configuration: 'config',
  category: 'catégorie',
  subcategory: 'sous-cat',
  performer: 'artiste',
  visitingTeam: 'équipe',
  sponsor: 'sponsor',
  dayOfWeek: 'jour',
  showTime: 'horaire',
  attendance: 'affluence',
};

export default {
  name: 'AlgoTraceTerminal',
  props: {
    // Éléments scorés (top-N) : { event, score, scorePercentage, breakdown }.
    candidates: { type: Array, default: () => [] },
    // Ids des évènements réellement retenus pour le mélange (sinon top-10).
    selectedIds: { type: Array, default: () => [] },
    // Nombre d'évènements écartés (filtres catégorie/affluence/horaire).
    excludedCount: { type: Number, default: 0 },
    loading: { type: Boolean, default: false },
    lowConfidence: { type: Boolean, default: false },
    insufficient: { type: Boolean, default: false },
    // Libellé de l'évènement cible (nom [· type · cat · sous-cat]).
    targetLabel: { type: String, default: '' },
    // ── MODE DEBUG (lecture seule) ──
    debug: { type: Boolean, default: false },
    // { included, excluded, diagnostics } produit par findAndScorePastEventsWithTrace.
    predictionTrace: { type: Object, default: null },
    // { targetEventId, selection, timelineFetch[], usedFallback, ... }.
    timelineTrace: { type: Object, default: null },
    // Event cible brut (pour l'onglet Résumé).
    targetEvent: { type: Object, default: null },
    // Ids exclus manuellement dans l'UI (bandeau « exclus manuellement »).
    excludedIds: { type: Array, default: () => [] },
  },
  data() {
    return { open: false, activeTab: 'resume' };
  },
  computed: {
    visible() {
      // Déclencheur visible s'il y a un scoring, un calcul en cours, ou en debug.
      return this.debug || this.loading || (Array.isArray(this.candidates) && this.candidates.length > 0);
    },
    triggerLabel() {
      if (this.debug) return this.loading ? 'Mode debug · calcul…' : 'Mode debug · voir la trace';
      return this.loading ? 'Calcul de la prédiction…' : 'Voir le détail du calcul';
    },
    tabs() {
      return [
        { key: 'resume', label: 'Résumé' },
        { key: 'included', label: 'Candidats retenus' },
        { key: 'excluded', label: 'Évènements exclus' },
        { key: 'timeline', label: 'Timeline fetch' },
        { key: 'fallback', label: 'Fallback / sélection' },
      ];
    },
    // ── Production (inchangé) ──
    retained() {
      const cand = Array.isArray(this.candidates) ? this.candidates : [];
      const ids = Array.isArray(this.selectedIds) ? this.selectedIds : [];
      const picked = ids.length
        ? cand.filter((c) => ids.includes(c?.event?.id))
        : cand.slice(0, 10);
      return [...picked].sort((a, b) => (b?.score || 0) - (a?.score || 0));
    },
    sumScore() {
      return this.retained.reduce((s, c) => s + (Number(c?.score) || 0), 0) || 1;
    },
    lines() {
      return this.retained.map((c, i) => {
        const ev = c?.event || {};
        const bd = c?.breakdown || {};
        const dims = Object.keys(DIM_LABELS)
          .filter((k) => Number(bd[k]) > 0)
          .map((k) => `${DIM_LABELS[k]}+${Math.round(bd[k])}`)
          .join(' ');
        const score = Math.round(Number(c?.score) || 0);
        return {
          id: ev.id || `r${i}`,
          name: ev.eventName || ev.name || '—',
          date: ev.eventDate || '',
          dims: dims || '—',
          score,
          pct: Math.round(Number(c?.scorePercentage) || 0),
          weight: Math.round((score / this.sumScore) * 100),
        };
      });
    },
    scanSummary() {
      const scanned = Array.isArray(this.candidates) ? this.candidates.length : 0;
      const ex = Number(this.excludedCount) || 0;
      const retainedN = this.retained.length;
      return `${scanned} évènement(s) passé(s) scoré(s)` +
        (ex ? ` · ${ex} écarté(s) (catégorie ≠ / affluence > 40% / horaire)` : '') +
        ` · ${retainedN} retenu(s)`;
    },
    confidenceLabel() {
      if (this.insufficient) return 'insuffisante (aucun comparable)';
      return this.lowConfidence ? 'faible' : 'élevée';
    },
    confidenceClass() {
      if (this.insufficient) return 'att-warn';
      return this.lowConfidence ? 'att-warn' : 'att-ok';
    },
    // ── Debug ──
    included() {
      return (this.predictionTrace && Array.isArray(this.predictionTrace.included))
        ? this.predictionTrace.included : [];
    },
    excluded() {
      return (this.predictionTrace && Array.isArray(this.predictionTrace.excluded))
        ? this.predictionTrace.excluded : [];
    },
    diagnostics() {
      return (this.predictionTrace && this.predictionTrace.diagnostics) || {};
    },
    selection() {
      return this.timelineTrace ? this.timelineTrace.selection : null;
    },
    timelineFetch() {
      return (this.timelineTrace && Array.isArray(this.timelineTrace.timelineFetch))
        ? this.timelineTrace.timelineFetch : [];
    },
    lowConfIds() {
      return (this.timelineTrace && Array.isArray(this.timelineTrace.lowConfidenceBasedOnEventIds))
        ? this.timelineTrace.lowConfidenceBasedOnEventIds : [];
    },
    targetShowTime() {
      const s = this.targetEvent && this.targetEvent.sessions && this.targetEvent.sessions[0];
      return s ? s.showTime : null;
    },
    selectedIdSet() {
      return new Set(Array.isArray(this.selectedIds) ? this.selectedIds : []);
    },
    excludedIdSet() {
      return new Set(Array.isArray(this.excludedIds) ? this.excludedIds : []);
    },
    includedSumScore() {
      return this.included.reduce((s, c) => s + (Number(c?.score) || 0), 0) || 1;
    },
    includedRows() {
      return this.included.map((c, i) => {
        const ev = c?.event || {};
        const bd = c?.breakdown || {};
        const id = ev.id || `r${i}`;
        const dims = Object.keys(DIM_LABELS)
          .map((k) => `${DIM_LABELS[k]}: ${Math.round(Number(bd[k]) || 0)}`)
          .join('  ·  ');
        const score = Math.round(Number(c?.score) || 0);
        const selected = this.selectedIdSet.has(id) && !this.excludedIdSet.has(id);
        return {
          id,
          name: ev.eventName || ev.name || '—',
          date: ev.eventDate || '',
          score,
          maxScore: Math.round(Number(c?.maxPossibleScore) || 0),
          pct: Math.round(Number(c?.scorePercentage) || 0),
          scaling: (Number(c?.scalingFactor) || 1).toFixed(2),
          weight: Math.round((score / this.includedSumScore) * 100),
          selected,
          reason: c?.inclusionReason || '—',
          dims,
        };
      });
    },
    excludedRows() {
      return this.excluded.map((e, i) => {
        const ev = e?.event || {};
        const hasValues = e?.targetValue !== undefined || e?.pastValue !== undefined;
        return {
          id: ev.id || `e${i}`,
          name: ev.eventName || ev.name || '—',
          date: ev.eventDate || '',
          reason: e?.reason || '—',
          gate: e?.gate || '—',
          hasValues,
          targetValue: this.fmtVal(e?.targetValue),
          pastValue: this.fmtVal(e?.pastValue),
        };
      });
    },
  },
  methods: {
    tv(v) {
      return v === null || v === undefined || v === '' ? '—' : v;
    },
    fmtVal(v) {
      if (v === null || v === undefined || v === '') return '∅ (vide)';
      return String(v);
    },
    dbgFlag(key) {
      return this.timelineTrace ? String(!!this.timelineTrace[key]) : '—';
    },
  },
};
</script>

<style scoped>
/* Déclencheur discret + popup « terminal » (monospace) aux couleurs du site
   (tokens CSS, pas de thème étranger). cf. mémoire design-reference-keep-site-theme. */
.att-wrap {
  margin-top: 10px;
}
.att-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 999px;
  background: var(--muted, #f8fafc);
  color: var(--foreground, #0f172a);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.att-trigger:hover {
  border-color: var(--primary, #ff3131);
  color: var(--primary, #ff3131);
}
.att-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary, #ff3131);
  flex: 0 0 auto;
}

/* Popup */
.att-modal {
  background: var(--card, #ffffff);
  border-radius: 12px;
  overflow: hidden;
}
.att-modal-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.att-modal-title {
  font-weight: 700;
  font-size: 0.9rem;
  flex: 1 1 auto;
  color: var(--foreground, #0f172a);
}
.att-modal-close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: var(--muted-foreground, #64748b);
  padding: 4px;
}
.att-modal-close:hover { color: var(--primary, #ff3131); }

.att-body {
  padding: 12px 16px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.6;
  max-height: 60vh;
  overflow: auto;
}
.att-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  white-space: pre-wrap;
  color: var(--foreground, #0f172a);
}
.att-muted { color: var(--muted-foreground, #64748b); }
.att-ok { color: #16a34a; font-weight: 700; }
.att-warn { color: var(--primary, #ff3131); }
.att-name { font-weight: 600; }
.att-date { color: var(--muted-foreground, #64748b); }
.att-dims { color: var(--muted-foreground, #64748b); }
.att-score { color: var(--foreground, #0f172a); }
.att-weight { color: var(--primary, #ff3131); font-weight: 600; }
.att-gate { color: var(--primary, #ff3131); font-weight: 600; }

/* Debug : onglets */
.att-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding-bottom: 8px;
}
.att-tab {
  border: 1px solid var(--border, #e5e7eb);
  background: var(--muted, #f8fafc);
  color: var(--muted-foreground, #64748b);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
.att-tab-active {
  border-color: var(--primary, #ff3131);
  color: var(--primary, #ff3131);
  background: var(--card, #ffffff);
}
.att-tabpanel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.att-mt { margin-top: 10px; }
.att-kv {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.att-k {
  color: var(--muted-foreground, #64748b);
  min-width: 210px;
  flex: 0 0 auto;
}
.att-v { color: var(--foreground, #0f172a); font-weight: 600; word-break: break-all; }
.att-card {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  margin: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.att-card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: baseline;
}
.att-card-sub {
  font-size: 0.74rem;
  color: var(--foreground, #0f172a);
}
</style>
