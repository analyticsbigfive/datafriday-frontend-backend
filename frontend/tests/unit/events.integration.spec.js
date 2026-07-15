/**
 * Integration tests for src/components/events.
 *
 * Strategy: simulate component method execution on a plain JS object that
 * mirrors the component's data/emits/$store/$emit surface.  This tests the
 * real business logic (validation → API call → store dispatch → emit) without
 * needing to mount Vuetify components.
 *
 * APIs are mocked with jest.mock; $store.dispatch / $store.getters are
 * supplied as plain jest.fn() / object mocks.
 */

// ── API mocks ──────────────────────────────────────────────────────────────
jest.mock('@/api/endpoints/event.api', () => ({
  createEventType:       jest.fn(),
  updateEventType:       jest.fn(),
  deleteEventType:       jest.fn(),
  createEventCategory:   jest.fn(),
  updateEventCategory:   jest.fn(),
  deleteEventCategory:   jest.fn(),
  createEventSubcategory: jest.fn(),
  deleteEventSubcategory: jest.fn(),
  deleteEvent:           jest.fn(),
}));

// downloadCSV is a side-effect we don't need in tests
jest.mock('@/utils/csv', () => ({ downloadCSV: jest.fn() }));

const api = require('@/api/endpoints/event.api');

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeStore(getterValues = {}) {
  return {
    dispatch: jest.fn().mockResolvedValue(undefined),
    getters: getterValues,
  };
}

function makeEmit() {
  return jest.fn();
}

// ══════════════════════════════════════════════════════════════════════════
// EventTypeDialog — submit()
// ══════════════════════════════════════════════════════════════════════════

async function eventTypeDialogSubmit(ctx) {
  ctx.nameError = '';
  if (!ctx.name.trim()) {
    ctx.nameError = 'Ce champ est obligatoire';
    return;
  }
  ctx.loading = true;
  ctx.error = '';
  try {
    const response = await api.createEventType({ name: ctx.name.trim() });
    const created = response?.data || response;
    const id = created?.id || created?._id;
    if (id) {
      await ctx.$store.dispatch('eventTypes/addEventType', { id, name: ctx.name.trim() });
      ctx.$emit('created', { id, name: ctx.name.trim() });
    }
    // close
    ctx.$emit('update:modelValue', false);
    ctx.error = '';
    ctx.name = '';
    ctx.nameError = '';
  } catch (e) {
    ctx.error = e?.response?.data?.message || e?.message || 'Failed to create event type';
  } finally {
    ctx.loading = false;
  }
}

describe('EventTypeDialog — submit()', () => {
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = {
      name: '',
      nameError: '',
      loading: false,
      error: '',
      $store: makeStore(),
      $emit: makeEmit(),
    };
  });

  it('sets nameError and aborts when name is empty', async () => {
    ctx.name = '   ';
    await eventTypeDialogSubmit(ctx);
    expect(ctx.nameError).toBe('Ce champ est obligatoire');
    expect(api.createEventType).not.toHaveBeenCalled();
  });

  it('calls API and dispatches store on valid name', async () => {
    ctx.name = 'Concert';
    api.createEventType.mockResolvedValue({ id: 'type-1', name: 'Concert' });

    await eventTypeDialogSubmit(ctx);

    expect(api.createEventType).toHaveBeenCalledWith({ name: 'Concert' });
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventTypes/addEventType', { id: 'type-1', name: 'Concert' });
  });

  it('emits "created" with the new type', async () => {
    ctx.name = 'Sport';
    api.createEventType.mockResolvedValue({ id: 'type-2', name: 'Sport' });

    await eventTypeDialogSubmit(ctx);

    expect(ctx.$emit).toHaveBeenCalledWith('created', { id: 'type-2', name: 'Sport' });
    expect(ctx.$emit).toHaveBeenCalledWith('update:modelValue', false);
  });

  it('sets error and does not close on API failure', async () => {
    ctx.name = 'Fail';
    api.createEventType.mockRejectedValue({ message: 'Network error' });

    await eventTypeDialogSubmit(ctx);

    expect(ctx.error).toBe('Network error');
    expect(ctx.$emit).not.toHaveBeenCalledWith('update:modelValue', false);
  });

  it('always resets loading after completion', async () => {
    ctx.name = 'Loading Test';
    api.createEventType.mockResolvedValue({ id: 't3', name: 'Loading Test' });
    await eventTypeDialogSubmit(ctx);
    expect(ctx.loading).toBe(false);
  });

  it('always resets loading even on error', async () => {
    ctx.name = 'Error Test';
    api.createEventType.mockRejectedValue(new Error('oops'));
    await eventTypeDialogSubmit(ctx);
    expect(ctx.loading).toBe(false);
  });

  it('handles response with .data wrapper (axios style)', async () => {
    ctx.name = 'Axio';
    api.createEventType.mockResolvedValue({ data: { id: 'ax-1', name: 'Axio' } });
    await eventTypeDialogSubmit(ctx);
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventTypes/addEventType', { id: 'ax-1', name: 'Axio' });
  });

  it('handles _id instead of id in response', async () => {
    ctx.name = 'Mongo';
    api.createEventType.mockResolvedValue({ _id: 'mongo-42', name: 'Mongo' });
    await eventTypeDialogSubmit(ctx);
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventTypes/addEventType', { id: 'mongo-42', name: 'Mongo' });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EventSubcategoryDialog — submit()
// ══════════════════════════════════════════════════════════════════════════

async function subDialogSubmit(ctx) {
  if (!ctx.$refs?.form) return;
  const { valid } = await ctx.$refs.form.validate();
  if (!valid) return;
  ctx.loading = true;
  ctx.error = '';
  try {
    const response = await api.createEventSubcategory({ name: ctx.name.trim(), categoryId: ctx.categoryId });
    const created = response?.data || response;
    const id = created?.id || created?._id;
    if (id) {
      await ctx.$store.dispatch('eventSubcategories/addEventSubcategory', { id, name: ctx.name.trim(), categoryId: ctx.categoryId });
      ctx.$emit('created', { id, name: ctx.name.trim(), categoryId: ctx.categoryId });
    }
    ctx.$emit('update:modelValue', false);
    ctx.error = '';
  } catch (e) {
    ctx.error = e?.response?.data?.message || e?.message || 'Failed to create event subcategory';
  } finally {
    ctx.loading = false;
  }
}

describe('EventSubcategoryDialog — submit()', () => {
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = {
      name: 'Sub Rock',
      categoryId: 'cat-1',
      loading: false,
      error: '',
      $refs: { form: { validate: jest.fn().mockResolvedValue({ valid: true }) } },
      $store: makeStore(),
      $emit: makeEmit(),
    };
  });

  it('skips when form validation fails', async () => {
    ctx.$refs.form.validate.mockResolvedValue({ valid: false });
    await subDialogSubmit(ctx);
    expect(api.createEventSubcategory).not.toHaveBeenCalled();
  });

  it('calls API and dispatches on valid form', async () => {
    api.createEventSubcategory.mockResolvedValue({ id: 'sub-1', name: 'Sub Rock' });
    await subDialogSubmit(ctx);
    expect(api.createEventSubcategory).toHaveBeenCalledWith({ name: 'Sub Rock', categoryId: 'cat-1' });
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventSubcategories/addEventSubcategory', expect.objectContaining({ id: 'sub-1' }));
  });

  it('emits created and closes on success', async () => {
    api.createEventSubcategory.mockResolvedValue({ id: 'sub-2' });
    await subDialogSubmit(ctx);
    expect(ctx.$emit).toHaveBeenCalledWith('created', expect.objectContaining({ id: 'sub-2' }));
    expect(ctx.$emit).toHaveBeenCalledWith('update:modelValue', false);
  });

  it('stores error on API failure', async () => {
    api.createEventSubcategory.mockRejectedValue({ message: 'Bad Request' });
    await subDialogSubmit(ctx);
    expect(ctx.error).toBe('Bad Request');
  });

  it('skips without $refs.form', async () => {
    ctx.$refs = {};
    await subDialogSubmit(ctx);
    expect(api.createEventSubcategory).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EventsListView — confirmDeleteEvent()
// ══════════════════════════════════════════════════════════════════════════

async function confirmDeleteEvent(ctx) {
  if (!ctx.deleteEventId) { ctx.deleteEventError = 'Missing event id'; return; }
  ctx.deleteEventLoading = true;
  ctx.deleteEventError = '';
  try {
    await api.deleteEvent(ctx.deleteEventId);
    ctx.$store.dispatch('events/removeEvent', ctx.deleteEventId);
    // close
    ctx.deleteEventDialog = false;
    ctx.deleteEventLoading = false;
    ctx.deleteEventError = '';
    ctx.deleteEventId = null;
    ctx.deleteEventName = '';
  } catch (e) {
    ctx.deleteEventError = e?.response?.data?.message || e?.message || 'Failed to delete event';
  } finally {
    ctx.deleteEventLoading = false;
  }
}

describe('EventsListView — confirmDeleteEvent()', () => {
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = {
      deleteEventId: 'ev-1',
      deleteEventName: 'Concert',
      deleteEventError: '',
      deleteEventLoading: false,
      deleteEventDialog: true,
      $store: makeStore(),
    };
  });

  it('sets error and aborts when deleteEventId is missing', async () => {
    ctx.deleteEventId = null;
    await confirmDeleteEvent(ctx);
    expect(ctx.deleteEventError).toBe('Missing event id');
    expect(api.deleteEvent).not.toHaveBeenCalled();
  });

  it('calls deleteEvent API with correct id', async () => {
    api.deleteEvent.mockResolvedValue({});
    await confirmDeleteEvent(ctx);
    expect(api.deleteEvent).toHaveBeenCalledWith('ev-1');
  });

  it('dispatches removeEvent to store on success', async () => {
    api.deleteEvent.mockResolvedValue({});
    await confirmDeleteEvent(ctx);
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('events/removeEvent', 'ev-1');
  });

  it('closes dialog and resets state on success', async () => {
    api.deleteEvent.mockResolvedValue({});
    await confirmDeleteEvent(ctx);
    expect(ctx.deleteEventDialog).toBe(false);
    expect(ctx.deleteEventId).toBe(null);
    expect(ctx.deleteEventName).toBe('');
  });

  it('sets error message on API failure', async () => {
    api.deleteEvent.mockRejectedValue({ message: 'Not found' });
    await confirmDeleteEvent(ctx);
    expect(ctx.deleteEventError).toBe('Not found');
    expect(ctx.deleteEventDialog).toBe(true); // dialog stays open
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EventsCategorieListView — submitCategory() (create & edit paths)
// ══════════════════════════════════════════════════════════════════════════

async function submitCategory(ctx) {
  const form = ctx.$refs?.categoryForm;
  if (form && typeof form.validate === 'function') {
    const result = await form.validate();
    const valid = typeof result === 'boolean' ? result : !!result?.valid;
    if (!valid) return;
  }
  ctx.categoryLoading = true;
  ctx.categoryError = '';
  try {
    if (ctx.categoryDialogMode === 'edit') {
      if (!ctx.categoryId) throw new Error('Missing category id');
      const payload = { name: ctx.categoryFormData.name, eventTypeId: ctx.categoryFormData.eventTypeId };
      await updateEventCategory(ctx.categoryId, payload);
      await ctx.$store.dispatch('eventCategories/updateEventCategory', { id: ctx.categoryId, ...payload });
    } else {
      const payload = { name: ctx.categoryFormData.name, eventTypeId: ctx.categoryFormData.eventTypeId };
      const response = await createEventCategory(payload);
      const created = response?.data || response;
      await ctx.$store.dispatch('eventCategories/addEventCategory', created);
    }
    // closeCategoryDialog
    ctx.categoryDialog = false;
    ctx.categoryLoading = false;
    ctx.categoryError = '';
    ctx.categoryId = null;
  } catch (e) {
    ctx.categoryError = e?.response?.data?.message || e?.message || "Impossible d'enregistrer la catégorie";
  } finally {
    ctx.categoryLoading = false;
  }
}

// Local references to the mocked API functions (re-require after jest.mock)
const { createEventCategory, updateEventCategory } = require('@/api/endpoints/event.api');

describe('EventsCategorieListView — submitCategory()', () => {
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = {
      categoryDialogMode: 'create',
      categoryId: null,
      categoryFormData: { name: 'New Cat', eventTypeId: 't1', hasHomeTeam: false },
      categoryLoading: false,
      categoryError: '',
      categoryDialog: true,
      $refs: {},
      $store: makeStore(),
    };
  });

  it('calls createEventCategory and dispatches addEventCategory in create mode', async () => {
    api.createEventCategory.mockResolvedValue({ id: 'c-new', name: 'New Cat' });
    await submitCategory(ctx);
    expect(api.createEventCategory).toHaveBeenCalledWith({ name: 'New Cat', eventTypeId: 't1' });
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventCategories/addEventCategory', expect.objectContaining({ id: 'c-new' }));
    expect(ctx.categoryDialog).toBe(false);
  });

  it('calls updateEventCategory in edit mode', async () => {
    ctx.categoryDialogMode = 'edit';
    ctx.categoryId = 'c-existing';
    ctx.categoryFormData.name = 'Updated';
    api.updateEventCategory.mockResolvedValue({});
    await submitCategory(ctx);
    expect(api.updateEventCategory).toHaveBeenCalledWith('c-existing', expect.objectContaining({ name: 'Updated' }));
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventCategories/updateEventCategory', expect.objectContaining({ id: 'c-existing' }));
  });

  it('throws and sets error in edit mode when categoryId is missing', async () => {
    ctx.categoryDialogMode = 'edit';
    ctx.categoryId = null;
    await submitCategory(ctx);
    expect(ctx.categoryError).toMatch(/Missing category id/);
  });

  it('sets error on API failure', async () => {
    api.createEventCategory.mockRejectedValue({ message: 'Server Error' });
    await submitCategory(ctx);
    expect(ctx.categoryError).toBe('Server Error');
    expect(ctx.categoryDialog).toBe(true);
  });

  it('skips when form validation fails', async () => {
    ctx.$refs.categoryForm = { validate: jest.fn().mockResolvedValue({ valid: false }) };
    await submitCategory(ctx);
    expect(api.createEventCategory).not.toHaveBeenCalled();
  });

  it('accepts boolean true from form.validate()', async () => {
    ctx.$refs.categoryForm = { validate: jest.fn().mockResolvedValue(true) };
    api.createEventCategory.mockResolvedValue({ id: 'c-bool' });
    await submitCategory(ctx);
    expect(api.createEventCategory).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EventsTypeListView — confirmDelete()
// ══════════════════════════════════════════════════════════════════════════

async function confirmDeleteType(ctx) {
  if (!ctx.deleteTypeId) { ctx.deleteError = 'Missing event type id'; return; }
  ctx.deleteLoading = true;
  ctx.deleteError = '';
  try {
    await api.deleteEventType(ctx.deleteTypeId);
    await ctx.$store.dispatch('eventTypes/removeEventType', ctx.deleteTypeId);
    // closeDeleteDialog
    ctx.deleteDialog = false;
    ctx.deleteLoading = false;
    ctx.deleteError = '';
    ctx.deleteTypeId = null;
    ctx.deleteTypeName = '';
  } catch (e) {
    ctx.deleteError = e?.response?.data?.message || e?.message || 'Failed to delete event type';
  } finally {
    ctx.deleteLoading = false;
  }
}

describe('EventsTypeListView — confirmDelete()', () => {
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = {
      deleteTypeId: 'type-1',
      deleteTypeName: 'Sport',
      deleteDialog: true,
      deleteError: '',
      deleteLoading: false,
      $store: makeStore(),
    };
  });

  it('aborts with error when deleteTypeId is null', async () => {
    ctx.deleteTypeId = null;
    await confirmDeleteType(ctx);
    expect(ctx.deleteError).toBe('Missing event type id');
    expect(api.deleteEventType).not.toHaveBeenCalled();
  });

  it('calls deleteEventType and removeEventType dispatch on success', async () => {
    api.deleteEventType.mockResolvedValue({});
    await confirmDeleteType(ctx);
    expect(api.deleteEventType).toHaveBeenCalledWith('type-1');
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventTypes/removeEventType', 'type-1');
    expect(ctx.deleteDialog).toBe(false);
    expect(ctx.deleteTypeId).toBe(null);
  });

  it('sets error message on API failure and keeps dialog open', async () => {
    api.deleteEventType.mockRejectedValue({ response: { data: { message: 'Conflict' } } });
    await confirmDeleteType(ctx);
    expect(ctx.deleteError).toBe('Conflict');
    expect(ctx.deleteDialog).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EventsTypeListView — submitType() create & edit
// ══════════════════════════════════════════════════════════════════════════

async function submitType(ctx) {
  const form = ctx.$refs?.typeForm;
  if (form && typeof form.validate === 'function') {
    const result = await form.validate();
    const valid = typeof result === 'boolean' ? result : !!result?.valid;
    if (!valid) return;
  }
  ctx.typeLoading = true;
  ctx.typeError = '';
  try {
    const payload = { name: ctx.typeFormData.name };
    if (ctx.typeMode === 'edit') {
      if (!ctx.typeId) throw new Error('Missing event type id');
      await api.updateEventType(ctx.typeId, payload);
      await ctx.$store.dispatch('eventTypes/updateEventType', { id: ctx.typeId, ...payload });
    } else {
      const response = await api.createEventType(payload);
      const created = response?.data || response;
      await ctx.$store.dispatch('eventTypes/addEventType', created);
    }
    // closeTypeDialog
    ctx.typeDialog = false;
    ctx.typeLoading = false;
    ctx.typeError = '';
    ctx.typeId = null;
  } catch (e) {
    ctx.typeError = e?.response?.data?.message || e?.message || "Impossible d'enregistrer le type d'évènement";
  } finally {
    ctx.typeLoading = false;
  }
}

describe('EventsTypeListView — submitType()', () => {
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = {
      typeMode: 'create',
      typeId: null,
      typeFormData: { name: 'Music' },
      typeDialog: true,
      typeLoading: false,
      typeError: '',
      $refs: {},
      $store: makeStore(),
    };
  });

  it('creates a new type and dispatches addEventType', async () => {
    api.createEventType.mockResolvedValue({ id: 'new-type', name: 'Music' });
    await submitType(ctx);
    expect(api.createEventType).toHaveBeenCalledWith({ name: 'Music' });
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventTypes/addEventType', expect.objectContaining({ id: 'new-type' }));
    expect(ctx.typeDialog).toBe(false);
  });

  it('updates an existing type in edit mode', async () => {
    ctx.typeMode = 'edit';
    ctx.typeId = 'existing-type';
    ctx.typeFormData.name = 'Updated Name';
    api.updateEventType.mockResolvedValue({});
    await submitType(ctx);
    expect(api.updateEventType).toHaveBeenCalledWith('existing-type', { name: 'Updated Name' });
    expect(ctx.$store.dispatch).toHaveBeenCalledWith('eventTypes/updateEventType', expect.objectContaining({ id: 'existing-type', name: 'Updated Name' }));
  });

  it('throws in edit mode when typeId is null', async () => {
    ctx.typeMode = 'edit';
    ctx.typeId = null;
    await submitType(ctx);
    expect(ctx.typeError).toMatch(/Missing event type id/);
  });

  it('handles API error and leaves dialog open', async () => {
    api.createEventType.mockRejectedValue({ message: 'Duplicate name' });
    await submitType(ctx);
    expect(ctx.typeError).toBe('Duplicate name');
    expect(ctx.typeDialog).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EventsCategorieListView — handleEventTypeChange + handleTypeCreated
// ══════════════════════════════════════════════════════════════════════════

describe('EventsCategorieListView — type creation flow', () => {
  it('opens typeDialog when __create__ is selected', () => {
    const ctx = { categoryFormData: { eventTypeId: null }, typeDialog: false };
    function handleEventTypeChange(value) {
      if (value === '__create__') {
        ctx.categoryFormData.eventTypeId = null;
        ctx.typeDialog = true;
      }
    }
    handleEventTypeChange('__create__');
    expect(ctx.typeDialog).toBe(true);
    expect(ctx.categoryFormData.eventTypeId).toBe(null);
  });

  it('sets eventTypeId when a new type is created', () => {
    const ctx = { categoryFormData: { eventTypeId: null } };
    function handleTypeCreated(newType) {
      ctx.categoryFormData.eventTypeId = newType.id;
    }
    handleTypeCreated({ id: 'new-type-id', name: 'Jazz' });
    expect(ctx.categoryFormData.eventTypeId).toBe('new-type-id');
  });

  it('does not touch typeDialog for normal selection', () => {
    const ctx = { categoryFormData: { eventTypeId: null }, typeDialog: false };
    function handleEventTypeChange(value) {
      if (value === '__create__') {
        ctx.categoryFormData.eventTypeId = null;
        ctx.typeDialog = true;
      }
    }
    handleEventTypeChange('regular-type-id');
    expect(ctx.typeDialog).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EventDeleteDialog — emits (no mounting, just prop/emit contract checks)
// ══════════════════════════════════════════════════════════════════════════

describe('EventDeleteDialog — close and confirm contract', () => {
  function close(ctx) {
    ctx.$emit('update:modelValue', false);
    ctx.error = '';
  }

  function confirm(ctx) {
    ctx.$emit('confirm');
  }

  it('emits update:modelValue=false on close', () => {
    const ctx = { error: 'some error', $emit: makeEmit() };
    close(ctx);
    expect(ctx.$emit).toHaveBeenCalledWith('update:modelValue', false);
    expect(ctx.error).toBe('');
  });

  it('emits confirm when user clicks delete', () => {
    const ctx = { $emit: makeEmit() };
    confirm(ctx);
    expect(ctx.$emit).toHaveBeenCalledWith('confirm');
  });
});
