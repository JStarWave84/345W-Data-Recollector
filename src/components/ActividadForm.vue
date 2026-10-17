<script setup>
/**
 * Formulario de la cabecera de la jornada.
 *
 * Se guarda al salir del campo, no con un boton "Guardar": en terreno, la
 * persona completa el formulario de arriba hacia abajo y no quiere que cada
 * cambio de foco sea un paso explicito. La cabecera se persiste sola, y el
 * guardado de la morbilidad (que si tiene confirmacion, porque va persona por
 * persona) es un gesto separado.
 *
 * El guardado automatico va con un debounce de 700 ms y con un indicador de
 * estado explicito. Sin el debounce, tabular entre titulo y mes dispararia dos
 * UPDATE seguidas; sin el indicador, en una jornada sin buena senal la persona
 * no tiene forma de saber si lo que escribio llego o se quedo en el aire.
 *
 * Los campos que el 345W exige van marcados con un asterisco y una nota al pie
 * que explica por que: DEPARTMENT siempre va vacio en el Excel y ese campo en
 * la cabecera se llama ADMIN 3 = parroquia.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { CircleCheck, Crosshair, Save } from 'lucide-vue-next'

import { useActividadesStore } from '../stores/actividades.js'
import { comoOpciones } from '../lib/catalogos.js'
import { nombresEstados, municipiosDe, parroquiasDe } from '../lib/venezuela.js'
import { ES_MOVIL } from '../lib/plataforma.js'
import { CABECERA, validar, validarCampo } from '../lib/esquemas.js'

const store = useActividadesStore()

const gpsPeticion = ref(false)
const gpsError = ref(null)

// 'inactivo' = no hay nada nuevo. 'pendiente' = el usuario toco algo.
// 'guardando' = hay un UPDATE en vuelo. 'guardado' | 'error' = como termino.
const estadoGuardado = ref('inactivo')
let temporizador = null
const formulario = ref(null)

/**
 * Error de validacion de la cabecera, para mostrarlo arriba.
 *
 * El formulario se guarda solo al salir de un campo, asi que no hay un submit
 * donde frenar: si el titulo esta vacio y la persona tabula hacia el mes, lo que
 * se guarda es valido (el titulo puede esperar) y no vale la pena bloquear. Lo
 * que si se marca es el campo, en rojo, mientras se escribe.
 *
 * Por eso el mensaje vive en `errorCabecera` y no en un alert que corta el
 * flujo: interrumpir el guardado automatico por un titulo todavia en blanco
 * seria peor que guardarlo.
 */
const errorCabecera = ref(null)

const form = reactive({
  titulo: '',
  fecha: null,
  mes_reporte: '',
  coordinacion_id: null,
  responsable: '',
  estado_ubicacion: '',
  municipio: '',
  parroquia: '',
  ubicacion: '',
  tipo_establecimiento_id: null,
  latitud: '',
  longitud: '',
  fuente_financiamiento_id: null,
  observaciones: '',
})

// La actividad se carga despues de montar el componente, asi que el watcher
// tiene que rellenar el formulario cada vez que cambie el identificador.
watch(
  () => store.actividad?.id,
  () => {
    const a = store.actividad
    if (!a) return
    form.titulo = a.titulo ?? ''
    form.fecha = a.fecha ?? null
    form.mes_reporte = a.mes_reporte?.slice(0, 7) ?? ''
    form.coordinacion_id = a.coordinacion_id
    form.responsable = a.responsable ?? ''
    form.estado_ubicacion = a.estado_ubicacion ?? ''
    form.municipio = a.municipio ?? ''
    form.parroquia = a.parroquia ?? ''
    form.ubicacion = a.establecimiento ?? ''
    form.tipo_establecimiento_id = a.tipo_establecimiento_id ?? null
    form.latitud = a.latitud ?? ''
    form.longitud = a.longitud ?? ''
    form.fuente_financiamiento_id = a.fuente_financiamiento_id ?? null
    form.observaciones = a.observaciones ?? ''
  },
  { immediate: true },
)

const opcionesTipo = computed(() => comoOpciones(store.catalogos?.tipos))
const opcionesFuente = computed(() => comoOpciones(store.catalogos?.fuentes))
const opcionesCoordinacion = computed(() => comoOpciones(store.catalogos?.coordinaciones))

/**
 * Validacion de un campo suelto, para las `:rules` de Vuetify.
 *
 * Se valida el campo contra el schema completo con el resto en un estado neutro
 * **valido**, y se lee solo el error de ESE campo. Si se usara `validar`, que
 * devuelve el primer error de la lista, todos los campos se marcarian con el
 * error del titulo, que esta vacio en los neutros.
 *
 * La coherencia entre campos (parroquia sin municipio) la revisa el `safeParse`
 * del guardado, no la regla de un campo suelto.
 */
function regla(campo) {
  return (valor) => {
    const neutro = {
      titulo: 'Jornada',
      mes_reporte: '2026-01',
      coordinacion_id: '11111111-1111-4111-8111-111111111111',
      estado_ubicacion: 'Distrito Capital',
      municipio: 'Libertador',
      parroquia: 'El Valle',
    }
    return validarCampo(CABECERA, { ...neutro, [campo]: valor }, campo) ?? true
  }
}

/**
 * Campos que el 345W exige y que la cabecera guarda sin restricts.
 *
 * Se listan a mano en vez de derivarlo del schema para no tener que hacer el
 * `safeParse` completo en cada tecla: la idea es mostrar un resumen, no una
 * lista completa de pendientes.
 */
const faltan = computed(() => {
  const errores = []
  if (!form.titulo?.trim()) errores.push('título')
  if (!form.mes_reporte) errores.push('mes de reporte')
  if (!form.coordinacion_id) errores.push('coordinación')
  if (!form.estado_ubicacion) errores.push('estado')
  if (!form.municipio) errores.push('municipio')
  if (!form.parroquia) errores.push('parroquia')
  return errores
})

// Los servicios son de la coordinacion. El admin puede cambiar de coordinacion
// y el selector de servicios lo sigue; el coordinador no puede moverse de la
// suya porque la RLS lo rechaza, asi que no tiene sentido ofrecerlo.
const puedeCambiarCoordinacion = computed(() => store.editable)

// ---------------------------------------------------------------------------
// Guardado automatico
// ---------------------------------------------------------------------------

async function guardar() {
  if (!store.actividad) return

  // El guardado es automatico: se dispara al salir de cualquier campo. Si la
  // cabecera todavia esta incompleta, se corta aqui en vez de mandar un UPDATE
  // con titulo vacio a la base. La base lo aceptaria (es nullable), y despues el
  // 345W saldria con una jornada sin identificar.
  const problema = validar(CABECERA, form)
  errorCabecera.value = problema

  // Solo se bloquea por los campos que el 345W exige. Un titulo en blanco no
  // impide guardar el resto: en terreno se completa la cabecera sobre la marcha
  // y perder lo demas por eso seria peor.
  if (problema && faltan.value.length) {
    estadoGuardado.value = 'pendiente'
    return
  }

  estadoGuardado.value = 'guardando'
  const ok = await store.guardarCabecera({ ...form })
  estadoGuardado.value = ok ? 'guardado' : 'error'
}

function programarGuardado() {
  if (!store.editable) return
  estadoGuardado.value = 'pendiente'
  clearTimeout(temporizador)
  temporizador = setTimeout(guardar, 700)
}

/**
 * focusout en vez de blur en cada campo: focusout sube por el arbol, asi que
 * un solo listener alcanza para los catorce campos. La comprobacion de
 * relatedTarget evita guardar cuando el foco pasa de un campo a otro del mismo
 * formulario, que es el caso mas comun al tabular.
 */
function alSalirDeCampo(e) {
  if (!store.editable) return
  if (e.relatedTarget && formulario.value?.contains(e.relatedTarget)) return
  programarGuardado()
}

onBeforeUnmount(() => clearTimeout(temporizador))

// ---------------------------------------------------------------------------
// GPS opcional. Si el plugin no esta, el permiso se deniega o no hay senal, los
// campos numericos siguen editables a mano: el boton es una comodidad, no un
// requisito. Por eso el error no interrumpe nada, solo lo explica.
//
// Solo corre en movil, y el boton solo se muestra ahi (ver `ES_MOVIL` mas
// abajo). En escritorio el plugin es un stub que devuelve 0,0 sin leer nada
// real, asi que el boton no tendria nada que escribir.
//
// La API del plugin es la de v2: `checkPermissions` y `requestPermissions`
// devuelven un objeto `{ location, coarseLocation }`, no el string 'granted'
// que devolvian los nombres viejos `isPermissionGranted`/`requestPermission`.
// ---------------------------------------------------------------------------

/** Permiso de ubicacion concedido, sea preciso o aproximado. */
function ubicoConcedido(perms) {
  return perms.location === 'granted' || perms.coarseLocation === 'granted'
}

/**
 * Android rechaza el permiso si la ubicacion del sistema esta apagada, con un
 * mensaje propio en vez del error generico del plugin. Es el caso mas comun en
 * un celular recien comprado y la unica forma de que el mensaje sea util es
 * decirle a la persona que abra los ajustes en vez de que pruebe afuera.
 */
function UbicacionApagada(e) {
  return String(e).toLowerCase().includes('location services are disabled')
}

async function ubicar() {
  gpsError.value = null
  gpsPeticion.value = true
  try {
    const geo = await import('@tauri-apps/plugin-geolocation')

    let perms = await geo.checkPermissions()
    if (perms.location !== 'granted' && perms.coarseLocation !== 'granted') {
      perms = await geo.requestPermissions(['location'])
    }

    if (!ubicoConcedido(perms)) {
      gpsError.value =
        'No se concedió el permiso de ubicación. Escribí las coordenadas a mano.'
      return
    }

    // Sin `enableHighAccuracy` el plugin pide una lectura de baja precision
    // (`PRIORITY_LOW_POWER` en Android) que adentro de un edificio no resuelve
    // nunca. Con `maximumAge: 0` tampoco acepta la ultima posicion conocida,
    // asi que las dos opciones van juntas: una lectura fresca y fina.
    const pos = await geo.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
    form.latitud = Number(pos.coords.latitude.toFixed(6))
    form.longitud = Number(pos.coords.longitude.toFixed(6))
    // El GPS escribe en los campos, asi que hay que disparar el guardado a mano:
    // el focusout ya paso cuando sepidio el permiso.
    programarGuardado()
  } catch (e) {
    // Sin esto el error se pierde entero y un fallo en campo no se puede
    // diagnosticar: la app de escritorio ya loguea en 7 lugares.
    console.error('[gps] no se pudo leer la ubicacion', e)

    gpsError.value = UbicacionApagada(e)
      ? 'La ubicación está apagada en el teléfono. Activala en los ajustes y probá de nuevo.'
      : 'No se pudo leer la ubicación. Escribí las coordenadas a mano, o probá de nuevo afuera.'
  } finally {
    gpsPeticion.value = false
  }
}
</script>

<template>
  <form
    ref="formulario"
    class="cabecera"
    novalidate
    @submit.prevent="guardar"
    @focusout="alSalirDeCampo"
  >
    <div v-if="store.editable" class="cabecera__estado no-imprimir">
      <span v-if="estadoGuardado === 'guardando'" class="text-caption text-medium-emphasis">
        Guardando…
      </span>
      <span v-else-if="estadoGuardado === 'pendiente'" class="text-caption text-medium-emphasis">
        Cambios sin guardar
      </span>
      <span v-else-if="estadoGuardado === 'guardado'" class="text-caption text-success">
        <v-icon :icon="CircleCheck" size="13" class="mr-1" />Guardado
      </span>
      <span v-else-if="estadoGuardado === 'error'" class="text-caption text-error">
        No se pudo guardar: {{ store.errorDetalle }}
      </span>

      <v-btn
        size="small"
        variant="text"
        color="primary"
        :prepend-icon="Save"
        :disabled="estadoGuardado === 'guardando'"
        @click="guardar"
      >
        Guardar ahora
      </v-btn>
    </div>

    <!--
      Aviso de cabecera incompleta. No interrumpe el guardado automatico: el
      formulario se guarda al salir de un campo y bloquear cada tecla mientras se
      completa la jornada sería peor. Lo que se marca es el campo, en rojo, y acá
      va el resumen de lo que falta.
    -->
    <div
      v-if="store.editable && faltan.length"
      class="cabecera__faltan no-imprimir"
      role="status"
    >
      <strong>Falta completar:</strong> {{ faltan.join(', ') }}.
      La jornada se puede guardar igual, pero no va al 345W hasta que estén.
    </div>

    <section class="cabecera__bloque">
      <h3 class="rotulo mb-4">Jornada</h3>

      <v-row>
        <v-col cols="12" md="7">
          <v-text-field
            v-model="form.titulo"
            label="Título de la jornada *"
            placeholder="Ej. Jornada de atención en la comunidad San Juan"
            :disabled="!store.editable"
            :rules="[regla('titulo')]"
            validate-on="input lazy"
            hide-details
            required
          />
        </v-col>
        <v-col cols="6" md="5">
          <v-text-field
            v-model="form.mes_reporte"
            type="month"
            label="Mes de reporte *"
            :disabled="!store.editable"
            :rules="[regla('mes_reporte')]"
            validate-on="input lazy"
            hide-details
            required
          />
        </v-col>

        <v-col cols="6" md="3">
          <v-text-field
            v-model="form.fecha"
            type="date"
            label="Fecha de la jornada"
            :disabled="!store.editable"
            hide-details
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-select
            v-model="form.coordinacion_id"
            :items="opcionesCoordinacion"
            label="Coordinación *"
            :disabled="!store.editable || !puedeCambiarCoordinacion"
            :rules="[regla('coordinacion_id')]"
            validate-on="input lazy"
            hide-details
            required
          />
        </v-col>
        <v-col cols="6" md="5">
          <v-text-field
            v-model="form.responsable"
            label="Responsable"
            :disabled="!store.editable"
            hide-details
          />
        </v-col>
      </v-row>
    </section>

    <section class="cabecera__bloque">
      <h3 class="rotulo mb-4">Ubicación</h3>

      <v-row>
        <v-col cols="6" md="4">
          <v-select
            v-model="form.estado_ubicacion"
            :items="nombresEstados()"
            label="Estado *"
            :disabled="!store.editable"
            :rules="[regla('estado_ubicacion')]"
            validate-on="input lazy"
            hide-details
            required
            @update:model-value="form.municipio = ''; form.parroquia = ''"
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-select
            v-model="form.municipio"
            :items="municipiosDe(form.estado_ubicacion)"
            label="Municipio *"
            :disabled="!store.editable || !form.estado_ubicacion"
            :rules="[regla('municipio')]"
            validate-on="input lazy"
            hide-details
            required
            filterable
            @update:model-value="form.parroquia = ''"
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-select
            v-model="form.parroquia"
            :items="parroquiasDe(form.estado_ubicacion, form.municipio)"
            label="Parroquia (ADMIN 3) *"
            :disabled="!store.editable || !form.municipio"
            :rules="[regla('parroquia')]"
            validate-on="input lazy"
            hide-details
            required
            filterable
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-text-field
            v-model="form.ubicacion"
            label="Ubicación"
            :disabled="!store.editable"
            hide-details
          />
        </v-col>

        <v-col cols="6" md="4">
          <v-select
            v-model="form.tipo_establecimiento_id"
            :items="opcionesTipo"
            label="Tipo de establecimiento"
            :disabled="!store.editable"
            hide-details
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-text-field
            v-model="form.latitud"
            label="Latitud"
            type="number"
            step="0.000001"
            class="mono-separado"
            :disabled="!store.editable"
            :rules="[regla('latitud')]"
            validate-on="input lazy"
            hide-details
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-text-field
            v-model="form.longitud"
            label="Longitud"
            type="number"
            step="0.000001"
            class="mono-separado"
            :disabled="!store.editable"
            :rules="[regla('longitud')]"
            validate-on="input lazy"
            hide-details
          />
        </v-col>
      </v-row>

      <div v-if="store.editable" class="d-flex align-center ga-3 mt-2">
        <!--
          El boton es solo de movil: en escritorio el plugin es un stub que
          devuelve 0,0 sin leer nada, asi que el boton no tendria nada que
          escribir. El texto de al lado se muestra igual porque las coordenadas
          siempre se pueden escribir a mano.
        -->
        <v-btn
          v-if="ES_MOVIL"
          size="small"
          variant="text"
          color="primary"
          :prepend-icon="Crosshair"
          :loading="gpsPeticion"
          @click="ubicar"
        >
          Usar mi ubicación
        </v-btn>
        <span class="text-caption text-medium-emphasis">
          También podés escribir las coordenadas a mano.
        </span>
      </div>
      <v-alert
        v-if="gpsError"
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3"
        :text="gpsError"
      />
    </section>

    <section class="cabecera__bloque">
      <h3 class="rotulo mb-4">Financiamiento y notas</h3>

      <v-row>
        <v-col cols="12" md="4">
          <v-select
            v-model="form.fuente_financiamiento_id"
            :items="opcionesFuente"
            label="Fuente de financiamiento"
            :disabled="!store.editable"
            hide-details
          />
        </v-col>
        <v-col cols="12">
          <v-textarea
            v-model="form.observaciones"
            label="Observaciones"
            rows="2"
            auto-grow
            :disabled="!store.editable"
            hide-details
          />
        </v-col>
      </v-row>
    </section>
  </form>
</template>

<style scoped>
.cabecera {
  display: flex;
  flex-direction: column;
  gap: var(--e-6);
}

.cabecera__bloque {
  padding: var(--e-5) var(--e-5) var(--e-2);
  background: var(--superficie);
  border: 1px solid var(--regla);
  border-radius: var(--radio-s);
}

/* La fila de estado va arriba de los bloques y no dentro de uno: informa del
   guardado de TODO el formulario, no de la ultima seccion tocada. */
.cabecera__estado {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--e-3);
  min-height: 28px;
}

.cabecera__faltan {
  margin-top: var(--e-1);
  padding: var(--e-2) var(--e-3);
  border-inline-start: 3px solid var(--v-theme-warning);
  background: rgba(var(--v-theme-warning), 0.08);
  border-radius: 0 4px 4px 0;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface));
}
</style>
