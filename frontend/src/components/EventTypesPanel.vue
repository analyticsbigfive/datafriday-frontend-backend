<template>
  <!-- This is a wrapper that renders the EventTypesView without the top bar -->
  <EventTypesView />
</template>

<script>
import EventTypesView from './EventTypesView.vue';

export default {
  name: 'EventTypesPanel',
  components: {
    EventTypesView
  }
};
</script>
