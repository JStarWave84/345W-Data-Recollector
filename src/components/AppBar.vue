<script setup>
/**
 * Barra superior de la app. Es institucional a proposito: muestra a que
 * coordinacion pertenece la sesion, porque en una ONG con varias coordinaciones
 * el error mas caro es que alguien cargue una jornada en la coordinacion
 * equivocada sin darse cuenta.
 */
import { FileSpreadsheet, LogOut, MapPin } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '../stores/auth.js'

const route = useRoute()

const auth = useAuthStore()
const router = useRouter()

async function salir() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <v-app-bar height="52" flat>
    <v-app-bar-title class="app-bar__titulo">
      <span class="app-bar__marca">Sistema Telar</span>
      <span class="app-bar__sep" aria-hidden="true">/</span>
      <span class="app-bar__coord">
        <v-icon :icon="MapPin" size="13" class="mr-1" />
        {{ auth.coordinacion ?? (auth.isAdmin ? 'Todas las coordinaciones' : 'Sin coordinación') }}
      </span>
    </v-app-bar-title>

    <template #append>
      <v-chip
        v-if="auth.profile"
        variant="tonal"
        size="small"
        class="mr-3 text-uppercase font-weight-bold"
        style="letter-spacing: 0.05em; font-size: 0.6875rem"
      >
        {{ auth.isAdmin ? 'Admin' : 'Coordinador' }}
      </v-chip>
      <v-btn
        :icon="FileSpreadsheet"
        variant="text"
        size="small"
        title="Exportar a Excel"
        :to="{ name: 'exportar' }"
        :active="route.name === 'exportar'"
      />
      <v-btn
        :icon="LogOut"
        variant="text"
        size="small"
        title="Cerrar sesión"
        @click="salir"
      />
    </template>
  </v-app-bar>
</template>

<style scoped>
.app-bar__titulo {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.9375rem;
}

.app-bar__marca {
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--tinta);
}

.app-bar__sep {
  color: var(--tinta-4);
}

.app-bar__coord {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--tinta-3);
  display: inline-flex;
  align-items: center;
}
</style>
