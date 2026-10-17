<script setup>
/**
 * Tira de conteos del 345W. Muestra el conteo de morbilidad mientras se carga,
 * que es el dato que la persona necesita ver para saber si la jornada esta
 * completa antes de enviarla.
 *
 * Los elderly son un desglose de female/male, no un sixth grupo de personas:
 * se muestran aparte pero el subtotal no se duplica. El componente no dice
 * "total" en ningun lado justamente para que nadie los sume.
 */
import { computed } from 'vue'

const props = defineProps({
  conteos: { type: Array, required: true },
  compacto: { type: Boolean, default: false },
})

const visibles = computed(() =>
  props.conteos.filter((c) => !props.compacto || c.valor > 0 || c.clave === 'gestantes'),
)
</script>

<template>
  <div class="tira-conteos" role="group" aria-label="Conteos de morbilidad">
    <div v-for="c in visibles" :key="c.clave" class="tira-conteos__celda">
      <div class="tira-conteos__etiqueta" :title="c.etiqueta">{{ c.etiqueta }}</div>
      <div
        class="tira-conteos__valor"
        :class="{ 'tira-conteos__valor--vacio': c.valor === 0 }"
      >
        {{ c.valor }}
      </div>
    </div>
  </div>
</template>
