/** Types du flux Pre-event Inventory (PreEventInventoryFlowService et son cron). */

/** Événement tel que lu pour le flux (sélection minimale, partagée cron/service). */
export interface FlowEvent {
  id: string;
  tenantId: string;
  spaceId: string;
  name: string | null;
  eventDate: Date;
  eventStartDate: Date | null;
  eventEndDate?: Date | null;
  eventEndTime?: string | null;
  /** `Event.sessions` brut : porte l'heure d'ouverture des portes (`doorsOpening`). */
  sessions?: unknown;
  /** Fuseau du space (`Space.timezone`), dans lequel `doorsOpening` est saisi. */
  timezone: string;
}

export type PreEventRegenerateTrigger =
  | 'pdv-complete'
  | 'doors-open'
  | 'post-doors-open-edit'
  | 'phase-stop'
  | 'count'
  | 'manual';

export interface PreEventRegenerateResult {
  ok: boolean;
  reason?: string;
  reconciliationId?: string;
  lineCount?: number;
  /** Document créé (expurgé selon `canSeeExpected`), pour l'appel manuel. */
  document?: unknown;
  /** Résultat du push vers Logistic archivé sur la feuille (meta.logisticPush). */
  logisticPush?: { ok: boolean; reason: string | null; lineCount: number } | null;
}

export type PreEventWindowPhase = 'no-doors-open' | 'before' | 'editing' | 'locked';

/** État de la fenêtre d'édition pre-event, exposé au front (instants UTC). */
export interface PreEventWindowState {
  phase: PreEventWindowPhase;
  doorsOpenAt: Date | null;
  editDeadline: Date | null;
  doorsOpenDone: boolean;
}
