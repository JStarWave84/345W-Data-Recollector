<script setup>
/**
 * Gestion de servicios del coordinador.
 *
 * El coordinador puede hacer CRUD de los servicios de SU coordinacion (lo
 * permite la migracion 012). No ve ni puede tocar los de otras coordinaciones:
 * la RLS lo bloquea, y ademas no tendria sentido ofrecer un servicio de otra
 * coordinacion en una jornada propia.
 *
 * Un servicio se puede desactivar en vez de borrarse: las jornadas ya cargadas
 * lo referencian, y borrarlo dejaria esas filas con un servicio que ya no
 * existe. Desactivar lo oculta de los selectores pero conserva el historial.
 */
import { computed, onMounted, ref } from 'vue'
import { CircleCheck, CircleOff, HandHeart, Pencil, Plus, Trash2 } from 'lucide-vue-next'

import { supabase } from '../lib/supabase.js'
import { CATALOGO, validar } from '../lib/esquemas.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

const servicios = ref([])
const cargando = ref(true)
const error = ref(null)

const dialogo = ref(false)
const editando = ref(null)
const nombre = ref('')
const guardando = ref(false)

const coordinacionId = computed(() => auth.profile?.coordinacion_id ?? null)
const coordinacionNombre = computed(() => auth.coordinacion ?? '—')

async function cargar() {
  cargando.value = true
  error.value = null
  const { data, error: e } = await supabase
    .from('servicios')
    .select('id, nombre, activo, updated_at')
    .eq('coordinacion_id', coordinacionId.value)
    .order('nombre')
  cargando.value = false
  if (e) {
    error.value = e.message
    return
  }
  servicios.value = data ?? []
}

function abrirNuevo() {
  editando.value = null
  nombre.value = ''
  dialogo.value = true
}

function abrirEditar(s) {
  editando.value = s
  nombre.value = s.nombre
  dialogo.value = true
}

async function guardar() {
  const problema = validar(CATALOGO, { nombre: nombre.value })
  if (problema) {
    error.value = problema
    return
  }
  // Ya recortado, y vacio en null en vez de cadena vacia.
  const { nombre: limpio } = CATALOGO.parse({ nombre: nombre.value })
  guardando.value = true
  error.value = null

  if (editando.value) {
    const { error: e } = await supabase
      .from('servicios')
      .update({ nombre: limpio })
      .eq('id', editando.value.id)
    if (e) error.value = e.message
  } else {
    const { error: e } = await supabase
      .from('servicios')
      .insert({ nombre: limpio, coordinacion_id: coordinacionId.value })
    if (e) error.value = e.message
  }

  guardando.value = false
  if (!error.value) {
    dialogo.value = false
    await cargar()
  }
}

async function alternarActivo(s) {
  const { error: e } = await supabase
    .from('servicios')
    .update({ activo: !s.activo })
    .eq('id', s.id)
  if (e) {
    error.value = e.message
    return
  }
  await cargar()
}

async function borrar(s) {
  const { error: e } = await supabase.from('servicios').delete().eq('id', s.id)
  if (e) {
    error.value = e.message
    return
  }
  await cargar()
}

onMounted(cargar)
</script>

<template>
  <v-container fluid class="py-6" style="max-width: 900px">
    <header class="mb-6">
      <span class="sobreline">Mi coordinación</span>
      <h1 class="text-h4 mt-1">Servicios</h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Servicios que se pueden cargar en las jornadas de
        <strong>{{ coordinacionNombre }}</strong>.
      </p>
    </header>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
      {{ error }}
    </v-alert>

    <v-card variant="outlined">
      <v-card-title class="d-flex align-center justify-space-between px-6 pt-5">
        <span class="text-h6">Servicios de {{ coordinacionNombre }}</span>
        <v-btn
          color="primary"
          variant="flat"
          :prepend-icon="Plus"
          @click="abrirNuevo"
        >
          Agregar servicio
        </v-btn>
      </v-card-title>

      <v-card-text class="px-6 pb-5">
        <v-progress-linear v-if="cargando" indeterminate class="mb-4" />

        <v-list v-else-if="servicios.length" lines="one">
          <v-list-item v-for="s in servicios" :key="s.id">
            <template #prepend>
              <v-icon
                :icon="HandHeart"
                :color="s.activo ? 'primary' : 'medium-emphasis'"
                class="mr-2"
              />
            </template>

            <v-list-item-title :class="{ 'text-medium-emphasis': !s.activo }">
              {{ s.nombre }}
              <v-chip v-if="!s.activo" size="x-small" variant="tonal" class="ml-2">
                Inactivo
              </v-chip>
            </v-list-item-title>

            <template #append>
              <v-btn
                :icon="Pencil"
                variant="text"
                size="small"
                title="Editar"
                @click="abrirEditar(s)"
              />
              <v-btn
                variant="text"
                size="small"
                :title="s.activo ? 'Desactivar' : 'Activar'"
                @click="alternarActivo(s)"
              >
                <v-icon :icon="s.activo ? CircleOff : CircleCheck" :color="s.activo ? 'warning' : 'success'" />
              </v-btn>
              <v-btn
                :icon="Trash2"
                variant="text"
                size="small"
                title="Borrar"
                @click="borrar(s)"
              />
            </template>
          </v-list-item>
        </v-list>

        <p v-else class="text-body-2 text-medium-emphasis">
          Todavía no hay servicios. Agregá el primero con el botón de arriba.
        </p>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialogo" max-width="480">
      <v-card>
        <v-card-title class="px-6 pt-5">
          {{ editando ? 'Editar servicio' : 'Nuevo servicio' }}
        </v-card-title>
        <v-card-text class="px-6 pt-4">
          <v-text-field
            v-model="nombre"
            label="Nombre del servicio"
            placeholder="Ej. Consulta individual"
            autofocus
            @keyup.enter="guardar"
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="dialogo = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardando" @click="guardar">
            Guardar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
