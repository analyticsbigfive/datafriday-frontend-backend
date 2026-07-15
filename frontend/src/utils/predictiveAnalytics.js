// Predictive Analytics Utility — barème « NEW RULES »
// ---------------------------------------------------------------
// Prédit les ventes d'un event futur à partir d'events passés comparables
// (similarité pondérée + scaling d'affluence). Voir le contrat complet dans
// docs/ALGORITHME_PREDICTION_NEW_RULES.md (pipeline en 7 étapes).
//
// BARÈME CANONIQUE (une seule version fait foi — les barèmes antérieurs sont
// abandonnés) :
//   - Event Type:       100   (GATE — exact sinon écarté ; +100 si exact)
//   - Configuration:    100   (GATE — exact sinon écarté ; +100 si exact)
//   - Event Category:   100   (GATE — exact sinon écarté ; +100 si exact)
//   - Subcategory:      800   (800 si exact, 0 sinon — PAS un gate)
//   - Visiting Team:    800   (SPORT — 800 si exact, 0 sinon)
//   - Performer:        800   (CONCERT — 800 si exact, 0 sinon)
//   - Sponsor:          400   (MICE — 400 si exact, 0 sinon)
//   - Attendance:       200   (200 × (1 − écart) ; GATE si écart > 40%)
//   - Day of week:      500   (futur en semaine : 500 même jour / 250 autre
//                              jour de semaine / 0 si week-end)
//   - Weekend day:      500   (futur le week-end : 500 même jour / 250 autre
//                              jour de week-end / 0 si semaine)
//   - Show time:        400   (400 exact / 300 ≤1h / 100 ≤2h / 0 ≤3h ;
//                              GATE si > 3h, écart CIRCULAIRE pour gérer minuit)
//
// RÈGLES CLÉS « NEW RULES » :
//   - GATE = un seul échec → event écarté (jamais utilisé). Mais un critère
//     non renseigné des deux côtés ne déclenche PAS le gate (il est ignoré) :
//     indispensable pour des events partiellement classifiés (cf. §4 doc).
//   - Comparaisons de chaînes NORMALISÉES (trim + minuscule + sans accent)
//     pour ne pas écarter à tort « Top 14 » vs « top 14 ».
//   - Poids = score / Σ scores (plus de split 70/30).
//   - Prédiction = Σ (valeur_scalée × poids), SANS renormalisation par
//     couverture (formule pure §7).
//   - Aucun event comparable → AUCUNE prédiction fabriquée (insufficientData) ;
//     plus de repli aléatoire (déterminisme).

// ---------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------

import { parseEventDate as parseDDMMYYYY } from './dateFr.js';

/** Convert "HH:MM" to minutes since midnight. */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Écart CIRCULAIRE en minutes entre deux horaires (modulo 1440), pour qu'un
 * event à 23:30 et un à 00:15 soient à 45 min l'un de l'autre, pas 1395.
 */
function circularTimeDiff(aMin, bMin) {
  let d = Math.abs(aMin - bMin) % 1440;
  if (d > 720) d = 1440 - d;
  return d;
}

/** Friday (5) and Saturday (6) count as the weekend bucket. */
function isWeekend(dayOfWeek) {
  return dayOfWeek === 5 || dayOfWeek === 6;
}

/**
 * Normalise un libellé pour comparaison : trim + minuscule + sans accent.
 * Renvoie '' pour null/undefined.
 * Exporté pour que la réconciliation EventPredict (matching de noms) réutilise
 * EXACTEMENT la même normalisation que l'algo — ne pas en réécrire de variante.
 */
export function normalizeStr(v) {
  if (v == null) return '';
  // Objet relation (event NestJS non aplati : eventType/category/subcategory/
  // visitingTeam = { id, name, ... }) → on compare son `name`. Sans ça,
  // String(objet) = "[object Object]" ≠ "sport" → le GATE eventType excluait
  // TOUS les events passés comparables (prédiction réduite aux events sans type).
  if (typeof v === 'object') v = v.name ?? '';
  if (v == null) return '';
  return String(v)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/** Égalité de libellés normalisés (les DEUX valeurs doivent être non vides). */
function eqNorm(a, b) {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  return na !== '' && nb !== '' && na === nb;
}

// ---------------------------------------------------------------
// Weights
// ---------------------------------------------------------------

export const WEIGHTS = Object.freeze({
  eventType: 100,
  configuration: 100,
  category: 100,
  subcategory: 800,
  visitingTeam: 800,
  performer: 800,
  sponsor: 400,
  attendance: 200,
  dayOfWeek: 500,
  showTime: 400,
});

// ---------------------------------------------------------------
// Similarity scoring
// ---------------------------------------------------------------

/**
 * Libellés FR des 5 gates durs, pour le mode debug (traçabilité des
 * exclusions). Clés = valeurs de `trace.gate.gate` posées par
 * evaluateSimilarity. LECTURE SEULE — n'influence pas le scoring.
 */
export const GATE_LABELS = Object.freeze({
  eventType: "Type d'évènement différent",
  configuration: 'Configuration différente',
  category: 'Catégorie différente',
  showTime: "Écart d'horaire supérieur à 3h",
  attendance: 'Affluence hors de ±40%',
  adhoc: 'Évènement ad hoc (exclu des comparables automatiques)',
});

/**
 * Détecte un évènement « ad hoc » (ex. « Transactions Adhoc »). Le modèle de
 * données ne porte AUCUN flag structurel (pas de colonne isAdhoc, eventTypeId
 * incohérent : Sport / Entertainment / null selon les occurrences) — le seul
 * marqueur fiable est le nom. Ces events sont écartés du scoring automatique
 * mais restent sélectionnables à la main dans le drawer.
 */
const ADHOC_NAME_RE = /ad[\s_-]?hoc/i;
export function isAdhocEvent(event) {
  if (!event) return false;
  return ADHOC_NAME_RE.test(String(event.eventName || event.name || ''));
}

/**
 * Cœur du scoring. Identique à l'ancien `calculateSimilarity`, plus un
 * collecteur `trace` OPTIONNEL : quand fourni, le gate qui écarte l'event est
 * enregistré dans `trace.gate` ({ gate, targetValue, pastValue }) avant le
 * `return null`. Sans `trace` (production), comportement inchangé au bit près.
 *
 * @param {object} target - Future event being predicted.
 * @param {object} past   - Candidate past event.
 * @param {object|null} [trace] - Sink debug optionnel (mutation seule).
 * @returns {object|null} ScoredEvent or null if disqualified.
 */
function evaluateSimilarity(target, past, trace) {
  let score = 0;
  let scalingFactor = 1.0;

  const breakdown = {
    eventType: 0,
    configuration: 0,
    category: 0,
    subcategory: 0,
    visitingTeam: 0,
    sponsor: 0,
    performer: 0,
    attendance: 0,
    dayOfWeek: 0,
    showTime: 0,
  };

  // ---- GATES (élimination dure) ----
  // Règle NEW RULES : un gate écarte l'event UNIQUEMENT si les deux côtés sont
  // renseignés ET diffèrent. Un critère manquant d'un côté est ignoré (ni
  // points, ni exclusion) — sinon des events passés partiellement classifiés
  // (sans type/config/catégorie) seraient tous écartés à tort. Comparaison
  // normalisée (eqNorm : trim + minuscule + sans accent).

  // 1. Event Type — GATE
  if (target.eventType && past.eventType) {
    if (eqNorm(target.eventType, past.eventType)) {
      score += WEIGHTS.eventType;
      breakdown.eventType = WEIGHTS.eventType;
    } else {
      if (trace) {
        trace.gate = {
          gate: 'eventType',
          targetValue: normalizeStr(target.eventType),
          pastValue: normalizeStr(past.eventType),
        };
      }
      return null;
    }
  }

  // 2. Configuration — GATE (même implantation de PdV = seuls comparables)
  if (target.configurationId && past.configurationId) {
    if (eqNorm(target.configurationId, past.configurationId)) {
      score += WEIGHTS.configuration;
      breakdown.configuration = WEIGHTS.configuration;
    } else {
      if (trace) {
        trace.gate = {
          gate: 'configuration',
          targetValue: normalizeStr(target.configurationId),
          pastValue: normalizeStr(past.configurationId),
        };
      }
      return null;
    }
  }

  // 3. Event Category — GATE
  if (target.category && past.category) {
    if (eqNorm(target.category, past.category)) {
      score += WEIGHTS.category;
      breakdown.category = WEIGHTS.category;
    } else {
      if (trace) {
        trace.gate = {
          gate: 'category',
          targetValue: normalizeStr(target.category),
          pastValue: normalizeStr(past.category),
        };
      }
      return null;
    }
  }

  // ---- CRITÈRES DE SCORING (pas de gate : pas de match → 0 point) ----

  // 4. Subcategory — 800 si exact, 0 sinon
  if (eqNorm(target.subcategory, past.subcategory)) {
    score += WEIGHTS.subcategory;
    breakdown.subcategory = WEIGHTS.subcategory;
  }

  // 5. Performer (concerts) — 800 si exact
  if (target.performerName && eqNorm(target.performerName, past.performerName)) {
    score += WEIGHTS.performer;
    breakdown.performer = WEIGHTS.performer;
  }

  // 6. Visiting Team (sport) — 800 si exact.
  // N'utilise que visitingTeamId / visitingTeam ; PAS de fallback sur `team`
  // (équipe DOMICILE) qui ferait scorer +800 tous les matchs à domicile.
  const targetTeam = target.visitingTeamId || target.visitingTeam || null;
  if (targetTeam) {
    const pastTeam = past.visitingTeamId || past.visitingTeam || null;
    if (eqNorm(targetTeam, pastTeam)) {
      score += WEIGHTS.visitingTeam;
      breakdown.visitingTeam = WEIGHTS.visitingTeam;
    }
  }

  // 7. Sponsor (MICE) — 400 si exact
  if (target.sponsorName && eqNorm(target.sponsorName, past.sponsorName)) {
    score += WEIGHTS.sponsor;
    breakdown.sponsor = WEIGHTS.sponsor;
  }

  // 7. Day of Week / Weekend logic
  const targetDate = parseDDMMYYYY(target.eventDate);
  const pastDate = parseDDMMYYYY(past.eventDate);

  if (targetDate && pastDate) {
    const targetDay = targetDate.getDay();
    const pastDay = pastDate.getDay();
    const targetIsWeekend = isWeekend(targetDay);
    const pastIsWeekend = isWeekend(pastDay);

    if (targetIsWeekend) {
      if (pastIsWeekend) {
        if (targetDay === pastDay) {
          score += WEIGHTS.dayOfWeek;
          breakdown.dayOfWeek = WEIGHTS.dayOfWeek;
        } else {
          score += 250;
          breakdown.dayOfWeek = 250;
        }
      }
      // else: weekday past vs weekend target → 0
    } else if (!pastIsWeekend) {
      if (targetDay === pastDay) {
        score += WEIGHTS.dayOfWeek;
        breakdown.dayOfWeek = WEIGHTS.dayOfWeek;
      } else {
        score += 250;
        breakdown.dayOfWeek = 250;
      }
    }
    // else: weekend past vs weekday target → 0
  }

  // 8. Show Time (exclude > 3h difference)
  // Si l'un ou l'autre event n'a pas d'horaire, on saute le scoring showTime
  // (pas d'exclusion non plus) plutôt que d'utiliser '19:00' comme défaut —
  // ce défaut faisait faussement scorer +400 à tous les events sans horaire.
  const targetTime = target.sessions?.[0]?.showTime || null;
  const pastTime = past.sessions?.[0]?.showTime || null;

  if (targetTime && pastTime) {
    // Écart CIRCULAIRE (modulo 1440) : gère les events à cheval sur minuit.
    const diffMinutes = circularTimeDiff(
      parseTimeToMinutes(targetTime),
      parseTimeToMinutes(pastTime),
    );
    if (diffMinutes > 180) {
      if (trace) {
        trace.gate = {
          gate: 'showTime',
          targetValue: targetTime,
          pastValue: pastTime,
        };
      }
      return null; // GATE > 3h
    }

    if (diffMinutes === 0) {
      score += WEIGHTS.showTime;
      breakdown.showTime = WEIGHTS.showTime;
    } else if (diffMinutes <= 60) {
      score += 300;
      breakdown.showTime = 300;
    } else if (diffMinutes <= 120) {
      score += 100;
      breakdown.showTime = 100;
    }
    // 121–180: inclus avec 0 pts
  }

  // 9. Attendance similarity — spec: exclude if past outside ±40% of target.
  // Proportional score within window (ex: 15 % écart => 170/200).
  // scanned d'abord (fréquentation réelle), fallback sold — MÊME résolution que
  // la timeline (usePredictiveTimeline), sinon deux ratios d'affluence divergents.
  const tTickets = target.ticketsScanned || target.ticketsSold || 0;
  const pTickets = past.ticketsScanned || past.ticketsSold || 0;

  if (tTickets > 0 && pTickets > 0) {
    if (pTickets < 0.6 * tTickets || pTickets > 1.4 * tTickets) {
      if (trace) {
        trace.gate = {
          gate: 'attendance',
          targetValue: tTickets,
          pastValue: pTickets,
        };
      }
      return null;
    }

    const diffPercent = Math.abs(tTickets - pTickets) / tTickets;
    const similarityScore = Math.max(
      0,
      Math.round((1 - diffPercent) * WEIGHTS.attendance),
    );
    score += similarityScore;
    breakdown.attendance = similarityScore;

    // Scale future <- past based on attendance ratio
    scalingFactor = tTickets / pTickets;
  }

  // Max-possible score = sum of weights that *could* apply
  let maxPossible =
    WEIGHTS.eventType +
    WEIGHTS.category +
    WEIGHTS.subcategory +
    WEIGHTS.attendance +
    WEIGHTS.dayOfWeek;
  // configuration uniquement si les deux events en ont une (hard filter passé)
  if (target.configurationId && past.configurationId) maxPossible += WEIGHTS.configuration;
  // showTime uniquement si les deux events ont un horaire
  if (targetTime && pastTime) maxPossible += WEIGHTS.showTime;
  if (targetTeam) maxPossible += WEIGHTS.visitingTeam;
  if (target.sponsorName) maxPossible += WEIGHTS.sponsor;
  if (target.performerName) maxPossible += WEIGHTS.performer;

  return {
    event: past,
    score,
    maxPossibleScore: maxPossible,
    scorePercentage: maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 0,
    scalingFactor,
    breakdown,
  };
}

/**
 * Score a past event against a future target. Returns null when the past
 * event must be excluded (hard filter / out-of-range).
 *
 * Délègue à evaluateSimilarity SANS collecteur trace → sortie identique à
 * l'historique (null sur gate, objet sinon). NE PAS ajouter de logique ici :
 * le cœur du barème vit dans evaluateSimilarity (source unique, pas de drift
 * avec le mode debug).
 *
 * @param {object} target - Future event being predicted.
 * @param {object} past   - Candidate past event.
 * @returns {object|null} ScoredEvent or null if disqualified.
 */
export function calculateSimilarity(target, past) {
  return evaluateSimilarity(target, past, null);
}

/**
 * Ordre TOTAL déterministe des events scorés : score desc, puis date d'event
 * desc (le plus récent d'abord), puis id asc. Sans départage, le tri « score
 * seul » (stable) laissait les ex æquo dans l'ordre d'arrivée de l'API → la
 * coupe top-10 pouvait retenir des events différents d'une session à l'autre
 * (prédiction non reproductible à entrées identiques).
 */
function compareScoredEvents(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const da = parseDDMMYYYY(a.event?.eventDate)?.getTime() || 0;
  const db = parseDDMMYYYY(b.event?.eventDate)?.getTime() || 0;
  if (db !== da) return db - da;
  return String(a.event?.id || '').localeCompare(String(b.event?.id || ''));
}

/**
 * Score every past event with actual sales data against the target event.
 * Returns scored events sorted by descending score.
 */
export function findAndScorePastEvents(targetEvent, allEvents, shopGranularData, options = {}) {
  // Events ad hoc exclus des candidats automatiques ; `allowIds` (sélection
  // manuelle du drawer) les réadmet au cas par cas.
  const allowIds = options.allowIds instanceof Set ? options.allowIds : null;
  const eventsWithDataIds = new Set(
    (shopGranularData || []).filter((d) => !d.isPredictive).map((d) => d.eventId),
  );

  const validPastEvents = (allEvents || []).filter(
    (e) =>
      e.id !== targetEvent.id &&
      eventsWithDataIds.has(e.id) &&
      (!isAdhocEvent(e) || (allowIds && allowIds.has(e.id))),
  );

  const scored = [];
  for (const past of validPastEvents) {
    const r = calculateSimilarity(targetEvent, past);
    if (r !== null) scored.push(r);
  }

  scored.sort(compareScoredEvents);
  return scored;
}

/**
 * Variante DEBUG de findAndScorePastEvents : déterministe, lecture seule.
 * Rejoue EXACTEMENT le même barème (via evaluateSimilarity, source unique) mais
 * expose, en plus des events retenus, la raison d'exclusion de chaque event
 * écarté + des diagnostics de dataset. Le tableau `included` (une fois
 * `inclusionReason` retiré) est identique — mêmes scores, même ordre — à la
 * sortie de findAndScorePastEvents (garanti par le test d'équivalence).
 *
 * N'est appelée que lorsque le mode debug est actif (coût nul en production).
 *
 * @param {object}   targetEvent
 * @param {object[]} allEvents
 * @param {object[]} shopGranularData - Actual records (non-predictive).
 * @returns {{ included: object[], excluded: object[], diagnostics: object }}
 */
export function findAndScorePastEventsWithTrace(targetEvent, allEvents, shopGranularData) {
  const events = allEvents || [];
  const granular = shopGranularData || [];
  const eventsWithDataIds = new Set(
    granular.filter((d) => !d.isPredictive).map((d) => d.eventId),
  );
  const eventIds = new Set(events.map((e) => e.id));
  const targetDate = parseDDMMYYYY(targetEvent?.eventDate);

  const included = [];
  const excluded = [];

  for (const e of events) {
    // Gate 8 : l'event cible lui-même.
    if (e.id === targetEvent.id) {
      excluded.push({ event: e, reason: "Évènement cible (exclu de ses propres comparables)", gate: 'self' });
      continue;
    }
    // Gate ad hoc : jamais candidat automatique (sélection manuelle possible).
    if (isAdhocEvent(e)) {
      excluded.push({ event: e, reason: GATE_LABELS.adhoc, gate: 'adhoc' });
      continue;
    }
    // Gates 1 + 9 (+ 7) : pas de ventes réelles rattachées à cet event.
    // Un event postérieur à la cible n'a par nature pas de ventes → même bucket,
    // annoté `future` pour distinguer le cas « évènement futur ».
    if (!eventsWithDataIds.has(e.id)) {
      const pastDate = parseDDMMYYYY(e.eventDate);
      const future = !!(targetDate && pastDate && pastDate.getTime() > targetDate.getTime());
      excluded.push({
        event: e,
        reason: future
          ? "Évènement postérieur à la cible (aucune vente)"
          : "Pas de données de vente pour cet évènement",
        gate: 'salesData',
        future,
      });
      continue;
    }
    // Gates 2–6 : barème dur (via le même cœur que la production).
    const trace = {};
    const r = evaluateSimilarity(targetEvent, e, trace);
    if (r === null) {
      const g = trace.gate || { gate: 'unknown' };
      excluded.push({
        event: e,
        reason: GATE_LABELS[g.gate] || 'Exclu par un filtre',
        gate: g.gate,
        targetValue: g.targetValue,
        pastValue: g.pastValue,
      });
    } else {
      included.push({ ...r, inclusionReason: 'Gates passés · ventes présentes' });
    }
  }

  included.sort(compareScoredEvents);

  const diagnostics = {
    totalEvents: events.length,
    validPastEvents: included.length,
    eventsWithSalesData: eventsWithDataIds.size,
    granularRecords: granular.length,
    eventIdOverlap: [...eventsWithDataIds].filter((id) => eventIds.has(id)).length,
  };

  return { included, excluded, diagnostics };
}

// ---------------------------------------------------------------
// Prediction generation
// ---------------------------------------------------------------

/**
 * Generate predictive shop/menu-item records for a single future event.
 *
 * @param {object}   targetEvent
 * @param {object[]} pastEvents
 * @param {object[]} shopGranularData - Actual records (non-predictive).
 * @param {string[]} [forcedPastEventIds] - When provided, bypasses scoring
 *                   and forces the prediction to use exactly those past events
 *                   (still uses computed scaling/weights when possible).
 */
export function generatePredictionsForEvent(
  targetEvent,
  pastEvents,
  shopGranularData,
  forcedPastEventIds = null,
) {
  // 1. Score past events. Une sélection manuelle (forcedPastEventIds) peut
  // réadmettre des events ad hoc, sinon exclus du scoring automatique.
  const forced =
    Array.isArray(forcedPastEventIds) && forcedPastEventIds.length > 0
      ? new Set(forcedPastEventIds)
      : null;
  let scoredEvents = findAndScorePastEvents(targetEvent, pastEvents, shopGranularData, {
    allowIds: forced,
  });

  // Optional override: only keep selected past events
  if (forced) {
    scoredEvents = scoredEvents.filter((s) => forced.has(s.event.id));
  }

  // 2. Top 10 (max). NEW RULES : aucun event comparable → AUCUNE prédiction
  // fabriquée (insufficientData). Plus de repli aléatoire (déterminisme).
  const topMatches = scoredEvents.slice(0, 10);
  if (topMatches.length === 0) return [];

  // 3. Poids = score / Σ scores (formule §7, plus de split 70/30).
  const totalScore = topMatches.reduce((s, m) => s + m.score, 0);
  // Garde-fou division par zéro : un survivant a toujours score > 0 dès qu'au
  // moins un critère renseigné matche. Si tous à 0 (données trop pauvres), on
  // ne fabrique rien.
  if (totalScore === 0) return [];

  const matchWeights = topMatches.map((m) => ({ ...m, weight: m.score / totalScore }));

  const confidenceScore = Math.round(
    topMatches.reduce((s, m) => s + m.scorePercentage, 0) / topMatches.length,
  );
  const isLowConfidence = false;

  // 4. Aggregate per (shop × element × menuItem) using weighted average + scaling
  const matchedEventIds = new Set(topMatches.map((m) => m.event.id));
  const relevantData = shopGranularData.filter((d) => matchedEventIds.has(d.eventId));
  if (relevantData.length === 0) return [];

  // Index records by event+key for O(1) lookup
  const recordIndex = new Map(); // `${eventId}::${key}` -> record
  const uniqueItems = new Set();
  for (const r of relevantData) {
    const key = `${r.shopName}-${r.elementName}-${r.menuItemId}`;
    uniqueItems.add(key);
    recordIndex.set(`${r.eventId}::${key}`, r);
  }

  const predictions = [];

  uniqueItems.forEach((key) => {
    let qtySum = 0;
    let revSum = 0;
    let baseRecord = null;

    // Formule pure §7 : unités_prédites = Σ_event (unités_scalées × poids).
    // PAS de renormalisation par couverture (NEW RULES) : un item présent dans
    // une fraction des events passés pèse à proportion de cette présence.
    for (const m of matchWeights) {
      const itemData = recordIndex.get(`${m.event.id}::${key}`);
      if (itemData) {
        if (!baseRecord) baseRecord = itemData;
        qtySum += itemData.quantity * m.scalingFactor * m.weight;
        revSum += itemData.revenue * m.scalingFactor * m.weight;
      }
    }

    if (baseRecord && (qtySum > 0 || revSum > 0)) {
      predictions.push({
        ...baseRecord,
        eventId: targetEvent.id,
        eventName: targetEvent.eventName,
        eventDate: targetEvent.eventDate,
        quantity: Math.round(qtySum),
        revenue: Math.round(revSum),
        transactionCount: 0,
        isPredictive: true,
        confidenceScore,
        isLowConfidence,
        basedOnEventIds: topMatches.map((m) => m.event.id),
      });
    }
  });

  return predictions;
}

/**
 * Generate predictions for every future event in the dataset.
 */
export function generatePredictionsForAllFutureEvents(allEvents, shopGranularData) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventsWithData = new Set(
    (shopGranularData || []).filter((d) => !d.isPredictive).map((d) => d.eventId),
  );

  const futureEvents = [];
  const pastEvents = [];

  for (const event of allEvents || []) {
    const d = parseDDMMYYYY(event.eventDate);
    if (!d) continue;
    d.setHours(0, 0, 0, 0);

    if (d.getTime() > today.getTime()) {
      futureEvents.push(event);
    } else if (d.getTime() === today.getTime()) {
      // Today's event: only predictive if it has no actual data yet
      if (!eventsWithData.has(event.id)) futureEvents.push(event);
      else pastEvents.push(event);
    } else {
      pastEvents.push(event);
    }
  }

  const pastEventIds = new Set(pastEvents.map((e) => e.id));
  const pastData = (shopGranularData || []).filter(
    (d) => pastEventIds.has(d.eventId) && !d.isPredictive,
  );

  if (futureEvents.length === 0 || pastEvents.length === 0 || pastData.length === 0) {
    return [];
  }

  const all = [];
  for (const fe of futureEvents) {
    const preds = generatePredictionsForEvent(fe, pastEvents, pastData);
    if (preds.length) all.push(...preds);
  }
  return all;
}

// Backwards-compat alias for any consumer still calling the legacy name.
export const findSimilarPastEvents = findAndScorePastEvents;
