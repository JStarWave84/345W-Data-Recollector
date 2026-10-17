<script setup>
/**
 * Pantalla de captura de una jornada.
 *
 * Es la pantalla mas densa de la app: en un solo lugar estan la cabecera, la
 * grilla de carga rapida, las personas ya cargadas, la lista de servicios y la
 * tira de conteos. La idea es que quien carga no tenga que saltar de pantalla
 * para saber si la jornada esta completa antes de enviarla.
 *
 * El estado manda sobre todo lo demas. Cuando la actividad sale de borrador,
 * la grilla y el dialogo de edicion se cierran y la pantalla pasa a modo lectura:
 * no es una limitacion de la interfaz, es el mismo reflejo de la regla de
 * negocio del trigger, que bloquea la morbilidad de una actividad enviada.
 */
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  BadgeCheck,
  Send,
  Trash2,
  Pencil,
  Printer,
  Undo2,
} from 'lucide-vue-next'

import ActividadForm from '../components/ActividadForm.vue'
import AtencionDialog from '../components/AtencionDialog.vue'
import AtencionesGrid from '../components/AtencionesGrid.vue'
import ConfirmarDialog from '../components/ConfirmarDialog.vue'
import EstadoChip from '../components/EstadoChip.vue'
import TiraConteos from '../components/TiraConteos.vue'
import { useActividadesStore } from '../stores/actividades.js'
import { useAuthStore } from '../stores/auth.js'
import { resumenContable, sinClasificarPorSexo } from '../lib/morbilidad.js'
import { mesLegible, partesFecha } from '../lib/fechas.js'
import { imprimirPlanilla } from '../lib/pdfPlanilla.js'
import { ES_MOVIL } from '../lib/plataforma.js'

const store = useActividadesStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const dialogoAtencion = ref(false)
const atencionEditando = ref(null)
const grid = ref(null)
const pestana = ref('cabecera')

const ACCION = ref(null)

const generandoPlanilla = ref(false)
const errorPlanilla = ref(null)

// ---------------------------------------------------------------------------
// Datos derivados
// ---------------------------------------------------------------------------

const conteos = computed(() => resumenContable(store.atenciones))
const sinSexoBinario = computed(() => sinClasificarPorSexo(store.atenciones))

const nombreCoordinacion = computed(() => {
  const c = (store.catalogos?.coordinaciones ?? []).find(
    (x) => x.id === store.actividad?.coordinacion_id,
  )
  return c?.nombre ?? '—'
})

const fechaCorta = computed(() => {
  const p = partesFecha(store.actividad?.fecha)
  return p ? `${p.dia} ${p.mes} ${p.anio}` : null
})

/**
 * Lo que falta en la cabecera. Es la lista que bloquea tanto el envio como la
 * impresion de la planilla, asi que vive sola: si mañana aparece un campo mas
 * obligatorio se agrega aca y las dos cosas lo heredan.
 */
const faltanCabecera = computed(() => {
  const a = store.actividad
  if (!a) return []
  const faltan = []
  if (!a.titulo?.trim()) faltan.push('Título de la jornada')
  if (!a.mes_reporte) faltan.push('Mes de reporte')
  if (!a.municipio?.trim()) faltan.push('Municipio')
  if (!a.parroquia?.trim()) faltan.push('Parroquia (ADMIN 3)')
  if (!a.coordinacion_id) faltan.push('Coordinación')
  return faltan
})

/**
 * Lo que falta para poder enviar. No se muestra como error mientras se carga:
 * se muestra como una lista de pendientes que se va vaciando, que es lo que
 * sirve para saber que falta.
 *
 * El envio además de la cabecera exige al menos una persona atendida; la
 * planilla en blanco no, porque es lo que se usa para cargarla.
 */
const pendientes = computed(() => {
  if (!store.actividad) return []
  const faltan = [...faltanCabecera.value]
  if (!store.atenciones.length) faltan.push('Al menos una persona atendida')
  return faltan
})

const puedeEnviar = computed(() => pendientes.value.length === 0)
const esAdmin = computed(() => auth.isAdmin)

const accionesDisponibles = computed(() => {
  const estado = store.actividad?.estado
  if (!estado) return []
  return [
    estado === 'borrador' && {
      clave: 'enviar',
      texto: 'Enviar a revisión',
      icon: Send,
      color: 'primary',
      variant: 'flat',
    },
    estado === 'enviada' && esAdmin.value && {
      clave: 'validar',
      texto: 'Validar',
      icon: BadgeCheck,
      color: 'validada',
      variant: 'flat',
    },
    estado === 'enviada' && {
      clave: 'revertir',
      texto: 'Revertir a borrador',
      icon: Undo2,
      color: 'warning',
      variant: 'text',
    },
    estado === 'borrador' && {
      clave: 'borrar',
      texto: 'Borrar',
      icon: Trash2,
      color: 'error',
      variant: 'text',
    },
  ].filter(Boolean)
})

// ---------------------------------------------------------------------------
// Planilla en papel
// ---------------------------------------------------------------------------

/**
 * Genera la planilla en blanco para llenar a mano.
 *
 * A diferencia de `pendientes`, que exige al menos una persona atendida, acá
 * solo importa que la cabecera este completa: la planilla existe justamente
 * para cargar a la gente en el papel antes de pasarla al sistema. Exigir
 * morbilidad para imprimir el formulario seria exigir lo contrario de lo que
 * la planilla sirve.
 */
async function imprimir() {
  if (faltanCabecera.value.length) {
    errorPlanilla.value = `No se puede generar la planilla. Falta: ${faltanCabecera.value.join(', ')}.`
    return
  }

  generandoPlanilla.value = true
  errorPlanilla.value = null
  try {
    const nombres = store.serviciosDe(store.actividad?.coordinacion_id).map((s) => s.nombre)
    await imprimirPlanilla({
      actividad: store.actividad,
      catalogos: store.catalogos,
      servicios: nombres,
    })
  } catch (e) {
    errorPlanilla.value = e?.message ?? String(e)
  } finally {
    generandoPlanilla.value = false
  }
}

// ---------------------------------------------------------------------------
// Atenciones
// ---------------------------------------------------------------------------

function editar(atencion) {
  if (!store.editable && !esAdmin.value) return
  atencionEditando.value = atencion
  dialogoAtencion.value = true
}

function nuevaAtencion() {
  if (!store.editable && !esAdmin.value) return
  atencionEditando.value = null
  dialogoAtencion.value = true
}

function serviciosDe(atencionId) {
  return store.serviciosPorAtencion[atencionId] ?? []
}

function nombreServicio(servicioId) {
  return (
    (store.catalogos?.servicios ?? []).find((s) => s.id === servicioId)?.nombre ?? '—'
  )
}

async function alGuardarAtencion() {
  dialogoAtencion.value = false
  atencionEditando.value = null
}

async function alBorrarAtencion() {
  dialogoAtencion.value = false
  atencionEditando.value = null
}

// ---------------------------------------------------------------------------
// Acciones de estado
// ---------------------------------------------------------------------------

const CONFIRMACIONES = {
  enviar: {
    titulo: 'Enviar la jornada a revisión',
    color: 'primary',
    textoConfirmar: 'Enviar',
    mensaje: 'La jornada deja de ser editable y un administrador tiene que revisarla.',
  },
  validar: {
    titulo: 'Validar la jornada',
    color: 'validada',
    textoConfirmar: 'Validar',
    mensaje:
      'Con esta acción la jornada queda validada y entra en la exportación del 345W.',
  },
  revertir: {
    titulo: 'Revertir a borrador',
    color: 'warning',
    textoConfirmar: 'Revertir',
    mensaje:
      'La jornada vuelve a editable, incluida la morbilidad que ya estaba cargada.',
  },
  borrar: {
    titulo: 'Borrar la jornada',
    color: 'error',
    textoConfirmar: 'Borrar la jornada',
    mensaje: 'Se borra la jornada y todas las personas que cargaste en ella.',
  },
}

const confirmar = ref(false)

function pedirAccion(clave) {
  ACCION.value = clave
  confirmar.value = true
}

function dialogoAbierto() {
  return ACCION.value ? CONFIRMACIONES[ACCION.value] : null
}

async function ejecutarAccion() {
  const clave = ACCION.value
  confirmar.value = false
  if (clave === 'enviar') await store.marcarEnviada(store.actividad.id)
  if (clave === 'validar') await store.validar(store.actividad.id)
  if (clave === 'revertir') await store.revertir(store.actividad.id)
  if (clave === 'borrar') {
    const id = store.actividad.id
    await store.borrarActividad(id)
    router.push({ name: 'actividades' })
    return
  }
  ACCION.value = null
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

onMounted(async () => {
  await store.cargarCatalogos()
  await store.abrirActividad(route.params.id)
  if (!store.actividad) router.replace({ name: 'actividades' })
})

onBeforeRouteLeave(() => {
  store.cerrarActividad()
})

onBeforeRouteUpdate(async (aDe, aHacia) => {
  if (aDe.params.id !== aHacia.params.id) {
    await store.abrirActividad(aHacia.params.id)
  }
})
</script>

<template>

  <v-container v-if="store.actividad" fluid class="py-6">
      <header class="mb-6">
        <v-btn
          variant="text"
          size="small"
          class="mb-2 px-0"
          :prepend-icon="ArrowLeft"
          to="/actividades"
        >
          Todas las jornadas
        </v-btn>

        <div class="d-flex align-start flex-wrap ga-4">
          <div class="flex-grow-1">
            <div class="d-flex align-center ga-3 mb-1 flex-wrap">
              <p class="sobreline mb-0">
                {{ nombreCoordinacion }}
                <template v-if="fechaCorta"> · {{ fechaCorta }}</template>
              </p>
              <EstadoChip :estado="store.actividad.estado" />
            </div>
            <h1>{{ store.actividad.titulo || 'Jornada sin título' }}</h1>
            <p class="text-body-2 text-medium-emphasis mt-1 mb-0">
              Reporte de {{ mesLegible(store.actividad.mes_reporte?.slice(0, 7)) || '—' }}
              <template v-if="store.actividad.responsable">
                · Responsable: {{ store.actividad.responsable }}
              </template>
            </p>
          </div>

          <div class="d-flex align-center ga-2 flex-wrap">
            <v-btn
              v-if="!ES_MOVIL"
              :icon="Printer"
              size="small"
              variant="text"
              title="Generar la planilla en blanco para llenar a mano"
              :disabled="generandoPlanilla"
              :loading="generandoPlanilla"
              class="no-imprimir"
              @click="imprimir"
            />
            <v-btn
              v-for="a in accionesDisponibles"
              :key="a.clave"
              :prepend-icon="a.icon"
              :color="a.color"
              :variant="a.variant"
              :disabled="a.clave === 'enviar' && !puedeEnviar"
              @click="pedirAccion(a.clave)"
            >
              {{ a.texto }}
            </v-btn>
          </div>
        </div>
      </header>

      <v-alert
        v-if="store.actividad.estado !== 'borrador' && !esAdmin"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-5"
        :text="
          store.actividad.estado === 'enviada'
            ? 'La jornada está en revisión. Los datos ya no se pueden modificar hasta que un administrador la revierta.'
            : 'La jornada está validada. Para corregir algo pedí que la revertsan a borrador.'
        "
      />

      <TiraConteos :conteos="conteos" class="mb-4" />

      <v-alert
        v-if="errorPlanilla"
        type="error"
        variant="tonal"
        density="comfortable"
        closable
        class="mb-4 no-imprimir"
        :text="errorPlanilla"
        @click:close="errorPlanilla = null"
      />

      <v-alert
        v-if="faltanCabecera.length && store.actividad.estado !== 'borrador'"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <div class="text-body-2 mb-1">La planilla en blanco no se puede generar todavía. Falta:</div>
        <ul class="text-caption ps-4">
          <li v-for="p in faltanCabecera" :key="p">{{ p }}</li>
        </ul>
      </v-alert>

      <div class="d-flex align-center flex-wrap ga-3 mb-5">
        <v-btn
          variant="text"
          size="small"
          :prepend-icon="Pencil"
          class="px-0"
          @click="nuevaAtencion"
        >
          Cargar una persona con detalle
        </v-btn>
        <v-spacer />
        <span class="text-caption text-medium-emphasis">
          {{ store.atenciones.length }}
          {{ store.atenciones.length === 1 ? 'persona atendida' : 'personas atendidas' }}
        </span>
      </div>

      <v-alert
        v-if="sinSexoBinario"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-5"
        text="Hay personas con sexo “O” o sin sexo cargado. Cuentan para el total de atendidos, pero no suman en Girls, Boys, Female ni Male, porque el 345W no tiene una columna para ese caso."
      />

      <v-alert
        v-if="store.actividad.estado === 'borrador' && pendientes.length"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-5"
      >
        <div class="text-body-2 mb-1">Para poder enviarla falta:</div>
        <ul class="text-caption ps-4">
          <li v-for="p in pendientes" :key="p">{{ p }}</li>
        </ul>
      </v-alert>

      <v-tabs v-model="pestana" class="mb-5">
        <v-tab value="cabecera">Datos de la jornada</v-tab>
        <v-tab value="personas">
          Personas atendidas ({{ store.atenciones.length }})
        </v-tab>
      </v-tabs>

      <v-window v-model="pestana">
        <v-window-item value="cabecera">
          <ActividadForm />
        </v-window-item>

        <v-window-item value="personas">
          <v-card v-if="store.atenciones.length" variant="outlined" class="mb-6">
            <v-table density="comfortable">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th style="width: 90px">Edad</th>
                  <th style="width: 70px">Sexo</th>
                  <th>Condiciones</th>
                  <th>Servicios</th>
                  <th style="width: 60px" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="a in store.atenciones"
                  :key="a.id"
                  :class="store.editable ? 'fila-clicable' : ''"
                  tabindex="0"
                  @click="editar(a)"
                  @keyup.enter="editar(a)"
                >
                  <td>
                    <div class="text-body-2 font-weight-medium">{{ a.nombre_apellido }}</div>
                    <div v-if="a.cedula" class="text-caption mono text-medium-emphasis">
                      {{ a.cedula }}
                    </div>
                  </td>
                  <td class="text-body-2">{{ a.edad ?? '—' }}</td>
                  <td class="text-body-2">{{ a.sexo ?? '—' }}</td>
                  <td class="text-caption text-medium-emphasis">
                    {{
                      [
                        a.indigena ? 'Indígena' : null,
                        a.gestante ? 'Gestante' : null,
                        a.discapacidad ? 'Discapacidad' : null,
                        a.lgbtiq ? 'LGBTIQ+' : null,
                        a.victima_trata ? 'Víctima de trata' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'
                    }}
                  </td>
                  <td class="text-caption text-medium-emphasis">
                    {{
                      serviciosDe(a.id)
                        .map((s) => nombreServicio(s.servicio_id))
                        .join(' · ') || '—'
                    }}
                  </td>
                  <td class="text-end" @click.stop>
                    <v-btn
                      :icon="Pencil"
                      size="x-small"
                      variant="text"
                      title="Editar"
                      :disabled="!store.editable && !esAdmin"
                      @click="editar(a)"
                    />
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card>

          <v-card v-if="store.editable" variant="outlined">
            <v-card-title class="px-6 pt-5">
              <span class="sobreline">Carga rápida</span>
              <h3 class="text-h6 mt-1">Agregar varias personas de una vez</h3>
            </v-card-title>
            <v-card-text class="px-6 pt-4">
              <AtencionesGrid ref="grid" />
            </v-card-text>
          </v-card>
        </v-window-item>
      </v-window>
    </v-container>

    <v-container v-else-if="store.cargandoDetalle" class="py-10">
      <v-skeleton-loader type="heading, paragraph, image" />
    </v-container>

    <v-container v-else class="py-10">
      <v-alert
        type="error"
        variant="tonal"
        density="comfortable"
        :text="store.errorDetalle || 'No se encontró la jornada.'"
      />
    </v-container>

  <AtencionDialog
    v-model="dialogoAtencion"
    :atencion="atencionEditando"
    @guardado="alGuardarAtencion"
    @borrado="alBorrarAtencion"
  />

  <ConfirmarDialog
    v-if="dialogoAbierto()"
    v-model="confirmar"
    :titulo="dialogoAbierto().titulo"
    :color="dialogoAbierto().color"
    :texto-confirmar="dialogoAbierto().textoConfirmar"
    :mensaje="dialogoAbierto().mensaje"
    :detalles="
      ACCION === 'enviar'
        ? [
            `Va a incluir ${store.atenciones.length} personas atendidas.`,
            'Después del envío no se puede modificar la morbilidad.',
          ]
        : ACCION === 'revertir'
          ? ['Vuelve a ser editable y las personas ya cargadas se mantienen.']
          : []
    "
    @confirmar="ejecutarAccion"
  />
</template>
