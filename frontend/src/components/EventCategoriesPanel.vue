<template>
  <!-- This is a wrapper that renders the EventCategoriesView without the top bar -->
  <EventCategoriesView />
</template>
<script>
import EventCategoriesView from './EventCategoriesView.vue';
export default {
  name: 'EventCategoriesPanel',
  components: {
    EventCategoriesView
  }
};
</script>