<script setup>
/**
 * Grilla de carga rapida de atenciones.
 *
 * El flujo esta disenado para carga masiva: se escribe sobre la fila y Enter
 * salta a la siguiente columna, Enter en la ultima celda crea una fila nueva.
 * Es lo que hace una persona cuando carga 30 personas en una jornada y quiere
 * terminar en cinco minutos.
 *
 * Cada fila tiene ademas una celda de "resumen": las iniciales de las
 * condiciones que marco esa persona, para poder revisarla de un vistazo sin
 * abrir el dialogo. Es el equivalente en la grilla de lo que hace el formulario
 * completo.
 */
import { computed, nextTick, ref } from 'vue'
import {
  UserPlus,
  X,
} from 'lucide-vue-next'

import { comoOpciones } from '../lib/catalogos.js'
import { ATENCION, validar } from '../lib/esquemas.js'
import { useActividadesStore } from '../stores/actividades.js'

const store = useActividadesStore()

const SexoF = 'F'
const SexoM = 'M'
const SexoO = 'O'

const OPCIONES_SEXO = [
  { title: 'F', value: SexoF },
  { title: 'M', value: SexoM },
  { title: 'O', value: SexoO },
]

const opcionesGrupo = computed(() => comoOpciones(store.catalogos?.grupos))

// Las condiciones del 345W, en el orden de la vista 007.
const CONDICIONES = [
  { clave: 'indigena', etiqueta: 'Ind', titulo: 'Indígena' },
  { clave: 'gestante', etiqueta: 'Ges', titulo: 'Gestante o lactancia' },
  { clave: 'discapacidad', etiqueta: 'Dis', titulo: 'Discapacidad' },
  { clave: 'lgbtiq', etiqueta: 'LGB', titulo: 'LGBTIQ+' },
  { clave: 'victima_trata', etiqueta: 'VT', titulo: 'Víctima de trata' },
]

// ---------------------------------------------------------------------------
// Filas editables
// ---------------------------------------------------------------------------

const filas = ref([])
const proximoId = ref(1)

function nuevaFila(editada = null) {
  const id = proximoId.value++
  return {
    id,
    nombre_apellido: editada?.nombre_apellido ?? '',
    cedula: editada?.cedula ?? '',
    edad: editada?.edad ?? null,
    sexo: editada?.sexo ?? SexoF,
    grupo_atencion_id: editada?.grupo_atencion_id ?? null,
    ...Object.fromEntries(CONDICIONES.map((c) => [c.clave, editada?.[c.clave] ?? false])),
  }
}

function agregarFila(desplazar = true) {
  const fila = nuevaFila()
  filas.value = [...filas.value, fila]
  if (desplazar) {
    nextTick(() => {
      document.querySelector(`[data-fila="${fila.id}"] input`)?.focus()
    })
  }
  return fila
}

function quitarFila(id) {
  filas.value = filas.value.filter((f) => f.id !== id)
}

function enEnter(fila, columna) {
  // En la ultima columna de la fila, Enter crea la fila siguiente: es el atajo
  // que hace que la carga masiva sea fluida.
  if (columna === 'condiciones') {
    agregarFila()
    return
  }
  const orden = ['nombre_apellido', 'cedula', 'edad', 'sexo', 'grupo_atencion_id']
  const siguiente = orden[orden.indexOf(columna) + 1]
  if (siguiente) {
    siguienteColumna(fila.id, siguiente)
  }
}

function siguienteColumna(filaId, columna) {
  nextTick(() => {
    const celda = document.querySelector(
      `[data-fila="${filaId}"] [data-col="${columna}"]`,
    )
    if (!celda) return
    const campo = celda.querySelector('input, button')
    if (campo) campo.focus()
  })
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

const guardando = ref(false)
const error = ref(null)
const resultado = ref(null)

async function guardarTodas() {
  error.value = null
  resultado.value = null

  const completas = filas.value.filter((f) => f.nombre_apellido.trim())
  if (!completas.length) {
    error.value = 'Escribí al menos un nombre para guardar.'
    return
  }

  // Se validan TODAS las filas antes de tocar la base, para no dejar la carga a
  // medias si la septima tiene un error. El mensaje nombra a la persona para que
  // se sepa cuál corregir.
  //
  // Usa el mismo schema que el dialogo de edicion. Antes cada pantalla tenia su
  // propia regla: la grilla exigia `Number.isInteger` en la edad y el dialogo no,
  // asi que el mismo dato se aceptaba en una y se rechazaba en la otra (la base
  // lo rebutaba con 22P02 al guardar). Ademas `Number('')` es 0, con lo que una
  // edad vacia terminaba guardada como 0.
  for (const fila of completas) {
    const problema = validar(ATENCION, fila)
    if (problema) {
      error.value = `«${fila.nombre_apellido.trim()}»: ${problema}`
      return
    }
  }

  guardando.value = true
  const guardadas = new Set()
  try {
    for (const fila of completas) {
      // `parse` no tira: la fila ya paso el `safeParse` de arriba.
      const datos = ATENCION.parse(fila)
      const creada = await store.crearAtencion({
        ...datos,
        tipo_discapacidad: datos.discapacidad ? datos.tipo_discapacidad : null,
      })
      if (!creada) break
      guardadas.add(fila.id)
    }
    if (guardadas.size === completas.length) {
      filas.value = []
      resultado.value = { guardadas: guardadas.size }
    } else {
      // Se guardo una parte: se avisa exactamente cuantas y se descartan las
      // que si entraron, para no duplicarlas al reintentar. El descarte se hace
      // por id y no por posicion, porque una fila en blanco intercalada entre
      // dos completas correria el conteo y dejaria en la grilla una persona que
      // ya esta en la base.
      filas.value = filas.value.filter((f) => !guardadas.has(f.id))
      resultado.value = { parcial: guardadas.size, total: completas.length }
    }
  } catch (e) {
    error.value = store.errorDetalle ?? 'No se pudieron guardar las personas.'
    filas.value = filas.value.filter((f) => !guardadas.has(f.id))
  } finally {
    guardando.value = false
  }
}

defineExpose({ agregarFila })
</script>

<template>
  <div>
    <v-alert
      v-if="store.errorDetalle"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-4"
      :text="store.errorDetalle"
    />
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-4"
      :text="error"
    />
    <v-alert
      v-if="resultado?.guardadas"
      type="success"
      variant="tonal"
      density="compact"
      class="mb-4"
      :text="`Se guardaron ${resultado.guardadas} personas. Ya aparecen en la lista de arriba.`"
    />
    <v-alert
      v-else-if="resultado?.parcial"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-4"
      :text="`Se guardaron ${resultado.parcial} de ${resultado.total}. Revisá el error y volvé a guardar las que quedaron en la grilla.`"
    />

    <div class="grilla-cabecera" aria-hidden="true">
      <span>Nombre y apellido *</span>
      <span>Cédula</span>
      <span>Edad</span>
      <span>Sexo</span>
      <span>Grupo</span>
      <span>Condiciones</span>
      <span />
    </div>

    <div v-for="fila in filas" :key="fila.id" class="grilla-fila" :data-fila="fila.id">
      <div data-col="nombre_apellido">
        <span class="grilla-fila__etiqueta">Nombre y apellido *</span>
        <v-text-field
          v-model="fila.nombre_apellido"
          placeholder="Nombre y apellido"
          hide-details
          @keyup.enter="enEnter(fila, 'nombre_apellido')"
        />
      </div>
      <div data-col="cedula">
        <span class="grilla-fila__etiqueta">Cédula</span>
        <v-text-field
          v-model="fila.cedula"
          placeholder="Opcional"
          hide-details
          @keyup.enter="enEnter(fila, 'cedula')"
        />
      </div>
      <div data-col="edad">
        <span class="grilla-fila__etiqueta">Edad</span>
        <v-text-field
          v-model="fila.edad"
          type="number"
          min="0"
          max="120"
          placeholder="—"
          hide-details
          @keyup.enter="enEnter(fila, 'edad')"
        />
      </div>
      <div data-col="sexo">
        <span class="grilla-fila__etiqueta">Sexo</span>
        <v-select
          v-model="fila.sexo"
          :items="OPCIONES_SEXO"
          hide-details
          @keyup.enter="enEnter(fila, 'sexo')"
        />
      </div>
      <div data-col="grupo_atencion_id">
        <span class="grilla-fila__etiqueta">Grupo de atención</span>
        <v-select
          v-model="fila.grupo_atencion_id"
          :items="opcionesGrupo"
          placeholder="Opcional"
          hide-details
          clearable
          @keyup.enter="enEnter(fila, 'grupo_atencion_id')"
        />
      </div>
      <div class="grilla-fila__condiciones" data-col="condiciones">
        <span class="grilla-fila__etiqueta">Condiciones</span>
        <v-tooltip
          v-for="c in CONDICIONES"
          :key="c.clave"
          :text="c.titulo"
          location="top"
        >
          <template #activator="{ props: tooltipProps }">
            <button
              v-bind="tooltipProps"
              type="button"
              class="pastilla"
              :class="{ 'pastilla--activa': fila[c.clave] }"
              :aria-pressed="fila[c.clave] ? 'true' : 'false'"
              @click="fila[c.clave] = !fila[c.clave]"
              @keyup.enter="enEnter(fila, 'condiciones')"
            >
              {{ c.etiqueta }}
            </button>
          </template>
        </v-tooltip>
      </div>
      <div class="grilla-fila__acciones">
        <v-btn
          :icon="X"
          size="x-small"
          variant="text"
          color="medium-emphasis"
          title="Quitar esta fila"
          @click="quitarFila(fila.id)"
        />
      </div>
    </div>

    <div v-if="!filas.length" class="text-center py-8 text-medium-emphasis text-body-2">
      Agregá la primera persona con el botón de abajo.
    </div>

    <div class="d-flex align-center ga-2 mt-4">
      <v-btn
        variant="outlined"
        size="small"
        :prepend-icon="UserPlus"
        @click="agregarFila()"
      >
        Agregar persona
      </v-btn>
      <v-btn
        v-if="filas.length"
        color="primary"
        variant="flat"
        size="small"
        :loading="guardando"
        @click="guardarTodas"
      >
        Guardar {{ filas.filter((f) => f.nombre_apellido.trim()).length }}
        {{ filas.filter((f) => f.nombre_apellido.trim()).length === 1 ? 'persona' : 'personas' }}
      </v-btn>
      <v-spacer />
      <!-- La ayuda tiene sentido con teclado fisico, que es como se usa en
           escritorio. Apilada, la grilla ya no tiene "columnas" a las que saltar
           y el texto solo empuja el ancho del renglon. -->
      <span class="text-caption text-medium-emphasis grilla-atajo">
        Enter pasa a la siguiente columna
      </span>
    </div>
  </div>
</template>

<style scoped>
/* La grilla replica el ritmo de la tabla de arriba: mismas alturas de fila y
   mismo color de regla, para que la pantalla se lea como un solo documento. */
.grilla-cabecera,
.grilla-fila {
  display: grid;
  grid-template-columns: minmax(180px, 2fr) minmax(100px, 1fr) 76px 72px minmax(140px, 1fr) auto 36px;
  gap: var(--e-3);
  align-items: center;
}

.grilla-cabecera {
  padding: 0 2px 8px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tinta-3);
  border-bottom: 1px solid var(--regla-fuerte);
}

.grilla-fila {
  padding: 8px 0;
  border-bottom: 1px solid var(--regla);
}

.grilla-fila:focus-within {
  background: var(--azul-tenue);
  box-shadow: inset 3px 0 0 var(--azul);
}

/* La etiqueta de cada campo existe solo para el layout apilado. En escritorio la
   pone la fila de cabecera y repetirla seria ruido. */
.grilla-fila__etiqueta {
  display: none;
}

/* Debajo del breakpoint `sm` de Vuetify (600px) la grilla de 7 columnas no entra:
   suma ~800px de minimo y el `v-card` que la envuelve recorta el desborde, con lo
   que los campos de sexo, grupo y condiciones quedan inalcanzables. En vez de
   dejar que se scrollee en horizontal -- que en un celular es molesto y esconde
   la columna de acciones -- cada fila se apila: nombre y condiciones ocupan el
   ancho completo y los campos cortos van de a dos. */
@media (max-width: 599.98px) {
  .grilla-cabecera {
    display: none;
  }

  .grilla-fila {
    grid-template-columns: 1fr 1fr;
    gap: var(--e-2) var(--e-3);
    padding: var(--e-3) 0 var(--e-4);
  }

  .grilla-fila > [data-col='nombre_apellido'],
  .grilla-fila > [data-col='condiciones'],
  .grilla-fila > .grilla-fila__acciones {
    grid-column: 1 / -1;
  }

  .grilla-fila__etiqueta {
    display: block;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--tinta-3);
    margin-bottom: 2px;
  }

  /* Apilado no es lo mismo que en columna: la fila tiene que leerse como un
     bloque, asi que la guia azul de foco va arriba y no al costado. */
  .grilla-fila:focus-within {
    box-shadow: inset 0 3px 0 var(--azul);
  }

  .grilla-fila__acciones {
    justify-content: flex-start;
  }

  .grilla-atajo {
    display: none;
  }
}

.grilla-fila__condiciones {
  display: flex;
  gap: 3px;
  align-items: center;
  flex-wrap: wrap;
}

.grilla-fila__acciones {
  display: flex;
  justify-content: flex-end;
}

.pastilla {
  border: 1px solid var(--regla-fuerte);
  background: var(--superficie);
  color: var(--tinta-3);
  border-radius: 3px;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 3px 6px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  font-family: var(--fuente-ui);
}

.pastilla:hover {
  border-color: var(--tinta-4);
  color: var(--tinta-2);
}

.pastilla--activa {
  background: var(--azul);
  border-color: var(--azul);
  color: #fff;
}

.pastilla:focus-visible {
  outline: 2px solid var(--azul);
  outline-offset: 1px;
}
</style>
