/**
 * Planilla de personas atendidas en PDF, para llenar a mano.
 *
 * El PDF se arma en Rust (`generar_pdf_planilla`) y aca solo se traduce lo
 * que vive en el navegador: los nombres de los catalogos y el formato de las
 * fechas. Mandar el PDF por el mismo camino que el 345W tiene una ventaja: el
 * comando no necesita permisos de disco, el usuario elige donde guardar con el
 * dialogo nativo y el archivo se escribe con `escribir_archivo`.
 *
 * Ojo con los nombres de catalogo: la grilla llega vacia, pero las referencias
 * al pie NO. Se mandan las listas completas de grupos de atencion y de servicios
 * de la coordinacion, porque quien llena en campo no tiene la app a mano y las
 * necesita para saber que marcar.
 */
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { openPath } from '@tauri-apps/plugin-opener'

import { mesLegible } from './fechas.js'

/**
 * Filas en blanco de la grilla.
 *
 * 15 es lo que entra en UNA hoja A4 horizontal con 6.4mm de alto por renglón, que
 * es lo que se escribe con lápiz sin que los renglones se toquen. La cabecera de
 * la tabla suma un renglón más, así que la tabla son 16 rayas.
 */
const FILAS = 15

/** Deja algo legible como nombre de archivo en Windows. */
function nombreDeArchivo(actividad) {
  const base = (actividad?.titulo || 'jornada')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return `planilla-${base || 'jornada'}.pdf`
}

/** 'YYYY-MM-DD' -> '28 de septiembre de 2026'. */
function fechaLarga(iso) {
  if (!iso) return '—'
  const legible = mesLegible(String(iso).slice(0, 7))
  if (!legible) return '—'
  const dia = String(iso).slice(8, 10).replace(/^0/, '')
  const [mes, anio] = legible.split(' ')
  return `${dia} de ${mes} de ${anio}`
}

function nombreDe(lista, id, respaldo = '—') {
  return lista?.find((x) => x.id === id)?.nombre ?? respaldo
}

/**
 * Traduce la actividad abierta y los catalogos al shape que espera Rust.
 *
 * @param {object} actividad fila de `actividades`
 * @param {object} catalogos resultado de `obtenerCatalogos()`
 * @param {string[]} serviciosDeEsta nombres de los servicios de la coordinacion
 * @param {number} filas filas en blanco de la grilla
 */
export function datosPlanilla(actividad, catalogos, serviciosDeEsta, filas = FILAS) {
  return {
    titulo: actividad?.titulo || 'Jornada',
    fecha: fechaLarga(actividad?.fecha),
    mes_reporte: mesLegible(actividad?.mes_reporte?.slice(0, 7)) || '—',
    coordinacion: nombreDe(catalogos?.coordinaciones, actividad?.coordinacion_id),
    responsable: actividad?.responsable || '—',
    estado_ubicacion: actividad?.estado_ubicacion || '—',
    municipio: actividad?.municipio || '—',
    parroquia: actividad?.parroquia || '—',
    establecimiento: actividad?.establecimiento || '—',
    tipo_establecimiento: nombreDe(catalogos?.tipos, actividad?.tipo_establecimiento_id),
    fuente_financiamiento: nombreDe(
      catalogos?.fuentes,
      actividad?.fuente_financiamiento_id,
    ),
    observaciones: actividad?.observaciones || '',
    grupos_atencion: (catalogos?.grupos ?? [])
      .filter((g) => g.activo !== false)
      .map((g) => g.nombre),
    servicios: serviciosDeEsta,
    filas,
  }
}

/**
 * Pide la ruta, genera el PDF y lo deja abierto.
 *
 * @returns {Promise<string|null>} la ruta escrita, o null si el usuario
 *   cancelo el dialogo. Lanza si la generacion o la escritura fallan.
 */
export async function imprimirPlanilla({ actividad, catalogos, servicios = [], filas = FILAS }) {
  const datos = datosPlanilla(actividad, catalogos, servicios, filas)

  const ruta = await save({
    title: 'Guardar planilla de personas atendidas',
    defaultPath: nombreDeArchivo(actividad),
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
  })
  if (!ruta) return null

  // Se serializa como array de numeros porque es lo que el IPC acepta de forma
  // fiable. Son unos 13 KB, asi que no vale la pena optimizar.
  const contenido = await invoke('generar_pdf_planilla', { datos })
  await invoke('escribir_archivo', { ruta, contenido: Array.from(contenido) })

  // Abrirlo es una comodidad, no parte del contrato: si el visor no arranca el
  // archivo ya esta en disco y eso es lo que importa.
  try {
    await openPath(ruta)
  } catch {
    /* el archivo quedo guardado igual */
  }

  return ruta
}
