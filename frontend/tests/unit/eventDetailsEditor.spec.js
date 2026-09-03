import { shallowMount } from '@vue/test-utils'
import EventDetailsEditor from '@/components/space-workspace/event-predict/EventDetailsEditor.vue'

const event = {
  id: 'event-1',
  eventName: 'CIV 16e de finale',
  eventDate: '2026-07-17',
  eventEndDate: '2026-07-17',
  eventEndTime: '23:00',
  eventTypeId: 'sport',
  eventCategoryId: 'football',
  eventSubcategoryId: 'ligue-1',
  configurationId: 'config-1',
  ticketsSold: 6000,
  ticketsScanned: 4220,
  sessions: [{ doorsOpening: '19:54', showTime: '21:55' }],
}

const DrawerStub = {
  name: 'EventDrawerShell',
  props: ['modelValue'],
  template: '<aside v-if="modelValue" class="drawer-stub"><slot /><slot name="footer" /></aside>',
}

function mountEditor(props = {}) {
  return shallowMount(EventDetailsEditor, {
    props: {
      event,
      configurations: [{ id: 'config-1', name: 'Main' }],
      eventTypes: [{ id: 'sport', name: 'Sport' }],
      eventCategories: [{ id: 'football', name: 'Football', eventTypeId: 'sport' }],
      eventSubcategories: [{ id: 'ligue-1', name: 'Ligue 1', eventCategoryId: 'football' }],
      teams: [],
      fromMock: true,
      ...props,
    },
    global: {
      stubs: {
        Teleport: true,
        EventDrawerShell: DrawerStub,
        VTextField: true,
        VSelect: true,
        VAutocomplete: true,
      },
    },
  })
}

describe('EventDetailsEditor drawer', () => {
  it('is not mounted before Edit details is clicked', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('.drawer-stub').exists()).toBe(false)
  })

  it('opens only from Edit details and cancel restores draft', async () => {
    const wrapper = mountEditor()

    await wrapper.get('.ede-summary-edit').trigger('click')
    expect(wrapper.find('.drawer-stub').exists()).toBe(true)

    wrapper.vm.handleFieldChange('eventName', 'Changed event')
    expect(wrapper.vm.editedEvent.eventName).toBe('Changed event')

    wrapper.vm.cancelDrawer()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.drawer-stub').exists()).toBe(false)
    expect(wrapper.vm.editedEvent.eventName).toBe(event.eventName)
    expect(wrapper.emitted('event-update')).toBeUndefined()
  })

  it('save emits edited event and closes drawer', async () => {
    const wrapper = mountEditor()

    wrapper.vm.openDrawer()
    wrapper.vm.handleFieldChange('eventName', 'Saved event')
    await wrapper.vm.handleSave()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.drawer-stub').exists()).toBe(false)
    expect(wrapper.emitted('event-update')).toEqual([
      [expect.objectContaining({ eventName: 'Saved event' })],
    ])
  })
})
