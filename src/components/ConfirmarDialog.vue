<script setup>
/**
 * Dialogo de confirmacion para acciones que no se pueden deshacer.
 *
 * Existe porque las cuatro acciones destructivas de la app (enviar, validar,
 * revertir, borrar) son irreversibles desde el punto de vista del usuario y
 * el consequence de equivocarse es una jornada que no llega a la ONU, o una
 * que llega con datos mal cargados. El boton de confirmar nombra la accion
 * concreta, no un "Aceptar" generico: el nombre de la accion es lo que la
 * persona lee para confirmar que entendio.
 */
import { TriangleAlert } from 'lucide-vue-next'

defineProps({
  modelValue: { type: Boolean, required: true },
  titulo: { type: String, required: true },
  mensaje: { type: String, required: true },
  // Las lineas de detalle van en una lista, para que la consecuencia se lea
  // antes de confirmar y no despues.
  detalles: { type: Array, default: () => [] },
  textoConfirmar: { type: String, required: true },
  color: { type: String, default: 'primary' },
  icon: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue', 'confirmar'])
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="460"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-start ga-3 text-h6">
        <v-icon
          v-if="icon"
          :icon="icon || TriangleAlert"
          :color="color"
          size="22"
          class="mt-1 flex-none"
        />
        <span>{{ titulo }}</span>
      </v-card-title>

      <v-card-text>
        <p class="mb-2 text-body-2" style="line-height: 1.5">{{ mensaje }}</p>

        <ul
          v-if="detalles.length"
          class="text-caption text-medium-emphasis ps-4"
          style="line-height: 1.5"
        >
          <li v-for="(detalle, i) in detalles" :key="i" class="mb-1">{{ detalle }}</li>
        </ul>
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">
          Cancelar
        </v-btn>
        <v-btn :color="color" variant="flat" @click="emit('confirmar')">
          {{ textoConfirmar }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
