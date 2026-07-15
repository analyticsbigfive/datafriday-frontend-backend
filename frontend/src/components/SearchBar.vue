<template>
  <div class="search-container">
    <div class="search-input-wrapper">
      <input 
        v-model="searchQuery"
        @input="handleInput"
        @focus="showSuggestions = true"
        @blur="handleBlur"
        @keydown="handleKeyDown"
        type="text" 
        placeholder="Search inventory/menu..."
        class="search-input"
      />
      
      <!-- Suggestions Dropdown -->
      <div v-if="showSuggestions && filteredSuggestions.length > 0" class="suggestions-dropdown">
        <button
          v-for="(suggestion, index) in filteredSuggestions"
          :key="index"
          class="suggestion-item"
          @mousedown="handleSuggestionClick(suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </div>
    
    <!-- Search Actions -->
    <div class="search-actions">
      <button class="icon-btn" @click="$emit('show-results')" aria-label="Show results">
        <component :is="SearchIcon" :size="16" />
      </button>
      <button class="icon-btn" @click="handleClear" v-if="searchQuery" aria-label="Clear search">
        <component :is="XIcon" :size="16" />
      </button>
      <button class="icon-btn" @click="$emit('refresh')" aria-label="Refresh">
        <component :is="RefreshIcon" :size="16" />
      </button>
    </div>
  </div>
</template>

<script>
import { Search, X, RotateCcw } from 'lucide-vue-next'

export default {
  name: 'SearchBar',
  components: {
    SearchIcon: Search,
    XIcon: X,
    RefreshIcon: RotateCcw
  },
  props: {
    suggestions: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      searchQuery: '',
      showSuggestions: false
    }
  },
  computed: {
    filteredSuggestions() {
      if (!this.searchQuery || this.searchQuery.length < 2) {
        return []
      }
      
      const query = this.searchQuery.toLowerCase()
      return this.suggestions
        .filter(s => s.toLowerCase().includes(query))
        .slice(0, 10)
    }
  },
  methods: {
    handleInput() {
      this.$emit('search', this.searchQuery)
      this.showSuggestions = true
    },
    
    handleBlur() {
      // Delay to allow click on suggestions
      setTimeout(() => {
        this.showSuggestions = false
      }, 200)
    },
    
    handleKeyDown(e) {
      if (e.key === 'Enter') {
        this.$emit('search', this.searchQuery)
        this.$emit('show-results')
        this.showSuggestions = false
      } else if (e.key === 'Escape') {
        this.searchQuery = ''
        this.showSuggestions = false
        this.$emit('search', '')
      }
    },
    
    handleSuggestionClick(suggestion) {
      this.searchQuery = suggestion
      this.$emit('search', suggestion)
      this.$emit('show-results')
      this.showSuggestions = false
    },
    
    handleClear() {
      this.searchQuery = ''
      this.$emit('search', '')
      this.showSuggestions = false
    }
  }
}
</script>

<style scoped>
.search-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-input-wrapper {
  position: relative;
  flex: 1;
}

.search-input {
  width: 100%;
  height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid #000;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  max-height: 15rem;
  overflow-y: auto;
  z-index: 50;
}

.suggestion-item {
  width: 100%;
  padding: 0.5rem 0.75rem;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: #374151;
  transition: background 0.2s;
}

.suggestion-item:hover {
  background: #f3f4f6;
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.icon-btn {
  background: none;
  border: 1px solid #d1d5db;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.375rem;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #f3f4f6;
  color: #1f2937;
  border-color: #9ca3af;
}
</style>
