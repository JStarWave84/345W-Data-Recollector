<script setup>
/**
 * Insignia de estado de una actividad. El color es el unico acento semantico
 * de la app, asi que este componente es deliberadamente sobrio: un punto, el
 * nombre del estado, sin borde grueso ni fondo saturado.
 */
defineProps({
  estado: { type: String, required: true },
})

const ETIQUETAS = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  validada: 'Validada',
}
</script>

<template>
  <span class="estado" :class="`estado--${estado}`">
    <span class="estado__punto" aria-hidden="true" />
    {{ ETIQUETAS[estado] ?? estado }}
  </span>
</template>
