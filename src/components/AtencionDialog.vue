<script setup>
/**
 * Dialogo de edicion de una atencion.
 *
 * Hace las dos cosas que la grilla de carga rapida no puede: editar una persona
 * ya guardada y cargar los servicios que recibio. La grilla sirve para escribir
 * rapido; este dialogo sirve para el detalle.
 *
 * Dos avisos visibles en el formulario, ambos sobre trampas reales del 345W:
 *
 *   - sexo = 'O' no entra en ningun desglose de sexo. Se avisa, no se bloquea.
 *   - tipo_discapacidad solo tiene sentido si la casilla discapacidad esta
 *     marcada, asi que el campo se deshabilita cuando no lo esta.
 */
import { computed, ref, watch } from 'vue'
import {
  TriangleAlert,
  Info,
  Plus,
  Trash2,
} from 'lucide-vue-next'

import { useActividadesStore } from '../stores/actividades.js'
import { comoOpciones } from '../lib/catalogos.js'
import { tipoDiscapacidadIncoherente } from '../lib/morbilidad.js'
import { ATENCION, validar, validarCampo } from '../lib/esquemas.js'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  atencion: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'guardado', 'borrado'])

const store = useActividadesStore()

const CONDICIONES = [
  { clave: 'indigena', etiqueta: 'Indígena' },
  { clave: 'gestante', etiqueta: 'Gestante o lactancia' },
  { clave: 'discapacidad', etiqueta: 'Discapacidad' },
  { clave: 'lgbtiq', etiqueta: 'LGBTIQ+' },
  { clave: 'victima_trata', etiqueta: 'Víctima de trata' },
]

const OPCIONES_SEXO = [
  { title: 'F — Femenino', value: 'F' },
  { title: 'M — Masculino', value: 'M' },
  { title: 'O — Otro', value: 'O' },
]

const form = ref({
  nombre_apellido: '',
  cedula: '',
  edad: null,
  sexo: 'F',
  motivo: '',
  grupo_atencion_id: null,
  indigena: false,
  gestante: false,
  discapacidad: false,
  tipo_discapacidad: '',
  lgbtiq: false,
  victima_trata: false,
})

const servicios = ref([])
const guardando = ref(false)
const error = ref(null)
const borrarConfirmado = ref(false)

const opcionesGrupo = computed(() => comoOpciones(store.catalogos?.grupos))

// Los servicios son del catalogo de la coordinacion de la actividad: un
// servicio de Psicologia no pertenece a una jornada de Agua.
const opcionesServicio = computed(() => {
  const todos = (store.catalogos?.servicios ?? []).filter(
    (s) => s.coordinacion_id === store.actividad?.coordinacion_id && s.activo !== false,
  )
  return todos.map((s) => ({ title: s.nombre, value: s.id }))
})

watch(
  () => props.modelValue,
  (abierto) => {
    if (!abierto) return
    error.value = null
    borrarConfirmado.value = false
    const a = props.atencion
    form.value = a
      ? {
          nombre_apellido: a.nombre_apellido ?? '',
          cedula: a.cedula ?? '',
          edad: a.edad ?? null,
          sexo: a.sexo ?? 'F',
          motivo: a.motivo ?? '',
          grupo_atencion_id: a.grupo_atencion_id ?? null,
          indigena: !!a.indigena,
          gestante: !!a.gestante,
          discapacidad: !!a.discapacidad,
          tipo_discapacidad: a.tipo_discapacidad ?? '',
          lgbtiq: !!a.lgbtiq,
          victima_trata: !!a.victima_trata,
        }
      : {
          nombre_apellido: '', cedula: '', edad: null, sexo: 'F', motivo: '',
          grupo_atencion_id: null, indigena: false, gestante: false,
          discapacidad: false, tipo_discapacidad: '', lgbtiq: false, victima_trata: false,
        }

    servicios.value = (store.serviciosPorAtencion[props.atencion?.id] ?? []).map((s) => ({
      servicio_id: s.servicio_id,
      cantidad: s.cantidad,
    }))
  },
)

const avisoSexoO = computed(
  () => form.value.sexo === 'O' || form.value.sexo === null,
)

const tipoIncoherente = computed(() => tipoDiscapacidadIncoherente(form.value))

function agregarServicio() {
  servicios.value = [...servicios.value, { servicio_id: null, cantidad: 1 }]
}

function quitarServicio(indice) {
  servicios.value = servicios.value.filter((_, i) => i !== indice)
}

/**
 * Las dos reglas del formulario, para marcar el campo mientras se escribe.
 *
 * La edad se valida con el schema entero pero se lee solo su error, asi que el
 * nombre vacio no tapa el mensaje de la edad. `validateOn` es `input lazy` para
 * no gritarle a alguien recien que abrio el dialogo.
 */
const reglaNombre = (valor) => validarCampo(ATENCION, form.value, 'nombre_apellido') ?? true
const reglaEdad = (valor) => validarCampo(ATENCION, { ...form.value, edad: valor }, 'edad') ?? true

async function guardar() {
  error.value = null

  // Un solo schema para el dialogo y para la grilla de carga masiva. Antes cada
  // uno validaba por su cuenta y no coincidian: la grilla exigia edad entera y el
  // dialogo no, y los dos hacian `Number()` sobre el `null` de un campo vacio,
  // que en JavaScript es 0. Asi una persona sin edad registrada terminaba con 0
  // años, y con los rangos del 345W eso la contaba en el rango 0-5.
  const problema = validar(ATENCION, form.value)
  if (problema) {
    error.value = problema
    return
  }

  // `parse` no tira: ya se sabe que paso el `safeParse` de arriba.
  const datos = ATENCION.parse(form.value)

  guardando.value = true
  try {
    const carga = {
      ...datos,
      tipo_discapacidad: datos.discapacidad ? datos.tipo_discapacidad : null,
    }

    const guardada = props.atencion
      ? await store.actualizarAtencion(props.atencion.id, carga)
      : await store.crearAtencion(carga)

    if (!guardada) {
      error.value = store.errorDetalle
      return
    }

    if (servicios.value.length) {
      const conId = servicios.value.filter((s) => s.servicio_id)
      const ok = await store.guardarServicios(guardada.id, conId)
      if (!ok) {
        error.value = `La persona se guardó, pero los servicios no: ${store.errorDetalle}`
        emit('guardado')
        return
      }
    } else if (props.atencion) {
      await store.guardarServicios(guardada.id, [])
    }

    emit('guardado')
  } finally {
    guardando.value = false
  }
}

async function borrar() {
  guardando.value = true
  const ok = await store.borrarAtencion(props.atencion.id)
  guardando.value = false
  if (ok) {
    emit('borrado')
  } else {
    error.value = store.errorDetalle
    borrarConfirmado.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="px-6 pt-5">
        <span class="sobreline">Morbilidad</span>
        <h3 class="text-h6 mt-1">
          {{ atencion ? 'Editar persona atendida' : 'Nueva persona atendida' }}
        </h3>
      </v-card-title>

      <v-card-text class="px-6 pt-4">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
          :text="error"
        />

        <v-row>
          <v-col cols="12" md="7">
            <v-text-field
              v-model="form.nombre_apellido"
            :rules="[reglaNombre]"
            validate-on="input lazy"
              label="Nombre y apellido *"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="5">
            <v-text-field v-model="form.cedula" label="Cédula" hide-details />
          </v-col>

          <v-col cols="6" md="4">
            <v-text-field
              v-model="form.edad"
              type="number"
              step="1"
              min="0"
              max="120"
              label="Edad"
              :rules="[reglaEdad]"
              validate-on="input lazy"
              hint="En blanco si no la sabés"
              persistent-hint
              hide-details
            />
          </v-col>
          <v-col cols="6" md="4">
            <v-select
              v-model="form.sexo"
              :items="OPCIONES_SEXO"
              label="Sexo"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-select
              v-model="form.grupo_atencion_id"
              :items="opcionesGrupo"
              label="Grupo de atención"
              clearable
              hide-details
            />
          </v-col>

          <v-col cols="12">
            <v-text-field
              v-model="form.motivo"
              label="Motivo de la atención"
              hide-details
            />
          </v-col>
        </v-row>

        <v-alert
          v-if="avisoSexoO"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4"
          :icon="Info"
        >
          Con sexo <strong>O</strong> la persona cuenta para el total de atendidos
          pero no suma en Girls, Boys, Female ni Male, porque el 345W no tiene una
          columna para ese caso. Se deja así a propósito en vez de forzar una
          categoría binaria.
        </v-alert>

        <h4 class="rotulo mt-6 mb-3">Condiciones de la persona</h4>
        <v-row>
          <v-col
            v-for="c in CONDICIONES"
            :key="c.clave"
            cols="12"
            sm="6"
            md="4"
          >
            <v-switch
              v-model="form[c.clave]"
              :label="c.etiqueta"
              color="primary"
              density="compact"
              hide-details
            />
          </v-col>

          <v-col cols="12" md="6" class="mt-2">
            <v-text-field
              v-model="form.tipo_discapacidad"
              label="Tipo de discapacidad"
              :disabled="!form.discapacidad"
              :hint="
                form.discapacidad
                  ? 'Opcional.'
                  : 'Marcá la casilla Discapacidad para poder completarlo.'
              "
              persistent-hint
              hide-details="auto"
            />
          </v-col>
        </v-row>

        <v-alert
          v-if="tipoIncoherente"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
          :icon="TriangleAlert"
          text="Había un tipo de discapacidad guardado sin la casilla marcada. Se va a limpiar al guardar, porque el 345W no registra ese dato por separado."
        />

        <div class="d-flex align-center mt-6 mb-2">
          <h4 class="rotulo flex-grow-1 mb-0">Servicios recibidos</h4>
          <v-btn
            size="small"
            variant="text"
            color="primary"
            :prepend-icon="Plus"
            @click="agregarServicio"
          >
            Agregar
          </v-btn>
        </div>

        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
          :icon="Info"
          text="El 345W no pide el total de servicios prestados, así que esto no aparece como columna en el Excel. Queda registrado para el seguimiento de la jornada."
        />

        <div
          v-for="(servicio, i) in servicios"
          :key="i"
          class="d-flex align-center ga-2 mb-2"
        >
          <v-select
            v-model="servicio.servicio_id"
            :items="opcionesServicio"
            label="Servicio"
            hide-details
            class="flex-grow-1"
          />
          <v-text-field
            v-model="servicio.cantidad"
            type="number"
            min="1"
            label="Cant."
            hide-details
            style="max-width: 90px"
          />
          <v-btn
            :icon="Trash2"
            size="small"
            variant="text"
            color="medium-emphasis"
            title="Quitar servicio"
            @click="quitarServicio(i)"
          />
        </div>

        <p v-if="!servicios.length" class="text-caption text-medium-emphasis mb-0">
          Sin servicios cargados.
        </p>
      </v-card-text>

      <v-card-actions class="px-6 pb-5 pt-0">
        <v-btn
          v-if="atencion"
          :prepend-icon="Trash2"
          variant="text"
          color="error"
          :disabled="borrarConfirmado || guardando"
          @click="borrarConfirmado = true"
        >
          Borrar
        </v-btn>
        <v-btn
          v-if="borrarConfirmado"
          color="error"
          variant="flat"
          :loading="guardando"
          @click="borrar"
        >
          Confirmar borrado
        </v-btn>

        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancelar</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="guardando"
          @click="guardar"
        >
          Guardar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
