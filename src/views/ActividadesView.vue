<script setup>
/**
 * Lista de actividades. Es la pantalla de entrada de la app: donde se abre un
 * borrador para seguir cargando o se ve el estado de lo que ya se mando.
 *
 * La tabla muestra el estado de cada jornada con la insignia de color y el mes
 * de reporte en cifras tabulares, porque comparar "cuando" entre varias filas
 * es la tarea mas frecuente de quien coordina.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, Funnel, Plus, Trash2 } from 'lucide-vue-next'

import ConfirmarDialog from '../components/ConfirmarDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import EstadoChip from '../components/EstadoChip.vue'
import TiraConteos from '../components/TiraConteos.vue'
import { useActividadesStore } from '../stores/actividades.js'
import { useAuthStore } from '../stores/auth.js'
import { mesActual, mesCorto } from '../lib/fechas.js'

const store = useActividadesStore()
const auth = useAuthStore()
const router = useRouter()

const filtro = ref('todas')

const OPCIONES_FILTRO = [
  { title: 'Todas', value: 'todas' },
  { title: 'Borradores', value: 'borrador' },
  { title: 'Enviadas', value: 'enviada' },
  { title: 'Validadas', value: 'validada' },
]

const nombreCoordinacion = computed(() => {
  const mapa = new Map(
    (store.catalogos?.coordinaciones ?? []).map((c) => [c.id, c.nombre]),
  )
  return (id) => mapa.get(id) ?? '—'
})

const listado = computed(() => {
  if (filtro.value === 'todas') return store.actividades
  return store.actividades.filter((a) => a.estado === filtro.value)
})

const aBorrarId = ref(null)
const confirmarBorrado = ref(false)

/**
 * Acciones que se muestran pero el admin no puede usar: crear y duplicar
 * jornadas. Ambas se bloquean acá, no en el store.
 *
 * Por que en la vista y no en el store: duplicarActividad (store) llama a
 * crearActividad por dentro, asi que un bloqueo en el store mataria las dos
 * acciones juntas sin poder distinguirlas.
 *
 * "Nueva jornada" no le serviria al admin aunque se la dejemos pasar:
 * `actividades.coordinacion_id` es not null y un admin no pertenece a ninguna
 * coordinacion, asi que el INSERT se rechaza con 23502 (no_null_violation).
 *
 * Ojo con el diagnostico: NO es la RLS. La policy actividades_insert_admin_o_
 * propia_coordinacion si permite `current_rol() = 'admin'`. Lo que falla es el
 * NOT NULL, y hasta ahora el error se comia el store (errorDetalle) sin que
 * nadie lo mostrara: el boton no hacia nada.
 *
 * Duplicar si llegaria a funcionar para el admin, porque ahi coordinacion_id
 * viene de la actividad origen y no es null. Se bloquea por decision de rol:
 * duplicar es una forma de crear, asi que va con crear.
 *
 * El boton queda visible a proposito. Ocultarlo deja al admin preguntandose
 * donde quedo la funcion; apretar y que se explique es la respuesta.
 */
const AVISOS = {
  crear: 'Solo los coordinadores pueden crear jornadas. Como administrador podés verlas de todas las coordinaciones, validarlas y administrarlas, pero la carga en campo la hace quien coordina.',
  duplicar:
    'Solo los coordinadores pueden duplicar jornadas. Duplicar es una forma de crear, así que va con la carga en campo.',
}

/** Mensaje del aviso, o null si no hay nada que avisar. */
const avisoBloqueo = ref(null)

async function nueva() {
  if (auth.isAdmin) {
    avisoBloqueo.value = AVISOS.crear
    return
  }

  const creada = await store.crearActividad({
    titulo: '',
    // mes_reporte es not null en la tabla: si se manda null Postgres
    // rechaza el insert con 400. Se prellena con el mes actual y la
    // persona lo cambia en el formulario si la jornada es de otro mes.
    mes_reporte: mesActual(),
    coordinacion_id: auth.profile?.coordinacion_id ?? null,
  })
  if (creada) router.push({ name: 'actividad', params: { id: creada.id } })
}

const tiraEstados = computed(() => [
  { clave: 'todas', etiqueta: 'Total', valor: store.actividades.length },
  { clave: 'borrador', etiqueta: 'Borrador', valor: store.porEstado.borrador },
  { clave: 'enviada', etiqueta: 'Enviada', valor: store.porEstado.enviada },
  { clave: 'validada', etiqueta: 'Validada', valor: store.porEstado.validada },
])

const actividadABorrar = computed(
  () => store.actividades.find((a) => a.id === aBorrarId.value) ?? null,
)

/**
 * Quién puede borrar qué.
 *
 * La policy actividades_delete_admin_o_borrador_propio dice "Admin: borra
 * cualquier actividad", así que el admin ve el botón en cualquier estado. El
 * coordinador solo en su borrador.
 *
 * Esto le da al admin mas poder del que le daba la UI antes, que le escondia el
 * boton en enviada y validada aunque la base se lo permitia. El ON DELETE
 * CASCADE se lleva atenciones y servicios sin dejar rastro, asi que la
 * advertencia del dialogo cambia segun el estado: no es lo mismo borrar un
 * borrador que borrar algo que ya fue validado por otra persona.
 */
const puedeBorrar = (item) => item.estado === 'borrador' || auth.isAdmin

/** El admin borra cosas que no son suyas: "cargaste" seria falso. */
const mensajeBorrado = computed(() => {
  const a = actividadABorrar.value
  const nombre = a?.titulo || 'la jornada'
  if (a && a.estado !== 'borrador') {
    return `Se va a borrar ${nombre} con todas las personas atendidas, los servicios registrados y su validación.`
  }
  return `Se va a borrar ${nombre} y todas las personas que cargaste en ella.`
})

const detallesBorrado = computed(() => {
  const a = actividadABorrar.value
  const detalles = ['Esta acción no se puede deshacer.']

  if (a?.estado === 'validada') {
    detalles.unshift('La jornada está validada: se borra también la validación.')
  } else if (a?.estado === 'enviada') {
    detalles.unshift('La jornada ya fue enviada y está esperando validación.')
  } else {
    detalles.unshift('Solo se puede borrar una jornada que siga en borrador.')
  }

  return detalles
})

async function recargar() {
  await store.cargarCatalogos()
  await store.cargarLista()
}

async function abrir(item) {
  await store.abrirActividad(item.id)
  router.push({ name: 'actividad', params: { id: item.id } })
}

async function duplicar(item) {
  if (auth.isAdmin) {
    avisoBloqueo.value = AVISOS.duplicar
    return
  }

  const copia = await store.duplicarActividad(item.id)
  if (copia) router.push({ name: 'actividad', params: { id: copia.id } })
}

function pedirBorrar(item) {
  aBorrarId.value = item.id
  confirmarBorrado.value = true
}

async function confirmarBorrar() {
  await store.borrarActividad(aBorrarId.value)
  confirmarBorrado.value = false
  aBorrarId.value = null
}

onMounted(recargar)
</script>

<template>

  <v-container fluid class="py-6">
      <header class="mb-6">
        <div class="d-flex align-start flex-wrap ga-4">
          <div class="flex-grow-1">
            <p class="sobreline mb-1">Sistema Telar</p>
            <h1>Jornadas de campo</h1>
            <p class="text-body-2 text-medium-emphasis mt-1 mb-0">
              {{
                auth.isAdmin
                  ? 'Todas las coordinaciones.'
                  : `Actividades de ${auth.coordinacion ?? 'tu coordinación'}.`
              }}
            </p>
          </div>
          <v-btn color="primary" variant="flat" :prepend-icon="Plus" @click="nueva">
            Nueva jornada
          </v-btn>
        </div>

        <TiraConteos :conteos="tiraEstados" class="mt-6" />
      </header>

      <v-alert
        v-if="avisoBloqueo"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-4"
        closable
        @click:close="avisoBloqueo = null"
      >
        {{ avisoBloqueo }}
      </v-alert>

      <v-alert
        v-if="store.errorLista"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
        :text="store.errorLista"
      />

      <div class="d-flex align-center ga-3 mb-3">
        <v-select
          v-model="filtro"
          :items="OPCIONES_FILTRO"
          :prepend-inner-icon="Funnel"
          hide-details
          style="max-width: 220px"
        />
        <v-spacer />
        <span class="text-caption text-medium-emphasis">
          {{ listado.length }} {{ listado.length === 1 ? 'actividad' : 'actividades' }}
        </span>
      </div>

      <v-card v-if="listado.length" variant="outlined">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th>Jornada</th>
              <th style="width: 110px">Mes</th>
              <th v-if="auth.isAdmin" style="width: 170px">Coordinación</th>
              <th style="width: 130px">Estado</th>
              <th style="width: 120px" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in listado"
              :key="item.id"
              class="fila-clicable"
              tabindex="0"
              @click="abrir(item)"
              @keyup.enter="abrir(item)"
            >
              <td>
                <div class="text-body-2 font-weight-medium">
                  {{ item.titulo || 'Sin título' }}
                </div>
                <div v-if="item.responsable" class="text-caption text-medium-emphasis">
                  {{ item.responsable }}
                </div>
              </td>
              <td class="mono-separado text-body-2">
                {{ mesCorto(item.mes_reporte?.slice(0, 7)) }}
              </td>
              <td v-if="auth.isAdmin" class="text-body-2">
                {{ nombreCoordinacion(item.coordinacion_id) }}
              </td>
              <td><EstadoChip :estado="item.estado" /></td>
              <td class="text-end" @click.stop>
                <v-btn
                  :icon="Copy"
                  size="small"
                  variant="text"
                  :title="
                    auth.isAdmin
                      ? 'Duplicar como base de otra jornada (solo coordinadores)'
                      : 'Duplicar como base de otra jornada'
                  "
                  @click="duplicar(item)"
                />
                <v-btn
                  v-if="puedeBorrar(item)"
                  :icon="Trash2"
                  size="small"
                  variant="text"
                  :color="item.estado === 'borrador' ? 'medium-emphasis' : 'error'"
                  :title="
                    item.estado === 'borrador'
                      ? 'Borrar esta jornada'
                      : `Borrar esta jornada ${item.estado}`
                  "
                  @click="pedirBorrar(item)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card v-else-if="store.cargandoLista" variant="outlined">
        <v-skeleton-loader type="table-row@5" />
      </v-card>

      <v-card v-else variant="outlined">
        <EmptyState
          :titulo="
            store.actividades.length
              ? 'No hay actividades con ese estado.'
              : 'Todavía no cargaste ninguna jornada.'
          "
          :mensaje="
            store.actividades.length
              ? 'Cambiá el filtro para ver las demás.'
              : 'Una jornada agrupa la visita del día, las personas atendidas y los servicios que recibieron. Cuando termines, la enviás para que un administrador la valide.'
          "
          :texto-accion="store.actividades.length ? null : 'Crear la primera jornada'"
          @accion="nueva"
        />
      </v-card>
    </v-container>

  <ConfirmarDialog
    v-model="confirmarBorrado"
    titulo="Borrar la jornada"
    :mensaje="mensajeBorrado"
    :detalles="detallesBorrado"
    texto-confirmar="Borrar la jornada"
    color="error"
    @confirmar="confirmarBorrar"
  />
</template>
