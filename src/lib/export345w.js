import { z } from 'zod'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

import { supabase } from './supabase.js'
import { CLAVES_EDAD } from './edades.js'
import { construirWorkbook } from './xlsx.js'

// Reexportados: la vista y los scripts de verificacion los usan desde aca, asi
// que no tienen que saber en que archivo vive cada cosa.
export { COLUMNAS, IDENTIFICACION } from './columnas345w.js'
export { construirWorkbook, nombreArchivo345W, COLUMNAS_PERSONA } from './xlsx.js'

// El shape de la vista. Los agregados son NOT NULL por construccion (::int con
// count), asi que si alguno llega null es que el contrato cambio y el .xlsx
// saldría mal: preferimos que explote aca y no en el archivo de la ONU.
const FILA_VISTA = z.object({
  mes_reporte: z.string().nullish(),
  fecha: z.string().nullish(),
  coordinacion: z.string().nullish(),
  estado_ubicacion: z.string().nullish(),
  municipio: z.string().nullish(),
  parroquia: z.string().nullish(),
  establecimiento: z.string().nullish(),
  tipo_establecimiento: z.string().nullish(),
  latitud: z.number().nullish(),
  longitud: z.number().nullish(),
  total_atenciones: z.number(),
  girls: z.number(),
  boys: z.number(),
  female: z.number(),
  male: z.number(),
  elderly_female: z.number(),
  elderly_male: z.number(),
  indigenas: z.number(),
  discapacidad: z.number(),
  gestantes: z.number(),
  lgbtiq: z.number(),
  victimas_trata: z.number(),
  // Las 14 del desglose por edad, agregadas desde COLUMNAS_EDAD para que no
  // puedan quedar la vista y el exportador desincronizados.
  ...Object.fromEntries(CLAVES_EDAD.map((clave) => [clave, z.number()])),
})

/** Cuantas ids van en un `.in()` antes de que la URL quede larga demais. */
const TAMANO_LOTE = 100

/**
 * Consulta la vista con la sesion del usuario (nunca la service_role), asi que
 * un coordinador solo ve su coordinacion y un admin todas: la RLS hace el
 * filtrado, no el cliente.
 *
 * @param {object} opciones
 * @param {string} opciones.desde  YYYY-MM-DD, inclusive
 * @param {string} opciones.hasta  YYYY-MM-DD, inclusive
 * @param {boolean} [opciones.soloEnviadas] solo 'enviada' y 'validada'
 * @param {string[]} [opciones.ids] si viene, solo estas jornadas (checklist)
 */
export async function consultarAgregados({ desde, hasta, soloEnviadas = true, ids = null }) {
  let consulta = supabase
    .from('v_agregados_actividad')
    .select('*')
    .gte('mes_reporte', desde)
    .lte('mes_reporte', hasta)
    .order('mes_reporte', { ascending: true })

  if (soloEnviadas) {
    consulta = consulta.in('estado', ['enviada', 'validada'])
  }
  if (ids) {
    consulta = consulta.in('actividad_id', ids)
  }

  const { data, error } = await consulta
  if (error) throw error

  const invalida = data.find((fila) => !FILA_VISTA.safeParse(fila).success)
  if (invalida) {
    throw new Error(
      'La vista devolvió una fila con un formato inesperado. Si agregaste columnas, ' +
        'falta correr la migración 015 (rangos de edad) o actualizar FILA_VISTA.',
    )
  }

  return data
}

/**
 * Las personas atendidas de las jornadas eleccionadas, para la hoja de detalle.
 *
 * Va en lotes: un `.in()` con 200 uuids son mas de 7 KB de URL, y PostgREST
 * corta. Ademas no se trae el pivote de una: eso se pide aparte, solo para las
 * ids que volvieron.
 *
 * La RLS de `atenciones` (politica `atenciones_select_si_actividad_visible`)
 * limita por coordinacion, asi que esta consulta no puede devolver mas de lo
 * que la persona ya puede ver.
 *
 * @param {string[]} ids
 * @returns {Promise<object[]>} filas de `atenciones`
 */
export async function consultarAtencionesDe(ids) {
  const filas = []
  for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
    const { data, error } = await supabase
      .from('atenciones')
      .select('*')
      .in('actividad_id', ids.slice(i, i + TAMANO_LOTE))
    if (error) throw error
    filas.push(...(data ?? []))
  }
  return filas
}

/**
 * Los servicios de las atenciones indicadas, aplanados como
 * `{ atencion_id: 'Consulta médica, Despensa' }` para la hoja de detalle.
 *
 * @param {string[]} atencionIds
 * @returns {Promise<Record<string, string>>}
 */
export async function consultarServiciosDe(atencionIds) {
  const indice = {}
  if (!atencionIds.length) return indice

  for (let i = 0; i < atencionIds.length; i += TAMANO_LOTE) {
    const { data, error } = await supabase
      .from('atencion_servicios')
      .select('atencion_id, servicio_id, cantidad')
      .in('atencion_id', atencionIds.slice(i, i + TAMANO_LOTE))
    if (error) throw error
    for (const fila of data ?? []) {
      ;(indice[fila.atencion_id] ??= []).push(fila)
    }
  }
  return indice
}

 /**
 * Abre el dialogo de guardado y escribe el .xlsx. Devuelve la ruta, o null si
 * el usuario cancelo.
 *
 * @param {object[]} filas
 * @param {string} nombreSugerido
 * @param {object[]} [personas]
 */
export async function guardarXlsx(filas, nombreSugerido, personas = []) {
  const buffer = await construirWorkbook(filas, personas)

  const ruta = await save({
    title: 'Guardar archivo 345W',
    defaultPath: nombreSugerido,
    filters: [{ name: 'Libro de Excel', extensions: ['xlsx'] }],
  })
  if (!ruta) return null

  // El webview no puede escribir en disco: eso lo hace el comando Rust.
  // Se serializa como array de numeros porque es lo que el IPC acepta de forma
  // fiable; el .xlsx pesa unos pocos KB, asi que no vale la pena optimizar.
  await invoke('escribir_archivo', {
    ruta,
    contenido: Array.from(new Uint8Array(buffer)),
  })

  return ruta
}
