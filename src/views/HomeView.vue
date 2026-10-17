<script setup>
/**
 * Pantalla de exportacion del 345W.
 *
 * Vive separada de la captura a proposito: exportar es una tarea de escritorio
 * (o de cierre de mes), no algo que se hace en el medio de una jornada de campo.
 *
 * El RLS decide que se puede exportar: la consulta de agregados corre con la
 * sesion del usuario, asi que un coordinador solo puede exportar lo suyo y un
 * administrador todo. Esa restriccion no esta en el codigo, esta en la base.
 *
 * Se puede exportar por rango de meses (todo lo que hay en el rango) o marcando
 * jornadas una por una. El checklist no reemplaza al rango: acota lo que el rango
 * ya trajo. Al cambiar el rango se recargan las jornadas y se vuelven a marcar
 * todas, asi que el comportamiento por omision sigue siendo "exportar el rango".
 */
import { computed, onMounted, ref, watch } from 'vue'
// Componentes lucide: se pasan tal cual a :icon.
import {
  ArrowLeft,
  CheckSquare,
  FileSpreadsheet,
  Info,
  RefreshCw,
  Square,
} from 'lucide-vue-next'

import { useAuthStore } from '../stores/auth.js'
import { supabase } from '../lib/supabase.js'
import {
  consultarAgregados,
  consultarAtencionesDe,
  consultarServiciosDe,
  guardarXlsx,
  nombreArchivo345W,
} from '../lib/export345w.js'
import { obtenerCatalogos } from '../lib/catalogos.js'
import { mesActual } from '../lib/fechas.js'

const auth = useAuthStore()

/** Estados que se consideran cerrados. Borrador todavia puede cambiar. */
const ESTADOS_FINALES = ['enviada', 'validada']

const desde = ref(`${mesActual().slice(0, 4)}-01`)
const hasta = ref(mesActual())
const soloEnviadas = ref(true)
const incluirDetalle = ref(true)

const exportando = ref(false)
const resultado = ref(null)
const error = ref(null)

const actividadesVisibles = ref(null)
const porEstado = ref(null)

// Checklist
const candidatas = ref([])
const seleccionadas = ref([])
const cargandoChecklist = ref(false)

const primerDia = (mes) => `${mes}-01`

const mesesEnRango = computed(() => {
  if (!desde.value || !hasta.value) return 0
  if (desde.value > hasta.value) return 0
  const [anioD, mesD] = desde.value.split('-').map(Number)
  const [anioH, mesH] = hasta.value.split('-').map(Number)
  return (anioH - anioD) * 12 + (mesH - mesD) + 1
})

/** Las jornadas marcadas que ademas pasan el filtro de estado. */
const aExportar = computed(() =>
  candidatas.value.filter(
    (f) =>
      seleccionadas.value.includes(f.actividad_id) &&
      (!soloEnviadas.value || ESTADOS_FINALES.includes(f.estado)),
  ),
)

/** Marcadas pero afuera por el filtro: se avisa en vez de descartarlas en silencio. */
const descartadasPorEstado = computed(
  () => seleccionadas.value.length - aExportar.value.length,
)

const personasTotales = computed(() =>
  aExportar.value.reduce((suma, f) => suma + (f.total_atenciones ?? 0), 0),
)

const puedeExportar = computed(
  () => mesesEnRango.value > 0 && aExportar.value.length > 0 && !cargandoChecklist.value,
)

/**
 * Trae las jornadas del rango para armar el checklist.
 *
 * Se consulta con `soloEnviadas: false` a proposito: el listado tiene que
 * mostrar tambien los borradores, para que la persona vea que existen y decida.
 * El filtro de estado se aplica recien al exportar.
 */
async function cargarChecklist() {
  if (mesesEnRango.value <= 0) {
    candidatas.value = []
    seleccionadas.value = []
    return
  }

  cargandoChecklist.value = true
  try {
    const filas = await consultarAgregados({
      desde: primerDia(desde.value),
      hasta: primerDia(hasta.value),
      soloEnviadas: false,
    })
    candidatas.value = filas
    // Se marcan todas: es el comportamiento que tenia antes del checklist.
    seleccionadas.value = filas.map((f) => f.actividad_id)
  } catch (e) {
    error.value = e.message
    candidatas.value = []
    seleccionadas.value = []
  } finally {
    cargandoChecklist.value = false
  }
}

function marcarTodas() {
  seleccionadas.value = candidatas.value.map((f) => f.actividad_id)
}

function marcarNinguna() {
  seleccionadas.value = []
}

async function contarActividades() {
  error.value = null
  const { data, error: err } = await supabase
    .from('actividades')
    .select('estado')
  if (err) {
    error.value = err.message
    return
  }
  const cuenta = { borrador: 0, enviada: 0, validada: 0 }
  for (const a of data ?? []) {
    if (cuenta[a.estado] !== undefined) cuenta[a.estado] += 1
  }
  actividadesVisibles.value = Object.values(cuenta).reduce((a, b) => a + b, 0)
  porEstado.value = cuenta
}

/**
 * Arma las filas de la hoja de detalle: una por persona atendida.
 *
 * Se enriquece con el nombre del grupo, el de los servicios y los datos de la
 * jornada, que no vienen en la consulta de `atenciones`. Los nombres salen del
 * catalogo completo y no del filtrado por coordinacion, porque el export puede
 * abarcar varias coordinaciones.
 */
async function armarDetalle(filas) {
  const catalogo = await obtenerCatalogos()
  const nombreGrupo = new Map((catalogo.grupos ?? []).map((g) => [g.id, g.nombre]))
  const nombreServicio = new Map((catalogo.servicios ?? []).map((s) => [s.id, s.nombre]))
  const jornadaDe = new Map(filas.map((f) => [f.actividad_id, f]))

  const atenciones = await consultarAtencionesDe(filas.map((f) => f.actividad_id))
  const pivote = await consultarServiciosDe(atenciones.map((a) => a.id))

  return atenciones
    .map((a) => {
      const jornada = jornadaDe.get(a.actividad_id)
      const servicios = (pivote[a.id] ?? []).map((s) => {
        const nombre = nombreServicio.get(s.servicio_id) ?? '—'
        return s.cantidad > 1 ? `${nombre} x${s.cantidad}` : nombre
      })
      return {
        ...a,
        fecha: jornada?.fecha ?? '',
        titulo: jornada?.titulo ?? '',
        establecimiento: jornada?.establecimiento ?? '',
        grupo: nombreGrupo.get(a.grupo_atencion_id) ?? '',
        servicios: servicios.join(', '),
      }
    })
    // Por jornada y, dentro de cada una, en el orden en que se fueron cargando:
    // es como se lleno la planilla en papel, y facilitates cruzarla con la hoja.
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return String(a.fecha).localeCompare(String(b.fecha))
      return String(a.created_at).localeCompare(String(b.created_at))
    })
}

async function exportar() {
  error.value = null
  resultado.value = null

  if (!desde.value || !hasta.value) {
    error.value = 'Completá el mes desde y el mes hasta.'
    return
  }
  if (desde.value > hasta.value) {
    error.value = 'El mes desde no puede ser posterior al mes hasta.'
    return
  }
  if (!seleccionadas.value.length) {
    error.value = 'Marcá al menos una jornada para exportar.'
    return
  }
  if (!aExportar.value.length) {
    error.value =
      'Ninguna de las jornadas marcadas pasa el filtro de estado. ' +
      'Desactivá "Solo actividades enviadas y validadas" o marcá otras jornadas.'
    return
  }

  exportando.value = true
  try {
    const filas = await consultarAgregados({
      desde: primerDia(desde.value),
      hasta: primerDia(hasta.value),
      soloEnviadas: soloEnviadas.value,
      ids: seleccionadas.value,
    })

    if (!filas.length) {
      resultado.value = {
        tipo: 'vacio',
        mensaje: soloEnviadas.value
          ? 'No hay actividades enviadas ni validadas en ese rango.'
          : 'No hay actividades en ese rango.',
      }
      return
    }

    const personas = incluirDetalle.value ? await armarDetalle(filas) : []

    const ruta = await guardarXlsx(
      filas,
      nombreArchivo345W(primerDia(desde.value), primerDia(hasta.value)),
      personas,
    )

    resultado.value = ruta
      ? { tipo: 'ok', filas: filas.length, personas: personas.length, ruta }
      : { tipo: 'cancelado' }
  } catch (e) {
    error.value = e.message
  } finally {
    exportando.value = false
  }
}

const ETIQUETA_ESTADO = {
  borrador: { texto: 'borrador', color: 'warning' },
  enviada: { texto: 'enviada', color: 'info' },
  validada: { texto: 'validada', color: 'success' },
}

onMounted(() => {
  contarActividades()
  cargarChecklist()
})

// El checklist depende del rango: si se mueven los meses, la lista de jornadas
// que se puede marcar es otra.
watch([desde, hasta], cargarChecklist)
</script>

<template>
  <v-container fluid class="py-6">
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
      <p class="sobreline mb-1">Sistema Telar</p>
      <h1>Exportar a Excel</h1>
      <p class="text-body-2 text-medium-emphasis mt-1 mb-0">
        El archivo sale con tres hojas: <strong>345W</strong> (las 21 columnas
        en el orden que exige la ONU), <strong>Edades</strong> (el desglose en
        7 rangos por sexo) y <strong>Personas</strong> (el detalle una por
        atendida).
      </p>
    </header>

    <v-row>
      <v-col cols="12" md="7">
        <v-card variant="outlined">
          <v-card-text class="pa-5">
            <v-alert
              v-if="error"
              type="error"
              variant="tonal"
              density="comfortable"
              class="mb-4"
              :text="error"
            />

            <v-alert
              v-if="resultado?.tipo === 'ok'"
              type="success"
              variant="tonal"
              density="comfortable"
              class="mb-4"
            >
              Se exportaron {{ resultado.filas }} jornadas
              <template v-if="resultado.personas">
                y {{ resultado.personas }} personas
              </template>
              a <code class="mono">{{ resultado.ruta }}</code>
            </v-alert>

            <v-alert
              v-else-if="resultado?.tipo === 'vacio'"
              type="warning"
              variant="tonal"
              density="comfortable"
              class="mb-4"
              :text="resultado.mensaje"
            />

            <v-row density="compact">
              <v-col cols="12" sm="6">
                <v-text-field v-model="desde" type="month" label="Mes desde" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="hasta" type="month" label="Mes hasta" />
              </v-col>
            </v-row>

            <p class="text-caption text-medium-emphasis mb-4">
              {{
                mesesEnRango > 0
                  ? `${mesesEnRango} ${mesesEnRango === 1 ? 'mes en el rango' : 'meses en el rango'}.`
                  : 'El rango de meses no es válido.'
              }}
            </p>

            <v-switch
              v-model="soloEnviadas"
              color="primary"
              label="Solo actividades enviadas y validadas"
              hide-details
              density="compact"
            />
            <p class="text-caption text-medium-emphasis mt-2 mb-4">
              Es lo que se recomienda: una jornada en borrador todavía puede
              cambiar, y el 345W no debería incluir datos que después se corrigen.
            </p>

            <!-- Checklist de jornadas -->
            <div class="d-flex align-center mb-2">
              <span class="text-subtitle-2">Jornadas a exportar</span>
              <v-spacer />
              <v-btn
                size="x-small"
                variant="text"
                class="px-1"
                :prepend-icon="CheckSquare"
                :disabled="!candidatas.length"
                @click="marcarTodas"
              >
                Todas
              </v-btn>
              <v-btn
                size="x-small"
                variant="text"
                class="px-1"
                :prepend-icon="Square"
                :disabled="!seleccionadas.length"
                @click="marcarNinguna"
              >
                Ninguna
              </v-btn>
            </div>

            <v-progress-linear v-if="cargandoChecklist" indeterminate color="primary" class="mb-2" />

            <v-sheet
              v-else
              variant="outlined"
              rounded
              class="checklist"
            >
              <div v-if="!candidatas.length" class="text-body-2 pa-4 text-medium-emphasis">
                No hay jornadas en ese rango de meses.
              </div>

              <v-checkbox-group v-else v-model="seleccionadas" density="compact" hide-details>
                <v-checkbox
                  v-for="fila in candidatas"
                  :key="fila.actividad_id"
                  :value="fila.actividad_id"
                  color="primary"
                  class="fila-check"
                >
                  <template #label>
                    <div class="fila-contenido">
                      <span class="fila-fecha mono">{{ fila.fecha ?? '—' }}</span>
                      <span class="fila-titulo">{{ fila.titulo ?? 'Sin título' }}</span>
                      <v-chip
                        size="x-small"
                        variant="tonal"
                        :color="ETIQUETA_ESTADO[fila.estado]?.color ?? 'secondary'"
                        class="fila-estado"
                      >
                        {{ ETIQUETA_ESTADO[fila.estado]?.texto ?? fila.estado }}
                      </v-chip>
                      <span class="fila-personas text-medium-emphasis">
                        {{ fila.total_atenciones ?? 0 }} personas
                      </span>
                    </div>
                  </template>
                </v-checkbox>
              </v-checkbox-group>
            </v-sheet>

            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              <template v-if="candidatas.length">
                Se exportarán <strong>{{ aExportar.length }}</strong> de
                {{ candidatas.length }} jornadas del rango
                ({{ personasTotales }} personas en total).
              </template>
              <template v-else> Cargá el rango de meses para ver las jornadas. </template>
            </p>

            <v-alert
              v-if="descartadasPorEstado > 0"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-3"
              :text="`${descartadasPorEstado} jornadas marcadas están en borrador y no se van a exportar por el filtro de estado.`"
            />

            <v-switch
              v-model="incluirDetalle"
              color="primary"
              label="Incluir la hoja de detalle por persona"
              hide-details
              density="compact"
              class="mt-4"
            />
            <p class="text-caption text-medium-emphasis mt-2">
              Son {{ personasTotales }} filas, una por persona atendida, con
              cédula y nombre. Ese archivo sale con datos personales identificables:
              conviene mandarlo solo a quien corresponde.
            </p>

            <v-btn
              color="primary"
              variant="flat"
              class="mt-5"
              :prepend-icon="FileSpreadsheet"
              :loading="exportando"
              :disabled="!puedeExportar"
              @click="exportar"
            >
              Exportar a Excel
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="5">
        <v-card variant="outlined" class="mb-4">
          <v-card-item>
            <span class="sobreline">Tu sesión</span>
            <v-card-title class="text-subtitle-1 mt-1">
              {{ auth.profile?.email ?? '—' }}
            </v-card-title>
          </v-card-item>
          <v-card-text>
            <div class="text-body-2">
              <div>
                <strong>Rol</strong>: {{ auth.profile?.rol ?? '—' }}
              </div>
              <div>
                <strong>Coordinación</strong>: {{ auth.coordinacion ?? 'Todas' }}
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card variant="outlined">
          <v-card-item>
            <span class="sobreline">Alcance</span>
            <v-card-title class="text-subtitle-1 mt-1">
              Actividades que podés exportar
            </v-card-title>
          </v-card-item>
          <v-card-text>
            <div class="cifra text-h4 mb-2">{{ actividadesVisibles ?? '—' }}</div>

            <div v-if="porEstado" class="d-flex flex-wrap ga-2 mb-3">
              <v-chip size="small" variant="tonal" color="warning">
                {{ porEstado.borrador }} borrador
              </v-chip>
              <v-chip size="small" variant="tonal" color="info">
                {{ porEstado.enviada }} enviada
              </v-chip>
              <v-chip size="small" variant="tonal" color="success">
                {{ porEstado.validada }} validada
              </v-chip>
            </div>

            <v-btn
              size="small"
              variant="text"
              class="px-0"
              :prepend-icon="RefreshCw"
              @click="contarActividades"
            >
              Volver a contar
            </v-btn>
          </v-card-text>
        </v-card>

        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4"
          :icon="Info"
          text="La consulta de agregados corre con tu sesión, no con una clave de servicio. Lo que ves acá es exactamente lo que entra al archivo."
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.checklist {
  max-height: 340px;
  overflow-y: auto;
}

.fila-check {
  padding-inline: 8px;
}

/* La fila del checklist se arma con grid para que las columnas no se corran
   cuando cambia el largo del titulo de una jornada a otra. */
.fila-contenido {
  display: grid;
  grid-template-columns: 6.5rem 1fr auto auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding-block: 2px;
}

.fila-fecha {
  font-size: 0.78rem;
  opacity: 0.7;
}

.fila-titulo {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fila-personas {
  font-size: 0.78rem;
  white-space: nowrap;
}
</style>
