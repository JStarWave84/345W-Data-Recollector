import { createVuetify } from 'vuetify'
import { es } from 'vuetify/locale'

import { aliases, lucide } from './iconset-lucide.js'

import 'vuetify/styles'
import '../assets/main.css'

// Los valores vienen de los tokens de main.css, replicados aca porque Vuetify
// necesita hex en JS. Si se cambia uno, hay que cambiar el otro.
const AZUL = '#0b4f9c'

export default createVuetify({
  icons: {
    // Los aliases van como componentes lucide (ver iconset-lucide.js), asi que
    // `defaultSet` solo se usa para el improbable string sin resolver.
    defaultSet: 'lucide',
    aliases,
    sets: { lucide },
  },
  locale: {
    locale: 'es',
    fallback: 'en',
    messages: { es },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#fbfaf7',
          surface: '#ffffff',
          'surface-variant': '#f5f4f0',
          'on-surface': '#16202e',
          primary: AZUL,
          'on-primary': '#ffffff',
          secondary: '#45505f',
          error: '#a3231f',
          info: '#0f6b5c',
          success: '#2f5d2f',
          warning: '#9a5b12',
          'on-background': '#16202e',
        },
        variables: {
          // Alto y radio van por componente; el resto se resuelve desde el CSS.
          'border-color': '#dedbd3',
          'high-emphasis-opacity': 0.87,
          'medium-emphasis-opacity': 0.62,
          'disabled-opacity': 0.38,
        },
      },
    },
  },
  defaults: {
    VTextField: { variant: 'outlined', density: 'compact', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'compact', color: 'primary' },
    VSelect: { variant: 'outlined', density: 'compact', color: 'primary' },
    VAutocomplete: { variant: 'outlined', density: 'compact', color: 'primary' },
    VCombobox: { variant: 'outlined', density: 'compact', color: 'primary' },
    VCard: { elevation: 0 },
    VBtn: { elevation: 0 },
    VDialog: { scrollable: true },
  },
})
