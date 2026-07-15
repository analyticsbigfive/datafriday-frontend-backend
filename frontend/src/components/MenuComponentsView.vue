<template>
  <div class="menu-components">
    <header class="menu-components-header">
      <h3 class="menu-components-title">F&amp;B Menu - Components</h3>
      <p class="menu-components-subtitle">
        Stub view for managing base components used in menu items.
      </p>
    </header>

    <div class="menu-components-body">
      <div class="menu-components-empty">
        <p class="menu-components-empty-text">
          This is a placeholder for the Components view.
        </p>
        <p class="menu-components-empty-help">
          Later, we will reproduce the full React UI here (list of components, search,
          filters, actions...).
        </p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MenuComponentsView',
}
</script>

<style scoped>
.menu-components {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.menu-components-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.menu-components-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: #111827;
}

.menu-components-subtitle {
  font-size: 0.875rem;
  margin: 0;
  color: #6b7280;
}

.menu-components-body {
  margin-top: 0.5rem;
}

.menu-components-empty {
  padding: 1rem;
  border-radius: 0.5rem;
  background: #f9fafb;
  border: 1px dashed #e5e7eb;
}

.menu-components-empty-text {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #111827;
}

.menu-components-empty-help {
  margin: 0;
  font-size: 0.8rem;
  color: #6b7280;
}
</style>
