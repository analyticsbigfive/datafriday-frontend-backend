// ⚠️ Façade rétrocompatible — le contenu canonique vit désormais dans
// `src/utils/timelineBucketing.js` (source unique pour TOUTES les timelines).
//
// On conserve ce fichier comme alias afin de ne pas casser les imports
// existants (`EventPredictView`, tests unitaires). Préférez importer depuis
// `timelineBucketing` dans tout nouveau code.

export {
  TIMELINE_BUCKET_STRATEGIES,
  parseMinuteToken,
  formatMinute,
  bucketMinute,
  isMinuteInRange,
  hasActiveRange,
  preprocessTimelineRecords,
  aggregateTimeline,
  aggregateTimelinePerMinute,
  buildTimelineFilter,
  computeWindowRatios,
  windowPredictedRecords,
} from './timelineBucketing'
