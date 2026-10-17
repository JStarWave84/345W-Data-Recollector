<script setup>
/**
 * Shell de la app: sidebar + barra superior + contenido.
 *
 * El sidebar es la navegacion principal. Antes la unica forma de moverse era
 * el boton de exportar en la barra, y todo lo demas (servicios, usuarios,
 * catalogos, perfil) no existia como destino.
 *
 * El sidebar es permanente en escritorio y temporal en mobile, con un boton
 * hamburguesa para abrirlo. En la barra superior queda solo lo que depende de
 * la sesion: a que coordinacion pertenece y el rol.
 */
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  BookOpen,
  ClipboardList,
  FileSpreadsheet,
  HandHeart,
  LogOut,
  MapPin,
  User,
  Users,
} from 'lucide-vue-next'

import { useAuthStore } from '../stores/auth.js'
import { ES_MOVIL } from '../lib/plataforma.js'

const auth = useAuthStore()
const route = useRoute()

const drawer = ref(true)

async function salir() {
  await auth.signOut()
  window.location.hash = '#/login'
}
</script>

<template>
  <v-app>
    <!-- Splash mientras se resuelve la sesion. El guard del router espera a
         auth.init() antes de resolver la primera navegacion. -->
    <v-main
      v-if="!auth.initialized"
      class="d-flex align-center justify-center"
      style="min-height: 100vh"
    >
      <v-progress-circular indeterminate color="primary" size="48" />
    </v-main>

    <template v-else>
      <v-navigation-drawer
        v-if="auth.isAuthenticated"
        v-model="drawer"
        :permanent="$vuetify.display.lgAndUp"
        :temporary="$vuetify.display.mdAndDown"
        width="248"
      >
        <div class="d-flex align-center px-5 pt-5 pb-4">
          <span class="app-shell__marca">Sistema Telar</span>
        </div>

        <v-list nav density="comfortable">
          <v-list-item
            to="/actividades"
            title="Actividades"
            :prepend-icon="ClipboardList"
            :active="$route.name === 'actividades'"
          />
          <v-list-item
            v-if="!ES_MOVIL"
            to="/exportar"
            title="Exportar a Excel"
            :prepend-icon="FileSpreadsheet"
            :active="$route.name === 'exportar'"
          />

          <v-divider class="my-2" />

          <!-- El coordinador gestiona los servicios de su coordinacion. El admin
               lo hace desde Catálogos, asi que no necesita este atajo. -->
          <v-list-item
            v-if="auth.isAuthenticated && !auth.isAdmin"
            to="/servicios"
            title="Servicios"
            :prepend-icon="HandHeart"
            :active="$route.name === 'servicios'"
          />

          <template v-if="auth.isAdmin">
            <v-list-item
              to="/usuarios"
              title="Usuarios"
              :prepend-icon="Users"
              :active="$route.name === 'usuarios'"
            />
            <v-list-item
              to="/catalogos"
              title="Catálogos"
              :prepend-icon="BookOpen"
              :active="$route.name === 'catalogos'"
            />
          </template>

          <v-divider class="my-2" />

          <v-list-item
            to="/perfil"
            title="Perfil"
            :prepend-icon="User"
            :active="$route.name === 'perfil'"
          />
        </v-list>
      </v-navigation-drawer>

      <v-app-bar v-if="auth.isAuthenticated" height="52" flat>
        <v-app-bar-nav-icon
          v-if="$vuetify.display.mdAndDown"
          class="ml-2"
          @click="drawer = !drawer"
        />
        <v-app-bar-title class="app-shell__titulo">
          <!-- En un celular el nombre de la app ya esta en el drawer y en el
               encabezado de cada pantalla, asi que la barra le cede el ancho a
               la coordinacion: es el dato que no se puede saber de otra parte y
               el que mas texto necesita. Sin esto la marca, el separador y la
               coordinacion suman mas que el espacio disponible y el chip de rol
               queda pisado. -->
          <template v-if="!$vuetify.display.smAndDown">
            <span class="app-shell__marca">Sistema Telar</span>
            <span class="app-shell__sep" aria-hidden="true">/</span>
          </template>
          <span class="app-shell__coord">
            <v-icon :icon="MapPin" size="13" class="mr-1" />
            {{
              auth.coordinacion ??
              (auth.isAdmin ? 'Todas las coordinaciones' : 'Sin coordinación')
            }}
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
            :icon="LogOut"
            variant="text"
            size="small"
            title="Cerrar sesión"
            @click="salir"
          />
        </template>
      </v-app-bar>

      <v-main>
        <router-view />
      </v-main>
    </template>
  </v-app>
</template>

<style scoped>
.app-shell__marca {
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--tinta);
  font-size: 0.9375rem;
}

.app-shell__titulo {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.9375rem;
  /* Sin esto los hijos no bajan de su ancho de contenido (min-width auto en
     flex) y la barra se sale de la pantalla en vez de recortar. */
  min-width: 0;
}

.app-shell__sep {
  color: var(--tinta-4);
}

.app-shell__coord {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--tinta-3);
  display: inline-flex;
  align-items: center;
  /* La coordinacion es lo que mas texto puede tener ("Coordinacion Eje de
     Aislamiento Agua"), asi que es la que cede: se recorta con puntos suspensivos
     en vez de empujar la marca y el chip de rol fuera de la barra. Importa
     porque en esta app cargar una jornada en la coordinacion equivocada es el
     error mas caro, asi que el nombre tiene que seguir siendo legible. */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* El icono no se deforma al recortar el texto que lo sigue. */
.app-shell__coord :deep(.v-icon) {
  flex: 0 0 auto;
}
</style>
