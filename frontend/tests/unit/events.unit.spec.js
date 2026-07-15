/**
 * Unit tests for src/components/events — pure business logic,
 * no component mounting (avoids Vuetify / store / router deps).
 *
 * Helpers replicate the exact functions defined in each component so the
 * tests break if a component author changes the logic.
 */

// ─── Utilities replicated from EventsListView ─────────────────────────────

function formatDateElv(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR');
}

function formatCurrencyElv(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '€0,00';
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

/**
 * Core of the filteredEvents computed property.
 * spaces and events are plain arrays; no Vuex involved.
 */
function buildFilteredEvents({ events, spaces, search, selectedLocation }) {
  const q = (search || '').trim().toLowerCase();

  const mapped = (events || []).map((e) => {
    const spaceFromId = (spaces || []).find(s => s.id === e.spaceId);
    const spaceName = e.spaceName || spaceFromId?.name || e.space || e.location || '-';
    const eventDate = e.eventDate || e.date || e.startsAt || e.startDate;
    const name = e.name || e.eventName || '-';
    const eventType = e?.eventType?.name || e?.eventTypeName || '-';
    const eventCategory = e?.eventCategory?.name || e?.eventCategoryName || '-';
    const eventSubcategory = e?.eventSubcategory?.name || e?.eventSubcategoryName || '-';
    const status = e.status || '-';
    const revenue = e.revenue ?? e.totalRevenue ?? 0;

    return {
      id: e.id || `${name}-${eventDate || ''}-${spaceName}`,
      spaceName, eventDate, name, eventType, eventCategory, eventSubcategory,
      status, revenue, raw: e,
    };
  });

  return mapped.filter((row) => {
    const matchesLocation =
      !selectedLocation || String(row.spaceName) === String(selectedLocation);
    if (!matchesLocation) return false;
    if (!q) return true;
    const hay = [row.spaceName, row.name, row.eventType, row.eventCategory, row.eventSubcategory, row.status]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function exportToCSVRows(filteredEvents) {
  return [
    ['Space Name', 'Event Date', 'Start Date', 'End Date', 'End Time', 'Name',
     'Event Type', 'Event Category', 'Event Subcategory', 'Status', 'Revenue (€)', 'Transaction Count'],
    ...(filteredEvents || []).map(e => [
      e?.spaceName || '', e?.eventDate || '', e?.eventStartDate || '',
      e?.eventEndDate || '', e?.eventEndTime || '', e?.name || '',
      e?.eventType || '', e?.eventCategory || '', e?.eventSubcategory || '',
      e?.status || '', e?.revenue || '', e?.transactionCount || '',
    ]),
  ];
}

// ─── Utilities replicated from EventsCategorieListView / EventsSubcategorieListView ──

function normalizeId(value) {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object') return value.id || value._id || null;
  return null;
}

function buildEventTypeNameById(eventTypes) {
  const map = {};
  for (const t of (eventTypes || [])) {
    const id = t?.id || t?._id;
    if (!id) continue;
    map[String(id)] = t?.name || '';
  }
  return map;
}

function buildCategoryNameById(categories) {
  const map = {};
  const list = Array.isArray(categories) ? categories : [];
  for (const c of list) {
    const id = c?.id || c?._id;
    if (!id) continue;
    map[String(id)] = c?.name || '';
  }
  return map;
}

// ─── Utilities replicated from EventsTypeListView ──────────────────────────

function normalizeCategoryLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.name || value.label || value.id || value._id || '';
  return String(value);
}

function computeTotalCategories(eventTypes) {
  return (eventTypes || []).reduce((sum, type) => {
    return sum + (Array.isArray(type?.categories) ? type.categories.length : 0);
  }, 0);
}

function formatDateEtl(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

// ─── Validation helpers replicated from dialog components ─────────────────

function validateEventTypeName(name) {
  if (!name || !name.trim()) return 'Ce champ est obligatoire';
  return null;
}

function requiredRule(v) {
  return !!String(v || '').trim() ? true : 'Required';
}

// ══════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════

describe('EventsListView — formatDate', () => {
  it('returns "-" for null/undefined/empty', () => {
    expect(formatDateElv(null)).toBe('-');
    expect(formatDateElv(undefined)).toBe('-');
    expect(formatDateElv('')).toBe('-');
  });

  it('returns the string unchanged when it is not a valid date', () => {
    expect(formatDateElv('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid ISO date in fr-FR locale', () => {
    const result = formatDateElv('2024-03-15');
    expect(result).toMatch(/15\/03\/2024/);
  });

  it('handles a Unix timestamp string (ms)', () => {
    const ts = new Date('2024-01-01').toISOString();
    const result = formatDateElv(ts);
    expect(result).toMatch(/01\/01\/2024/);
  });
});

describe('EventsListView — formatCurrency', () => {
  // Number(null)=0 (finite) so it goes through toLocaleString, not the fallback
  it('formats null as zero currency', () => {
    const r = formatCurrencyElv(null);
    expect(r).toContain('0');
    expect(r).toContain('€');
  });

  it('returns "€0,00" for NaN inputs (undefined, non-numeric string)', () => {
    expect(formatCurrencyElv(undefined)).toBe('€0,00');
    expect(formatCurrencyElv('abc')).toBe('€0,00');
  });

  it('formats zero', () => {
    const r = formatCurrencyElv(0);
    expect(r).toContain('0');
    expect(r).toContain('€');
  });

  it('formats a positive number with EUR symbol', () => {
    const r = formatCurrencyElv(1234.5);
    expect(r).toContain('€');
    expect(r).toContain('1');
  });

  it('formats a negative number', () => {
    const r = formatCurrencyElv(-50);
    expect(r).toContain('-');
    expect(r).toContain('€');
  });
});

describe('EventsListView — filteredEvents logic', () => {
  const spaces = [
    { id: 's1', name: 'Stade de France' },
    { id: 's2', name: 'Bercy' },
  ];
  const events = [
    { id: 'e1', name: 'Concert Rock', spaceId: 's1', status: 'closed', eventTypeName: 'Music', eventCategoryName: 'Rock' },
    { id: 'e2', name: 'Match Football', spaceId: 's2', status: 'open', eventTypeName: 'Sport', eventCategoryName: 'Football' },
    { id: 'e3', name: 'Jazz Night', spaceId: 's1', status: 'open', eventTypeName: 'Music', eventCategoryName: 'Jazz' },
  ];

  it('returns all events when no filter applied', () => {
    const r = buildFilteredEvents({ events, spaces, search: '', selectedLocation: null });
    expect(r).toHaveLength(3);
  });

  it('filters by search term (name)', () => {
    const r = buildFilteredEvents({ events, spaces, search: 'jazz', selectedLocation: null });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Jazz Night');
  });

  it('search is case-insensitive', () => {
    const r = buildFilteredEvents({ events, spaces, search: 'ROCK', selectedLocation: null });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Concert Rock');
  });

  it('filters by location (spaceName)', () => {
    const r = buildFilteredEvents({ events, spaces, search: '', selectedLocation: 'Bercy' });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Match Football');
  });

  it('combines search and location filter', () => {
    const r = buildFilteredEvents({ events, spaces, search: 'Music', selectedLocation: 'Stade de France' });
    expect(r).toHaveLength(2);
  });

  it('resolves spaceName from spaces array when not on event', () => {
    const e = [{ id: 'e4', name: 'Test', spaceId: 's2' }];
    const r = buildFilteredEvents({ events: e, spaces, search: '', selectedLocation: null });
    expect(r[0].spaceName).toBe('Bercy');
  });

  it('falls back to "-" when space not found', () => {
    const e = [{ id: 'e5', name: 'Orphan', spaceId: 'unknown' }];
    const r = buildFilteredEvents({ events: e, spaces, search: '', selectedLocation: null });
    expect(r[0].spaceName).toBe('-');
  });

  it('handles empty events array', () => {
    const r = buildFilteredEvents({ events: [], spaces, search: 'anything', selectedLocation: null });
    expect(r).toHaveLength(0);
  });

  it('filters by eventType via search', () => {
    const r = buildFilteredEvents({ events, spaces, search: 'sport', selectedLocation: null });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Match Football');
  });
});

describe('EventsListView — exportToCSVRows', () => {
  it('produces header + one data row', () => {
    const row = {
      spaceName: 'Arena', eventDate: '2024-03-01', name: 'Concert',
      eventType: 'Music', eventCategory: 'Pop', eventSubcategory: 'Indie',
      status: 'open', revenue: 5000,
    };
    const rows = exportToCSVRows([row]);
    expect(rows[0]).toContain('Space Name');
    expect(rows[1][0]).toBe('Arena');
    expect(rows[1][5]).toBe('Concert');
  });

  it('returns only header for empty input', () => {
    expect(exportToCSVRows([])).toHaveLength(1);
    expect(exportToCSVRows(null)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('normalizeId (EventsCategorieListView / EventsSubcategorieListView)', () => {
  it('returns null for falsy values', () => {
    expect(normalizeId(null)).toBe(null);
    expect(normalizeId(undefined)).toBe(null);
    expect(normalizeId('')).toBe(null);
    expect(normalizeId(0)).toBe(null);
  });

  it('returns string as-is', () => {
    expect(normalizeId('abc-123')).toBe('abc-123');
  });

  it('returns number as-is', () => {
    expect(normalizeId(42)).toBe(42);
  });

  it('extracts id from object', () => {
    expect(normalizeId({ id: 'obj-id', name: 'Test' })).toBe('obj-id');
  });

  it('falls back to _id when id is absent', () => {
    expect(normalizeId({ _id: 'mongo-id' })).toBe('mongo-id');
  });

  it('returns null for object without id/_id', () => {
    expect(normalizeId({ name: 'No ID' })).toBe(null);
  });
});

describe('buildEventTypeNameById', () => {
  it('builds a map from id to name', () => {
    const types = [
      { id: '1', name: 'Sport' },
      { id: '2', name: 'Music' },
    ];
    const map = buildEventTypeNameById(types);
    expect(map['1']).toBe('Sport');
    expect(map['2']).toBe('Music');
  });

  it('handles _id instead of id', () => {
    const types = [{ _id: 'mongo1', name: 'Concert' }];
    const map = buildEventTypeNameById(types);
    expect(map['mongo1']).toBe('Concert');
  });

  it('skips entries without any id', () => {
    const types = [{ name: 'No ID' }];
    const map = buildEventTypeNameById(types);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('returns empty map for empty input', () => {
    expect(buildEventTypeNameById([])).toEqual({});
    expect(buildEventTypeNameById(null)).toEqual({});
  });
});

describe('buildCategoryNameById', () => {
  it('builds map from categories', () => {
    const cats = [{ id: 'c1', name: 'Rock' }, { id: 'c2', name: 'Jazz' }];
    const map = buildCategoryNameById(cats);
    expect(map['c1']).toBe('Rock');
    expect(map['c2']).toBe('Jazz');
  });

  it('handles non-array input safely', () => {
    expect(buildCategoryNameById(null)).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('EventsTypeListView — normalizeCategoryLabel', () => {
  it('returns "" for falsy input', () => {
    expect(normalizeCategoryLabel(null)).toBe('');
    expect(normalizeCategoryLabel('')).toBe('');
    expect(normalizeCategoryLabel(undefined)).toBe('');
  });

  it('returns string unchanged', () => {
    expect(normalizeCategoryLabel('Rock')).toBe('Rock');
  });

  it('extracts name from object', () => {
    expect(normalizeCategoryLabel({ name: 'Pop', id: '1' })).toBe('Pop');
  });

  it('falls back to label when name absent', () => {
    expect(normalizeCategoryLabel({ label: 'Jazz' })).toBe('Jazz');
  });

  it('falls back to id when name and label absent', () => {
    expect(normalizeCategoryLabel({ id: 'type-42' })).toBe('type-42');
  });

  it('converts non-string/non-object to string', () => {
    expect(normalizeCategoryLabel(99)).toBe('99');
  });
});

describe('EventsTypeListView — totalCategories', () => {
  it('sums categories arrays across all types', () => {
    const types = [
      { id: '1', categories: ['a', 'b', 'c'] },
      { id: '2', categories: ['x'] },
      { id: '3' },
    ];
    expect(computeTotalCategories(types)).toBe(4);
  });

  it('returns 0 for empty list', () => {
    expect(computeTotalCategories([])).toBe(0);
    expect(computeTotalCategories(null)).toBe(0);
  });
});

describe('EventsTypeListView — formatDate (with time)', () => {
  it('returns "" for falsy value', () => {
    expect(formatDateEtl(null)).toBe('');
    expect(formatDateEtl('')).toBe('');
  });

  it('returns original string when not a valid date', () => {
    expect(formatDateEtl('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid date with day, month, year parts', () => {
    const result = formatDateEtl('2024-06-15T10:30:00Z');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/06/);
    expect(result).toMatch(/2024/);
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('EventTypeDialog — name validation', () => {
  it('returns error message for empty name', () => {
    expect(validateEventTypeName('')).toBe('Ce champ est obligatoire');
    expect(validateEventTypeName('   ')).toBe('Ce champ est obligatoire');
    expect(validateEventTypeName(null)).toBe('Ce champ est obligatoire');
  });

  it('returns null for valid name', () => {
    expect(validateEventTypeName('Concert')).toBe(null);
    expect(validateEventTypeName('  Festival  ')).toBe(null);
  });
});

describe('required rule (dialogs)', () => {
  it('returns true for non-empty value', () => {
    expect(requiredRule('hello')).toBe(true);
    expect(requiredRule(' x ')).toBe(true);
  });

  it('returns error string for empty/falsy', () => {
    expect(requiredRule('')).toBe('Required');
    expect(requiredRule(null)).toBe('Required');
    expect(requiredRule(0)).toBe('Required');
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('EventCategoryDialog — state management logic', () => {
  function makeDialogState(preselectedTypeId = '') {
    return {
      name: '',
      eventTypeId: preselectedTypeId || '',
      hasHomeTeam: false,
      loading: false,
      error: '',
    };
  }

  function resetOnOpen(state, preselectedTypeId) {
    state.name = '';
    state.eventTypeId = preselectedTypeId || '';
    state.hasHomeTeam = false;
    state.error = '';
    state.loading = false;
    return state;
  }

  it('initializes eventTypeId from preselectedTypeId', () => {
    const s = makeDialogState('type-42');
    expect(s.eventTypeId).toBe('type-42');
  });

  it('resets to initial state on open', () => {
    const s = makeDialogState();
    s.name = 'Concert';
    s.hasHomeTeam = true;
    s.loading = true;
    resetOnOpen(s, 'new-type');
    expect(s.name).toBe('');
    expect(s.hasHomeTeam).toBe(false);
    expect(s.loading).toBe(false);
    expect(s.eventTypeId).toBe('new-type');
  });
});

describe('EventSubcategoryDialog — state management logic', () => {
  function resetOnOpen(state, preselectedCategoryId) {
    state.name = '';
    state.categoryId = preselectedCategoryId || '';
    state.error = '';
    state.loading = false;
    return state;
  }

  it('resets state on open', () => {
    const s = { name: 'Old', categoryId: 'c1', error: 'err', loading: true };
    resetOnOpen(s, 'c2');
    expect(s.name).toBe('');
    expect(s.categoryId).toBe('c2');
    expect(s.error).toBe('');
    expect(s.loading).toBe(false);
  });
});

describe('EventsListView — openDeleteEventDialog state', () => {
  function openDeleteEventDialog(state, row) {
    const e = row?.raw || row;
    state.deleteEventId = e?.id || null;
    state.deleteEventName = e?.name || 'this event';
    state.deleteEventError = '';
    state.deleteEventLoading = false;
    state.deleteEventDialog = true;
  }

  it('populates delete state from a row', () => {
    const state = { deleteEventId: null, deleteEventName: '', deleteEventError: '', deleteEventLoading: false, deleteEventDialog: false };
    openDeleteEventDialog(state, { id: 'ev-1', name: 'Concert Rock' });
    expect(state.deleteEventId).toBe('ev-1');
    expect(state.deleteEventName).toBe('Concert Rock');
    expect(state.deleteEventDialog).toBe(true);
    expect(state.deleteEventLoading).toBe(false);
  });

  it('handles row with raw sub-object', () => {
    const state = { deleteEventId: null, deleteEventName: '', deleteEventError: '', deleteEventLoading: false, deleteEventDialog: false };
    openDeleteEventDialog(state, { raw: { id: 'ev-2', name: 'Jazz Night' } });
    expect(state.deleteEventId).toBe('ev-2');
    expect(state.deleteEventName).toBe('Jazz Night');
  });

  it('falls back to "this event" when name is absent', () => {
    const state = { deleteEventId: null, deleteEventName: '', deleteEventError: '', deleteEventLoading: false, deleteEventDialog: false };
    openDeleteEventDialog(state, { id: 'ev-3' });
    expect(state.deleteEventName).toBe('this event');
  });
});

describe('EventsTypeListView — openDetailsDialog state', () => {
  function openDetailsDialog(state, type) {
    state.detailsType = type;
    state.detailsDialog = true;
    state.detailsError = '';
    state.detailsLoading = true;
    state.detailsEventsCount = 0;
    const categories = Array.isArray(type?.categories) ? type.categories : [];
    state.detailsCategories = categories.map(normalizeCategoryLabel).filter(Boolean);
  }

  it('sets detailsCategories from type.categories array of strings', () => {
    const state = { detailsType: null, detailsDialog: false, detailsError: '', detailsLoading: false, detailsEventsCount: 0, detailsCategories: [] };
    openDetailsDialog(state, { id: 't1', name: 'Sport', categories: ['Football', 'Tennis'] });
    expect(state.detailsCategories).toEqual(['Football', 'Tennis']);
    expect(state.detailsDialog).toBe(true);
    expect(state.detailsLoading).toBe(true);
  });

  it('normalizes category objects in categories array', () => {
    const state = { detailsType: null, detailsDialog: false, detailsError: '', detailsLoading: false, detailsEventsCount: 0, detailsCategories: [] };
    openDetailsDialog(state, { id: 't2', categories: [{ name: 'Rock' }, { name: 'Jazz' }] });
    expect(state.detailsCategories).toEqual(['Rock', 'Jazz']);
  });

  it('handles missing categories gracefully', () => {
    const state = { detailsType: null, detailsDialog: false, detailsError: '', detailsLoading: false, detailsEventsCount: 0, detailsCategories: [] };
    openDetailsDialog(state, { id: 't3', name: 'Music' });
    expect(state.detailsCategories).toEqual([]);
  });
});

describe('EventsCategorieListView — exportToCSV row building', () => {
  function buildExportRows(categories, eventTypeNameById) {
    return [
      ['Name', 'Event Type', 'Has Home Team'],
      ...(categories || []).map(c => [
        c?.name || '',
        eventTypeNameById[c?.eventTypeId] || '',
        c?.hasHomeTeam ? 'Yes' : 'No',
      ]),
    ];
  }

  it('builds correct rows with event type resolution', () => {
    const cats = [
      { id: 'c1', name: 'Rock', eventTypeId: 't1', hasHomeTeam: false },
      { id: 'c2', name: 'Football', eventTypeId: 't2', hasHomeTeam: true },
    ];
    const nameById = { t1: 'Music', t2: 'Sport' };
    const rows = buildExportRows(cats, nameById);
    expect(rows[0]).toEqual(['Name', 'Event Type', 'Has Home Team']);
    expect(rows[1]).toEqual(['Rock', 'Music', 'No']);
    expect(rows[2]).toEqual(['Football', 'Sport', 'Yes']);
  });

  it('handles unknown eventTypeId gracefully', () => {
    const cats = [{ id: 'c1', name: 'Unknown Type', eventTypeId: 'xxx' }];
    const rows = buildExportRows(cats, {});
    expect(rows[1][1]).toBe('');
  });
});
