<template>
  <div :class="['p-3', className]" data-slot="calendar">
    <!-- Header / Month navigation -->
    <div class="flex justify-center pt-1 relative items-center w-full mb-4">
      <button
        type="button"
        class="absolute left-1 size-7 bg-transparent p-0 opacity-50 hover:opacity-100 border rounded-md"
        @click="prevMonth"
        aria-label="Previous month"
      >
        <ChevronLeft class="w-4 h-4 mx-auto" />
      </button>

      <div class="text-sm font-medium">
        {{ monthLabel }}
      </div>

      <button
        type="button"
        class="absolute right-1 size-7 bg-transparent p-0 opacity-50 hover:opacity-100 border rounded-md"
        @click="nextMonth"
        aria-label="Next month"
      >
        <ChevronRight class="w-4 h-4 mx-auto" />
      </button>
    </div>

    <!-- Weekday header -->
    <div class="flex">
      <div
        v-for="(d, idx) in weekdayLabels"
        :key="idx"
        class="text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] text-center"
      >
        {{ d }}
      </div>
    </div>

    <!-- Days grid -->
    <div class="flex flex-col gap-2 mt-2">
      <div v-for="(week, wIdx) in weeks" :key="wIdx" class="flex w-full">
        <div
          v-for="day in week"
          :key="day.key"
          class="relative p-0 text-center text-sm"
        >
          <button
            type="button"
            class="size-8 p-0 font-normal rounded-md hover:bg-accent"
            :class="dayButtonClass(day)"
            :disabled="day.isDisabled"
            @click="selectDay(day)"
          >
            {{ day.date.getDate() }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}
function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}
function isSameDay(a, b) {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default {
  name: 'Calendar',

  components: { ChevronLeft, ChevronRight },

  props: {
    className: { type: String, default: '' },

    // API proche de react-day-picker utilisé dans ton code
    mode: { type: String, default: 'single' }, // 'single' | 'range'
    selected: { type: [Date, Object], default: undefined }, // Date (single) ou { from: Date, to: Date } (range)
    showOutsideDays: { type: Boolean, default: true },
    weekStartsOn: { type: Number, default: 1 }, // 1 = Monday (FR). 0 = Sunday.
    disabled: { type: [Function, Boolean], default: false }, // function(date)->bool ou bool
    month: { type: Date, default: undefined }, // mode contrôlé (optionnel)
    defaultMonth: { type: Date, default: () => new Date() }, // mode non contrôlé
  },

  emits: ['select', 'update:month', 'monthChange'],

  data() {
    return {
      internalMonth: startOfMonth(this.defaultMonth),
    }
  },

  computed: {
    isMonthControlled() {
      return this.month instanceof Date
    },

    currentMonth() {
      return this.isMonthControlled ? startOfMonth(this.month) : this.internalMonth
    },

    monthLabel() {
      return this.currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    },

    weekdayLabels() {
      // Labels courts, alignés sur weekStartsOn
      const base = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
      const start = this.weekStartsOn % 7
      return base.slice(start).concat(base.slice(0, start))
    },

    // tableau de semaines -> tableau de 7 jours
    weeks() {
      const mStart = startOfMonth(this.currentMonth)
      const mEnd = endOfMonth(this.currentMonth)

      // day index (0-6) respecting weekStartsOn
      const firstDay = new Date(mStart)
      const rawDow = firstDay.getDay()
      const offset = (rawDow - this.weekStartsOn + 7) % 7

      // start date of grid
      const gridStart = new Date(mStart)
      gridStart.setDate(mStart.getDate() - offset)

      // build 6 weeks (42 cells) for stable layout
      const days = []
      for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart)
        d.setDate(gridStart.getDate() + i)

        const isOutside = d.getMonth() !== this.currentMonth.getMonth()
        const isDisabled =
          typeof this.disabled === 'function'
            ? !!this.disabled(d)
            : !!this.disabled

        days.push({
          key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
          date: d,
          isOutside,
          isDisabled: isDisabled || (!this.showOutsideDays && isOutside),
        })
      }

      // chunk by 7
      const weeks = []
      for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7))
      }

      // option: si showOutsideDays=false, on “désactive” visuellement les outside (déjà fait),
      // mais on garde la grille stable.
      return weeks
    },

    selectedSingle() {
      return this.mode === 'single' && this.selected instanceof Date ? this.selected : undefined
    },

    selectedRange() {
      if (this.mode !== 'range' || !this.selected || this.selected instanceof Date) return null
      return this.selected
    },
  },

  methods: {
    setMonth(date) {
      const next = startOfMonth(date)
      if (!this.isMonthControlled) this.internalMonth = next
      this.$emit('update:month', next)
      this.$emit('monthChange', next)
    },

    prevMonth() {
      this.setMonth(addMonths(this.currentMonth, -1))
    },

    nextMonth() {
      this.setMonth(addMonths(this.currentMonth, 1))
    },

    dayButtonClass(day) {
      const classes = []

      if (day.isOutside) {
        classes.push('text-muted-foreground/50')
      }

      if (this.mode === 'single') {
        if (this.selectedSingle && isSameDay(day.date, this.selectedSingle)) {
          classes.push('bg-primary text-primary-foreground hover:bg-primary')
        }
      }

      // range basique (si jamais utilisé)
      if (this.mode === 'range' && this.selectedRange) {
        const from = this.selectedRange.from
        const to = this.selectedRange.to
        if (from && isSameDay(day.date, from)) classes.push('bg-primary text-primary-foreground')
        if (to && isSameDay(day.date, to)) classes.push('bg-primary text-primary-foreground')
        if (from && to && day.date >= from && day.date <= to) classes.push('bg-accent')
      }

      return classes.join(' ')
    },

    selectDay(day) {
      if (day.isDisabled) return

      if (this.mode === 'single') {
        this.$emit('select', day.date)
        return
      }

      // range: très basique (1er clic = from, 2e clic = to)
      if (this.mode === 'range') {
        const current = this.selectedRange || { from: null, to: null }
        if (!current.from || (current.from && current.to)) {
          this.$emit('select', { from: day.date, to: null })
        } else {
          const from = current.from
          const to = day.date >= from ? day.date : from
          const fixedFrom = day.date >= from ? from : day.date
          this.$emit('select', { from: fixedFrom, to })
        }
      }
    },
  },
}
</script>