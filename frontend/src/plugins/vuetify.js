// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Vuetify
import { createVuetify } from 'vuetify'

// Thème DataFriday — palette extraite de la maquette AnalyseView
const dataFridayLight = {
  dark: false,
  colors: {
    primary: '#ff3131',      // rouge DataFriday — boutons actifs, badges, actions principales
    secondary: '#5B8DEF',    // bleu — liens, légendes
    error: '#FF6E4A',        // rouge-orangé — cost, food
    warning: '#FFB300',      // ambre — revenue
    success: '#66BB6A',      // vert — margin, beverage
    info: '#AB47BC',         // violet — transaction rate
    background: '#F5F5F5',   // fond page
    surface: '#FFFFFF',      // cartes

    // Couleurs custom AnalyseView
    'cost-bg': '#FFF3F0',
    'cost-accent': '#FF6E4A',
    'revenue-bg': '#FFF8E1',
    'revenue-accent': '#FFB300',
    'margin-bg': '#E8F5E9',
    'margin-accent': '#66BB6A',
    'trans-rate-bg': '#F3E5F5',
    'trans-rate-accent': '#AB47BC',

    'food': '#FF6E4A',
    'beverage': '#66BB6A',
    'beer': '#FFA726',
  },
}

// Thème dark — inspiré du dark mode React (versionReact `globals.css`) :
// surfaces neutres très sombres (oklch ≈ 0.145), bordures oklch ≈ 0.269,
// foreground quasi-blanc. Les accents conservent la palette DataFriday.
const dataFridayDark = {
  dark: true,
  colors: {
    primary: '#9F7AFF',
    secondary: '#7DA8F5',
    error: '#FF8A6E',
    warning: '#FFC94D',
    success: '#81C784',
    info: '#BA68C8',
    // ≈ oklch(0.145 0 0) → #252525 (background page) /
    //   oklch(0.205 0 0) → #353535 (sidebar) — on prend des gris purs.
    background: '#111827',
    surface: '#1f2937',
    'surface-bright': '#263548',
    'surface-light': '#263548',
    'surface-variant': '#2d3f55',
    'on-surface-variant': '#E8E8E8',
    'on-background': '#FAFAFA',
    'on-surface': '#FAFAFA',

    'cost-bg': '#3A1F1A',
    'cost-accent': '#FF8A6E',
    'revenue-bg': '#3A2E14',
    'revenue-accent': '#FFC94D',
    'margin-bg': '#1A2E1F',
    'margin-accent': '#81C784',
    'trans-rate-bg': '#2E1A33',
    'trans-rate-accent': '#BA68C8',

    'food': '#FF8A6E',
    'beverage': '#81C784',
    'beer': '#FFB85C',
  },
  variables: {
    'border-color': '#2d3f55',
    'border-opacity': 1,
    'theme-on-surface': '250, 250, 250',
  },
}

// Restore preferred theme from localStorage if present.
const savedTheme =
  (typeof window !== 'undefined' && window.localStorage?.getItem('datafriday:theme')) ||
  'dataFridayLight'

// Synchronise la classe `.dark` sur <html> dès le boot — comme le
// `ThemeProvider` React. Permet aux composants portés (Tailwind `dark:`)
// et aux overrides globaux d'utiliser le sélecteur `.dark`.
if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', savedTheme === 'dataFridayDark')
}

export default createVuetify({
  theme: {
    defaultTheme: ['dataFridayLight', 'dataFridayDark'].includes(savedTheme)
      ? savedTheme
      : 'dataFridayLight',
    themes: { dataFridayLight, dataFridayDark },
  },
})
