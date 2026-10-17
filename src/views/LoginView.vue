<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// Componentes lucide: se pasan tal cual a :icon y Vuetify los renderiza con
// VComponentIcon. No hay que traducirlos a paths SVG.
import { Mail, EyeOff, Eye, Lock } from 'lucide-vue-next'

import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const mostrarPassword = ref(false)
const error = ref(null)
const cargando = ref(false)
const form = ref(null)

const requerido = (v) => !!v || 'Obligatorio'

async function entrar() {
  // Sin esto, un Enter con los campos vacíos dispara una request a Supabase.
  const { valid } = await form.value.validate()
  if (!valid) return

  error.value = null
  cargando.value = true
  try {
    await auth.signIn(email.value.trim(), password.value)
    const destino =
      typeof route.query.redirect === 'string' ? route.query.redirect : '/actividades'
    await router.push(destino)
  } catch (e) {
    // supabase-js devuelve el mensaje en ingles; la app es en espanol.
    error.value =
      e.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : e.message
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <v-main class="d-flex align-center justify-center pa-4" style="min-height: 100vh">
    <v-card width="440" class="pa-2" rounded="lg">
      <v-card-item>
        <v-card-title class="text-h5">Sistema Telar</v-card-title>
        <v-card-subtitle>Iniciá sesión para cargar atenciones</v-card-subtitle>
      </v-card-item>

      <v-card-text>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="comfortable"
          class="mb-4"
          :text="error"
        />

        <v-form ref="form" @submit.prevent="entrar">
          <v-text-field
            v-model="email"
            label="Correo"
            type="email"
            autocomplete="username"
            :rules="[requerido]"
            validate-on="blur lazy"
            :prepend-inner-icon="Mail"
            class="mb-2"
          />

          <v-text-field
            v-model="password"
            label="Contraseña"
            :type="mostrarPassword ? 'text' : 'password'"
            autocomplete="current-password"
            :append-inner-icon="mostrarPassword ? EyeOff : Eye"
            :rules="[requerido]"
            validate-on="blur lazy"
            :prepend-inner-icon="Lock"
            @click:append-inner="mostrarPassword = !mostrarPassword"
          />

          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            block
            size="large"
            class="mt-2"
            :loading="cargando"
          >
            Ingresar
          </v-btn>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-text class="text-caption text-medium-emphasis">
        El rol y la coordinación los asigna un administrador. Si no tenés cuenta,
        pedí que te creen una.
      </v-card-text>
    </v-card>
  </v-main>
</template>
