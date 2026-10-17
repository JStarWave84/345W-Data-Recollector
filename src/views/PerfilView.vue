<script setup>
/**
 * Perfil del usuario.
 *
 * Dos cosas se pueden cambiar desde aca: el nombre (se guarda en
 * public.profiles, que es donde la app lo lee) y la contraseña (la maneja
 * Supabase Auth directamente). El rol y la coordinacion no: los asigna un admin
 * desde la vista de usuarios.
 */
import { computed, ref } from 'vue'
import { Check, KeyRound, User } from 'lucide-vue-next'

import { supabase } from '../lib/supabase.js'
import { CAMBIO_CLAVE, validar } from '../lib/esquemas.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

const nombre = ref(auth.profile?.nombre ?? '')
const guardandoNombre = ref(false)
const nombreOk = ref(false)

const clave = ref('')
const clave2 = ref('')
const cambiandoClave = ref(false)
const claveOk = ref(false)
const error = ref(null)

const rol = computed(() => (auth.isAdmin ? 'Admin' : 'Coordinador'))

async function guardarNombre() {
  const limpio = nombre.value.trim()
  guardandoNombre.value = true
  error.value = null
  const { error: e } = await supabase
    .from('profiles')
    .update({ nombre: limpio || null })
    .eq('id', auth.user.id)
  guardandoNombre.value = false
  if (e) {
    error.value = e.message
    return
  }
  // El store tiene el perfil cacheado: se vuelve a leer para que el nombre
  // nuevo aparezca en la lista de arriba sin tener que recargar la pagina.
  await auth.refreshProfile()
  nombreOk.value = true
  setTimeout(() => (nombreOk.value = false), 2000)
}

/**
 * Las dos reglas del campo de contraseña, para que el error salga mientras se
 * escribe y no solo al apretar el botón.
 *
 * `reglaRepetir` no puede usar `CAMBIO_CLAVE` entero porque miden cosas
 * distintas: la primera mira el largo de una contraseña suelta, la segunda
 * compara las dos entre sí.
 */
const reglaClave = (valor) => validar(CAMBIO_CLAVE, { clave: valor, repetir: valor }) ?? true
const reglaRepetir = (valor) =>
  valor !== clave.value ? 'Las contraseñas no coinciden.' : true

async function cambiarClave() {
  const problema = validar(CAMBIO_CLAVE, { clave: clave.value, repetir: clave2.value })
  if (problema) {
    error.value = problema
    return
  }
  cambiandoClave.value = true
  error.value = null
  const { error: e } = await supabase.auth.updateUser({ password: clave.value })
  cambiandoClave.value = false
  if (e) {
    error.value = e.message
    return
  }
  clave.value = ''
  clave2.value = ''
  claveOk.value = true
  setTimeout(() => (claveOk.value = false), 2500)
}
</script>

<template>
  <v-container fluid class="py-6" style="max-width: 640px">
    <header class="mb-6">
      <span class="sobreline">Tu cuenta</span>
      <h1 class="text-h4 mt-1">Perfil</h1>
    </header>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
      {{ error }}
    </v-alert>

    <v-card variant="outlined" class="mb-6">
      <v-card-title class="px-6 pt-5">
        <v-icon :icon="User" class="mr-2" />
        <span class="text-h6">Datos de la cuenta</span>
      </v-card-title>
      <v-card-text class="px-6 pb-5">
        <v-list lines="one" class="mb-4">
          <v-list-item>
            <v-list-item-title class="text-body-2 text-medium-emphasis">Email</v-list-item-title>
            <v-list-item-subtitle>{{ auth.user?.email }}</v-list-item-subtitle>
          </v-list-item>
          <v-list-item>
            <v-list-item-title class="text-body-2 text-medium-emphasis">Nombre</v-list-item-title>
            <v-list-item-subtitle :class="auth.profile?.nombre ? '' : 'text-medium-emphasis'">
              {{ auth.profile?.nombre || 'Sin nombre' }}
            </v-list-item-subtitle>
          </v-list-item>
          <v-list-item>
            <v-list-item-title class="text-body-2 text-medium-emphasis">Rol</v-list-item-title>
            <v-list-item-subtitle>{{ rol }}</v-list-item-subtitle>
          </v-list-item>
          <v-list-item>
            <v-list-item-title class="text-body-2 text-medium-emphasis">Coordinación</v-list-item-title>
            <v-list-item-subtitle>
              {{ auth.coordinacion ?? (auth.isAdmin ? 'Todas' : 'Sin coordinación') }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <v-text-field
          v-model="nombre"
          label="Nombre"
          placeholder="Tu nombre"
          class="mb-3"
        />
        <v-btn
          color="primary"
          variant="flat"
          :loading="guardandoNombre"
          @click="guardarNombre"
        >
          <v-icon v-if="nombreOk" :icon="Check" size="16" class="mr-1" />
          {{ nombreOk ? 'Guardado' : 'Guardar nombre' }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card variant="outlined">
      <v-card-title class="px-6 pt-5">
        <v-icon :icon="KeyRound" class="mr-2" />
        <span class="text-h6">Cambiar contraseña</span>
      </v-card-title>
      <v-card-text class="px-6 pb-5">
        <v-text-field
          v-model="clave"
          label="Contraseña nueva"
          type="password"
          class="mb-3"
          :rules="[reglaClave]"
          validate-on="input lazy"
        />
        <v-text-field
          v-model="clave2"
          label="Repetir contraseña nueva"
          type="password"
          class="mb-3"
          :rules="[reglaRepetir]"
          validate-on="input lazy"
          @keyup.enter="cambiarClave"
        />
        <v-btn
          color="primary"
          variant="flat"
          :loading="cambiandoClave"
          @click="cambiarClave"
        >
          <v-icon v-if="claveOk" :icon="Check" size="16" class="mr-1" />
          {{ claveOk ? 'Contraseña actualizada' : 'Cambiar contraseña' }}
        </v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>
