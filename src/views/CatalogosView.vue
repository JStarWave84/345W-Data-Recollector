<script setup>
/**
 * Gestion de catalogos (solo admin).
 *
 * Los cuatro catalogos que la app usa como selectores: tipos de establecimiento,
 * grupos de atencion, fuentes de financiamiento y coordinaciones. La RLS ya le
 * da al admin permiso de escritura sobre todos; esta vista es la interfaz.
 *
 * Se desactiva en vez de borrar cuando el catalogo ya se uso en una jornada:
 * borrarlo dejaria filas con un valor que ya no existe. Las coordinaciones no
 * se desactivan porque son el eje de aislamiento, no un selector.
 */
import { computed, onMounted, ref } from 'vue'
import {
  Building2,
  CircleCheck,
  CircleOff,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
  Wallet,
} from 'lucide-vue-next'

import { supabase } from '../lib/supabase.js'
import { CATALOGO, validar } from '../lib/esquemas.js'

const CATALOGOS = [
  {
    clave: 'tipos',
    tabla: 'tipos_establecimiento',
    titulo: 'Tipos de establecimiento',
    icono: Building2,
    conDescripcion: false,
  },
  {
    clave: 'grupos',
    tabla: 'grupos_atencion',
    titulo: 'Grupos de atención',
    icono: Users,
    conDescripcion: false,
  },
  {
    clave: 'fuentes',
    tabla: 'fuentes_financiamiento',
    titulo: 'Fuentes de financiamiento',
    icono: Wallet,
    conDescripcion: false,
  },
  {
    clave: 'coordinaciones',
    tabla: 'coordinaciones',
    titulo: 'Coordinaciones',
    icono: MapPin,
    conDescripcion: true,
  },
]

const tab = ref(0)
const datos = ref({})
const cargando = ref(true)
const error = ref(null)

const dialogo = ref(false)
const editando = ref(null)
const nombre = ref('')
const descripcion = ref('')
const guardando = ref(false)

const catalogo = computed(() => CATALOGOS[tab.value])
const items = computed(() => datos.value[catalogo.value.clave] ?? [])

async function cargar() {
  cargando.value = true
  error.value = null
  const resultados = await Promise.all(
    CATALOGOS.map(async (c) => {
      const { data, error: e } = await supabase
        .from(c.tabla)
        .select('*')
        .order('nombre')
      return { clave: c.clave, data: data ?? [], error: e }
    }),
  )
  cargando.value = false
  for (const r of resultados) {
    if (r.error) {
      error.value = r.error.message
      return
    }
    datos.value = { ...datos.value, [r.clave]: r.data }
  }
}

function abrirNuevo() {
  editando.value = null
  nombre.value = ''
  descripcion.value = ''
  dialogo.value = true
}

function abrirEditar(item) {
  editando.value = item
  nombre.value = item.nombre
  descripcion.value = item.descripcion ?? ''
  dialogo.value = true
}

async function guardar() {
  const problema = validar(CATALOGO, {
    nombre: nombre.value,
    descripcion: descripcion.value,
  })
  if (problema) {
    error.value = problema
    return
  }
  // `parse` no tira: ya se sabe que paso el `safeParse`. Deja el nombre y la
  // descripcion ya recortados y con los vacios en null, que es lo que espera la
  // columna.
  const { nombre: limpio, descripcion: desc } = CATALOGO.parse({
    nombre: nombre.value,
    descripcion: descripcion.value,
  })

  guardando.value = true
  error.value = null
  const c = catalogo.value

  if (editando.value) {
    const cambios = { nombre: limpio }
    if (c.conDescripcion) cambios.descripcion = desc
    const { error: e } = await supabase.from(c.tabla).update(cambios).eq('id', editando.value.id)
    if (e) error.value = e.message
  } else {
    const cambios = { nombre: limpio }
    if (c.conDescripcion) cambios.descripcion = desc
    const { error: e } = await supabase.from(c.tabla).insert(cambios)
    if (e) error.value = e.message
  }

  guardando.value = false
  if (!error.value) {
    dialogo.value = false
    await cargar()
  }
}

async function alternarActivo(item) {
  const c = catalogo.value
  if (c.clave === 'coordinaciones') return
  const campo = c.clave === 'coordinaciones' ? 'activa' : 'activo'
  const { error: e } = await supabase
    .from(c.tabla)
    .update({ [campo]: !item[campo] })
    .eq('id', item.id)
  if (e) {
    error.value = e.message
    return
  }
  await cargar()
}

async function borrar(item) {
  const c = catalogo.value
  const { error: e } = await supabase.from(c.tabla).delete().eq('id', item.id)
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
      <span class="sobreline">Administración</span>
      <h1 class="text-h4 mt-1">Catálogos</h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Los valores que aparecen en los selectores de la app. Se desactivan en vez
        de borrarse cuando ya se usaron en una jornada.
      </p>
    </header>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
      {{ error }}
    </v-alert>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab v-for="c in CATALOGOS" :key="c.clave">
        <v-icon :icon="c.icono" size="16" class="mr-2" />
        {{ c.titulo }}
      </v-tab>
    </v-tabs>

    <v-card variant="outlined">
      <v-card-title class="d-flex align-center justify-space-between px-6 pt-5">
        <span class="text-h6">{{ catalogo.titulo }}</span>
        <v-btn color="primary" variant="flat" :prepend-icon="Plus" @click="abrirNuevo">
          Agregar
        </v-btn>
      </v-card-title>

      <v-card-text class="px-6 pb-5">
        <v-progress-linear v-if="cargando" indeterminate class="mb-4" />

        <v-list v-else-if="items.length" lines="one">
          <v-list-item v-for="item in items" :key="item.id">
            <template #prepend>
              <v-icon :icon="catalogo.icono" class="mr-2" :color="item.activo ?? item.activa ? 'primary' : 'medium-emphasis'" />
            </template>

            <v-list-item-title :class="{ 'text-medium-emphasis': !(item.activo ?? item.activa) }">
              {{ item.nombre }}
              <span v-if="catalogo.conDescripcion && item.descripcion" class="text-body-2 text-medium-emphasis">
                — {{ item.descripcion }}
              </span>
              <v-chip
                v-if="!(item.activo ?? item.activa)"
                size="x-small"
                variant="tonal"
                class="ml-2"
              >
                Inactivo
              </v-chip>
            </v-list-item-title>

            <template #append>
              <v-btn :icon="Pencil" variant="text" size="small" title="Editar" @click="abrirEditar(item)" />
              <v-btn
                v-if="catalogo.clave !== 'coordinaciones'"
                variant="text"
                size="small"
                :title="(item.activo ?? item.activa) ? 'Desactivar' : 'Activar'"
                @click="alternarActivo(item)"
              >
                <v-icon
                  :icon="(item.activo ?? item.activa) ? CircleOff : CircleCheck"
                  :color="(item.activo ?? item.activa) ? 'warning' : 'success'"
                />
              </v-btn>
              <v-btn :icon="Trash2" variant="text" size="small" title="Borrar" @click="borrar(item)" />
            </template>
          </v-list-item>
        </v-list>

        <p v-else class="text-body-2 text-medium-emphasis">
          Todavía no hay valores en este catálogo.
        </p>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialogo" max-width="480">
      <v-card>
        <v-card-title class="px-6 pt-5">
          {{ editando ? 'Editar' : 'Nuevo' }} — {{ catalogo.titulo.toLowerCase() }}
        </v-card-title>
        <v-card-text class="px-6 pt-4">
          <v-text-field
            v-model="nombre"
            label="Nombre"
            autofocus
            class="mb-3"
            @keyup.enter="guardar"
          />
          <v-text-field
            v-if="catalogo.conDescripcion"
            v-model="descripcion"
            label="Descripción"
            placeholder="Opcional"
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
