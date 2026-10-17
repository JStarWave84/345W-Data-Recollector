<script setup>
/**
 * Estado vacio. Un formulario sin datos es una invitacion a actuar, no un
 * error: el texto dice que hacer y el boton hace exactamente eso.
 */
import { ClipboardPlus } from 'lucide-vue-next'

defineProps({
  titulo: { type: String, required: true },
  mensaje: { type: String, required: true },
  textoAccion: { type: String, default: null },
})

const emit = defineEmits(['accion'])
</script>

<template>
  <div class="text-center py-12 px-6">
    <v-icon :icon="ClipboardPlus" size="34" color="medium-emphasis" />
    <h3 class="text-subtitle-1 mt-4 mb-2">{{ titulo }}</h3>
    <p class="text-body-2 text-medium-emphasis mx-auto" style="max-width: 42ch">
      {{ mensaje }}
    </p>
    <v-btn
      v-if="textoAccion"
      color="primary"
      variant="flat"
      class="mt-6"
      :prepend-icon="ClipboardPlus"
      @click="emit('accion')"
    >
      {{ textoAccion }}
    </v-btn>
  </div>
</template>
