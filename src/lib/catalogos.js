/**
 * Catalogos y helpers de dominio. Los catalogos se leen una vez y se cachean:
 * son pequenos (decenas de filas), cambian casi nunca y se usan en cada
 * formulario. Volver a pedirlos en cada apertura de dialogo seria latencia
 * visible sin ningun beneficio.
 *
 * Todos los reads usan la sesion del usuario, nunca la service_role: la RLS
 * tiene que seguir siendo la unica barrera de seguridad.
 */
import { supabase } from './supabase.js'

const cache = {}

async function cargarCatalogos() {
  const claves = [
    'tiposEstablecimiento',
    'gruposAtencion',
    'fuentesFinanciamiento',
    'coordinaciones',
    'servicios',
  ]
  const [tipos, grupos, fuentes, coordinaciones, servicios] = await Promise.all([
    supabase
      .from('tipos_establecimiento')
      .select('id, nombre, activo')
      .order('nombre'),
    supabase.from('grupos_atencion').select('id, nombre, activo').order('nombre'),
    supabase
      .from('fuentes_financiamiento')
      .select('id, nombre, activo')
      .order('nombre'),
    supabase.from('coordinaciones').select('id, nombre, activa').order('nombre'),
    supabase
      .from('servicios')
      .select('id, nombre, coordinacion_id, activo')
      .order('nombre'),
  ])

  for (const [nombre, res] of [
    ['tipos', tipos],
    ['grupos', grupos],
    ['fuentes', fuentes],
    ['coordinaciones', coordinaciones],
    ['servicios', servicios],
  ]) {
    if (res.error) throw res.error
    cache[nombre] = res.data
  }

  return cache
}

export async function obtenerCatalogos({ forzar = false } = {}) {
  if (forzar || !cache.tipos) {
    delete cache.tipos
    return cargarCatalogos()
  }
  return cache
}

export function catalogosEnCache() {
  return cache.tipos !== undefined
}

/**
 * Los servicios se filtran por coordinacion porque el catalogo esta particionado
 * asi: un servicio de Psicologia no tiene sentido en una jornada de Agua. Para
 * un admin que elige otra coordinacion, el selector se recalcula.
 */
export function serviciosDeCoordinacion(coordinacionId) {
  if (!coordinacionId) return cache.servicios ?? []
  return (cache.servicios ?? []).filter(
    (s) => s.coordinacion_id === coordinacionId && s.activo !== false,
  )
}

/** Nombres de catalogo en el formato que consume un v-select. */
export function comoOpciones(catalogo) {
  return (catalogo ?? []).map((fila) => ({ title: fila.nombre, value: fila.id }))
}
