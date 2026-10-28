import { BadRequestException } from '@nestjs/common';
import {
  ARRAY_FILTER_KEYS, CONFIGURATION_KEY, GRID_COLS, GRID_ROWS, MAX_LAYOUT_BYTES, MAX_SLOTS,
  REPORT_LAYOUT_KINDS, SLOT_SIZES, SLOT_VARIANTS, TIME_RANGE_KEY,
} from './report-layout.catalog';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_LABEL = 120;
const MAX_ID = 200;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

export function assertKnownKind(kind: string): void {
  if (!(REPORT_LAYOUT_KINDS as readonly string[]).includes(kind)) {
    fail(`Type de mise en page inconnu : "${kind}". Types acceptés : ${REPORT_LAYOUT_KINDS.join(', ')}.`);
  }
}

function validateFilters(filters: unknown, at: string): void {
  if (!isPlainObject(filters)) fail(`${at}.filters doit être un objet.`);
  const allowed = new Set<string>([...ARRAY_FILTER_KEYS, TIME_RANGE_KEY, CONFIGURATION_KEY]);
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (!allowed.has(key)) fail(`${at}.filters : clé non autorisée "${key}".`);
    if (key === TIME_RANGE_KEY) {
      if (value === null) continue;
      const r = value as any;
      const ok = isPlainObject(r) && typeof r.start === 'string' && typeof r.end === 'string'
        && HH_MM.test(r.start) && HH_MM.test(r.end);
      if (!ok) fail(`${at}.filters.${key} doit être null ou { start, end } au format HH:MM.`);
    } else if (key === CONFIGURATION_KEY) {
      if (value !== null && typeof value !== 'string') fail(`${at}.filters.${key} doit être une chaîne ou null.`);
    } else if (!Array.isArray(value) || value.some((x) => typeof x !== 'string')) {
      fail(`${at}.filters.${key} doit être un tableau de chaînes.`);
    }
  }
}

function validateOptions(options: unknown, at: string): void {
  if (!isPlainObject(options)) fail(`${at}.options doit être un objet.`);
  for (const [key, value] of Object.entries(options as Record<string, unknown>)) {
    const flat = value === null || ['string', 'number', 'boolean'].includes(typeof value);
    if (!flat) fail(`${at}.options.${key} doit être une valeur simple (chaîne, nombre, booléen ou null).`);
  }
}

function validateSlot(slot: unknown, index: number): { col: number; row: number; w: number; h: number } {
  const at = `slots[${index}]`;
  if (!isPlainObject(slot)) return fail(`${at} doit être un objet.`);
  const s = slot as Record<string, any>;

  if (typeof s.id !== 'string' || !s.id || s.id.length > MAX_ID) fail(`${at}.id doit être une chaîne non vide.`);
  const size = typeof s.kind === 'string' ? SLOT_SIZES[s.kind] : undefined;
  if (!size) return fail(`${at}.kind inconnu : "${String(s.kind)}".`);

  const variants = SLOT_VARIANTS[s.kind];
  if (variants) {
    if (typeof s.variant !== 'string' || !variants.includes(s.variant)) {
      fail(`${at}.variant invalide pour "${s.kind}" (attendu : ${variants.join(', ')}).`);
    }
  } else if (s.variant !== undefined && s.variant !== null) {
    fail(`${at}.variant n'est pas autorisée pour "${s.kind}".`);
  }

  if (!Number.isInteger(s.col) || s.col < 0 || s.col >= GRID_COLS) fail(`${at}.col doit valoir 0 ou 1.`);
  if (!Number.isInteger(s.row) || s.row < 0 || s.row >= GRID_ROWS) fail(`${at}.row doit valoir 0, 1 ou 2.`);
  if (s.col + size.w > GRID_COLS || s.row + size.h > GRID_ROWS) {
    fail(`${at} sort de la grille ${GRID_COLS}x${GRID_ROWS} (${s.kind} occupe ${size.w}x${size.h}).`);
  }

  validateFilters(s.filters, at);
  validateOptions(s.options ?? {}, at);
  if (typeof s.label !== 'string' || s.label.length > MAX_LABEL) fail(`${at}.label doit être une chaîne de ${MAX_LABEL} caractères maximum.`);
  if (typeof s.addedAt !== 'string' || Number.isNaN(Date.parse(s.addedAt))) fail(`${at}.addedAt doit être une date ISO.`);
  if (typeof s.addedBy !== 'string') fail(`${at}.addedBy doit être une chaîne.`);

  return { col: s.col, row: s.row, w: size.w, h: size.h };
}

/** Valide un document de mise en page `j1-page2` ; lève BadRequestException au premier défaut. */
export function validateJ1Page2Layout(layout: unknown): void {
  if (!isPlainObject(layout)) fail('layout doit être un objet.');
  const l = layout as Record<string, any>;
  if (l.version !== 1) fail('layout.version doit valoir 1.');
  if (!Array.isArray(l.slots)) return fail('layout.slots doit être un tableau.');
  if (l.slots.length > MAX_SLOTS) fail(`layout.slots : ${MAX_SLOTS} éléments maximum.`);
  if (Buffer.byteLength(JSON.stringify(layout), 'utf8') > MAX_LAYOUT_BYTES) fail('layout trop volumineux (64 Ko maximum).');

  const taken = new Map<string, number>();
  const ids = new Set<string>();
  l.slots.forEach((slot: any, i: number) => {
    const { col, row, w, h } = validateSlot(slot, i);
    if (ids.has(slot.id)) fail(`slots[${i}].id en double : "${slot.id}".`);
    ids.add(slot.id);
    for (let c = col; c < col + w; c++) {
      for (let r = row; r < row + h; r++) {
        const key = `${c}:${r}`;
        if (taken.has(key)) fail(`slots[${i}] chevauche slots[${taken.get(key)}] (case colonne ${c}, rangée ${r}).`);
        taken.set(key, i);
      }
    }
  });
}

export function validateLayoutForKind(kind: string, layout: unknown): void {
  assertKnownKind(kind);
  if (kind === 'j1-page2') validateJ1Page2Layout(layout);
}
