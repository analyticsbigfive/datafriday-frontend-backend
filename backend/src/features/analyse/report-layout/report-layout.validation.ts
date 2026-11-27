import { BadRequestException } from '@nestjs/common';
import {
  ARRAY_FILTER_KEYS, CHIP_KEYS, CONFIGURATION_KEY, GRID_COLS, GRID_ROWS, MAX_LAYOUT_BYTES, MAX_PAGES, MAX_SLOTS,
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

/** `options.items` d'une barre KPI : liste de pastilles connues séparées par des virgules. */
function validateChipItems(kind: string, options: unknown, at: string): void {
  const known = CHIP_KEYS[kind];
  const items = (options as Record<string, unknown> | undefined)?.items;
  if (items === undefined || items === null) return;
  if (!known) fail(`${at}.options.items n'est pas autorisée pour "${kind}".`);
  const keys = typeof items === 'string' ? items.split(',').filter(Boolean) : null;
  if (!keys || keys.some((k) => !known.includes(k))) {
    fail(`${at}.options.items doit lister des pastilles connues (${known.join(', ')}), séparées par des virgules.`);
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
  validateChipItems(s.kind, s.options, at);
  if (typeof s.label !== 'string' || s.label.length > MAX_LABEL) fail(`${at}.label doit être une chaîne de ${MAX_LABEL} caractères maximum.`);
  if (typeof s.addedAt !== 'string' || Number.isNaN(Date.parse(s.addedAt))) fail(`${at}.addedAt doit être une date ISO.`);
  if (typeof s.addedBy !== 'string') fail(`${at}.addedBy doit être une chaîne.`);

  return { col: s.col, row: s.row, w: size.w, h: size.h };
}

/** Valide les slots d'UNE page : pas de chevauchement, ids uniques sur tout le document (`ids`). */
function validatePageSlots(slots: unknown, ids: Set<string>, at: string): void {
  if (!Array.isArray(slots)) return fail(`${at}.slots doit être un tableau.`);
  if (slots.length > MAX_SLOTS) fail(`${at}.slots : ${MAX_SLOTS} éléments maximum.`);

  const taken = new Map<string, number>();
  slots.forEach((slot: any, i: number) => {
    const { col, row, w, h } = validateSlot(slot, i);
    if (ids.has(slot.id)) fail(`${at}.slots[${i}].id en double : "${slot.id}".`);
    ids.add(slot.id);
    for (let c = col; c < col + w; c++) {
      for (let r = row; r < row + h; r++) {
        const key = `${c}:${r}`;
        if (taken.has(key)) fail(`${at}.slots[${i}] chevauche slots[${taken.get(key)}] (case colonne ${c}, rangée ${r}).`);
        taken.set(key, i);
      }
    }
  });
}

/**
 * Valide un document de mise en page `j1-page2` ; lève BadRequestException au premier défaut.
 * v1 : { version: 1, slots } (une page). v2 : { version: 2, pages: [{ slots }] } (1 à MAX_PAGES).
 */
export function validateJ1Page2Layout(layout: unknown): void {
  if (!isPlainObject(layout)) fail('layout doit être un objet.');
  const l = layout as Record<string, any>;
  if (l.version !== 1 && l.version !== 2) fail('layout.version doit valoir 1 ou 2.');
  if (Buffer.byteLength(JSON.stringify(layout), 'utf8') > MAX_LAYOUT_BYTES) fail('layout trop volumineux (64 Ko maximum).');

  const ids = new Set<string>();
  if (l.version === 1) {
    validatePageSlots(l.slots, ids, 'layout');
    return;
  }
  if (!Array.isArray(l.pages) || l.pages.length < 1 || l.pages.length > MAX_PAGES) {
    fail(`layout.pages doit contenir de 1 à ${MAX_PAGES} pages.`);
  }
  l.pages.forEach((page: unknown, i: number) => {
    if (!isPlainObject(page)) fail(`pages[${i}] doit être un objet.`);
    validatePageSlots((page as Record<string, unknown>).slots, ids, `pages[${i}]`);
  });
}

export function validateLayoutForKind(kind: string, layout: unknown): void {
  assertKnownKind(kind);
  if (kind === 'j1-page2') validateJ1Page2Layout(layout);
}
