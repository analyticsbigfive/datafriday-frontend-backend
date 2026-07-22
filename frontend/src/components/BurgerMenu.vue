<template>
  <!-- Overlay -->
  <transition name="overlay-fade">
    <div 
      v-if="isOpen" 
      class="menu-overlay"
      @click="$emit('close')"
    ></div>
  </transition>

  <transition name="drawer-slide">
    <div 
      v-if="isOpen" 
      class="drawer-container"
      :class="{ 'drawer-expanded': showSpacesSubmenu }"
    >
      <div class="drawer-content">
        <!-- Header -->
        <div class="drawer-header">
          <h2 class="drawer-title">Menu</h2>
        </div>

        <div class="drawer-body">
          <!-- Main Menu Column -->
          <div class="main-menu" :class="{ 'main-menu-collapsed': showSpacesSubmenu }">
            <!-- Tools Section -->
            <div class="menu-section">
              <h3 class="section-title">TOOLS</h3>
              <button
                v-if="can('front.fb.analyse')"
                class="menu-item"
                @click="handleMenuClick('analyse')"
              >
                {{ showSpacesSubmenu ? 'Ana' : 'Analyse' }}
              </button>
              <button
                v-if="can('front.fb.predict')"
                class="menu-item"
                @click="handleMenuClick('predict')"
              >
                {{ showSpacesSubmenu ? 'Pre' : 'Predict' }}
              </button>
              <button
                v-if="can('front.fb.spaceInventory')"
                class="menu-item"
                @click="handleMenuClick('inventory')"
              >
                {{ showSpacesSubmenu ? 'Inv' : 'Inventory' }}
              </button>
              <button
                v-if="can('front.fb.spaceInventory')"
                class="menu-item"
                @click="handleMenuClick('space-inventory')"
              >
                {{ showSpacesSubmenu ? 'PEI' : 'Post-event Inventory' }}
              </button>
              <button
                v-if="can('front.fb.stockUp')"
                class="menu-item"
                @click="handleMenuClick('stockup')"
              >
                {{ showSpacesSubmenu ? 'Sto' : 'Stockup' }}
              </button>
              <button
                v-if="can('front.fb.live')"
                class="menu-item"
                @click="handleMenuClick('live')"
              >
                {{ showSpacesSubmenu ? 'Liv' : 'Live' }}
              </button>
            </div>

            <!-- Home Section -->
            <div class="menu-section">
              <h3 class="section-title">HOME</h3>
              <button
                v-if="can('nav.spaces')"
                class="menu-item menu-item-with-icon"
                :class="{ 'menu-item-active': showSpacesSubmenu }"
                @click="toggleSpacesSubmenu"
              >
                <span>{{ showSpacesSubmenu ? 'Spa' : 'Spaces' }}</span>
                <component
                  v-if="!showSpacesSubmenu"
                  :is="ChevronRightIcon"
                  :size="16"
                  class="chevron-icon"
                  :class="{ 'chevron-rotated': showSpacesSubmenu }"
                />
              </button>
              <button
                v-if="can('menu.events.manage')"
                class="menu-item"
                @click="handleMenuClick('events')"
              >
                {{ showSpacesSubmenu ? 'Eve' : 'Events' }}
              </button>
            </div>
          </div>

          <!-- Spaces Submenu Column -->
          <transition name="submenu-slide">
            <div v-if="showSpacesSubmenu" class="spaces-submenu">
              <div class="submenu-content">
                <h3 class="submenu-title">Spaces</h3>
                
                <!-- Search Field -->
                <div class="search-container">
                  <component :is="SearchIcon" :size="16" class="search-icon" />
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search spaces..."
                    class="search-input"
                  />
                </div>

                <!-- All Option -->
                <button 
                  class="submenu-item"
                  @click="handleSpaceClick('all')"
                >
                  All
                </button>

                <!-- Separator -->
                <div class="submenu-separator"></div>

                <!-- List of Spaces -->
                <div class="spaces-list">
                  <button
                    v-for="space in filteredSpaces"
                    :key="space.id"
                    class="submenu-item"
                    @click="handleSpaceClick(space.id)"
                  >
                    {{ space.name }}
                  </button>
                  <div v-if="filteredSpaces.length === 0 && searchQuery" class="no-results">
                    No spaces found
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import { ChevronRight, Search } from 'lucide-vue-next'

export default {
  name: 'BurgerMenu',
  props: {
    isOpen: {
      type: Boolean,
      default: false
    },
    spaces: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      showSpacesSubmenu: false,
      searchQuery: '',
      ChevronRightIcon: ChevronRight,
      SearchIcon: Search
    }
  },
  computed: {
    filteredSpaces() {
      if (!this.searchQuery) return this.spaces
      const query = this.searchQuery.toLowerCase()
      return this.spaces.filter(space => 
        space.name.toLowerCase().includes(query)
      )
    }
  },
  watch: {
    isOpen(newVal) {
      if (!newVal) {
        // Reset when menu closes
        this.showSpacesSubmenu = false
        this.searchQuery = ''
      }
    }
  },
  methods: {
    // Vérif permission RBAC (ADMIN bypass via le getter). `code` peut être un tableau (OR).
    can(code) {
      const fn = this.$store.getters['auth/can']
      return Array.isArray(code) ? code.some(fn) : fn(code)
    },
    toggleSpacesSubmenu() {
      this.showSpacesSubmenu = !this.showSpacesSubmenu
    },
    handleMenuClick(section) {
      this.$emit('menu-click', section)
      this.$emit('close')
    },
    handleSpaceClick(spaceId) {
      this.$emit('space-click', spaceId)
      this.$emit('close')
      this.showSpacesSubmenu = false
      this.searchQuery = ''
    }
  }
}
</script>

<style scoped>
/* Overlay */
.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.3s;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

/* Drawer Container */
.drawer-container {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  background: white;
  z-index: 999;
  width: 16rem;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  transition: width 0.2s ease;
}

.drawer-container.drawer-expanded {
  width: 50rem;
}

@media (max-width: 768px) {
  .drawer-container.drawer-expanded {
    width: 90vw;
  }
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.3s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(-100%);
}

/* Drawer Content */
.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drawer-header {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.drawer-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: #1f2937;
}

.drawer-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Main Menu */
.main-menu {
  width: 16rem;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
  padding: 0.5rem;
  transition: width 0.2s ease;
}

.main-menu.main-menu-collapsed {
  width: 6rem;
}

@media (max-width: 768px) {
  .main-menu.main-menu-collapsed {
    width: 4rem;
  }
}

.menu-section {
  margin-bottom: 1rem;
}

.section-title {
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #6b7280;
  text-transform: uppercase;
  margin: 0;
}

.menu-item {
  width: 100%;
  text-align: left;
  padding: 0.625rem 1rem;
  margin-bottom: 0.25rem;
  background: none;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #1f2937;
  transition: background 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-item:hover {
  background: #f3f4f6;
}

.menu-item-with-icon {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.menu-item-active {
  background: #f3f4f6;
}

.chevron-icon {
  transition: transform 0.2s;
  flex-shrink: 0;
}

.chevron-rotated {
  transform: rotate(90deg);
}

/* Spaces Submenu */
.spaces-submenu {
  flex: 1;
  background: #f9fafb;
  overflow-y: auto;
}

.submenu-slide-enter-active,
.submenu-slide-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.submenu-slide-enter-from,
.submenu-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.submenu-content {
  padding: 1rem;
}

.submenu-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.75rem 0;
  color: #1f2937;
}

/* Search */
.search-container {
  position: relative;
  margin-bottom: 0.75rem;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem 0.5rem 2.25rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #3b82f6;
}

/* Submenu Items */
.submenu-item {
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.125rem;
  background: none;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #1f2937;
  transition: background 0.15s;
}

.submenu-item:hover {
  background: white;
}

.submenu-separator {
  height: 1px;
  background: #d1d5db;
  margin: 0.5rem 0;
}

.spaces-list {
  max-height: calc(100vh - 16rem);
  overflow-y: auto;
}

.no-results {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: #6b7280;
}
</style>