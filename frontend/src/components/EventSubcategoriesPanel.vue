<template>
  <!-- This is a wrapper that renders the EventSubcategoriesView without the top bar -->
  <EventSubcategoriesView />
</template>
<script>
import EventSubcategoriesView from './EventSubCategoriesView.vue';
export default {
  name: 'EventSubcategoriesPanel',
  components: {
    EventSubcategoriesView
  }
};
</script>