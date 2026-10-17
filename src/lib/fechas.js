/**
 * Formateo de fechas y meses. Todo el dominio trabaja con mes de reporte como
 * string YYYY-MM (que es como lo consume el 345W) y con fechas de jornada como
 * YYYY-MM-DD.
 *
 * Se evita Date() para parsear porque '2026-01-31' se interpreta como UTC y en
 * una zona horaria negativa se corre un dia. El 345W es un reporte por mes: que
 * el 31 de enero caiga en enero es literalmente el dato.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** 'YYYY-MM' -> 'marzo 2026' */
export function mesLegible(ym) {
  if (!ym || ym.length < 7) return ''
  const [anio, mes] = ym.split('-')
  const indice = Number(mes) - 1
  if (indice < 0 || indice > 11) return ym
  return `${MESES[indice]} ${anio}`
}

/** 'YYYY-MM' -> 'Mar 2026', para ejes y encabezados apretados. */
export function mesCorto(ym) {
  if (!ym || ym.length < 7) return ''
  const [anio, mes] = ym.split('-')
  const indice = Number(mes) - 1
  if (indice < 0 || indice > 11) return ym
  return `${MESES[indice].slice(0, 3)} ${anio}`
}

/**
 * 'YYYY-MM-DD' -> '14 mar 2026' con las partes separadas por el consumidor.
 * Devuelve un objeto porque el formateo se hace con un Intl.DateTimeFormat
 * propio por pieza: asi el numero no se mezcla con el texto.
 */
export function partesFecha(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return { dia: String(d), mes: MESES[m - 1]?.slice(0, 3) ?? '', anio: String(y) }
}

/** El mes actual en YYYY-MM, para prellenar el formulario. */
export function mesActual() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

/** Primer dia del mes en YYYY-MM-DD. Es como se guarda mes_reporte. */
export function primerDia(ym) {
  return `${ym}-01`
}

/** Ultimo dia del mes en YYYY-MM-DD, para rangos inclusivos. */
export function ultimoDia(ym) {
  const [anio, mes] = ym.split('-').map(Number)
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/**
 * Convierte 'YYYY-MM-DD' a ISO completo. Supabase/Postgres espera timestamp
 * con zona; sin la parte de hora la interpretacion depende del servidor.
 */
export function aTimestamp(iso) {
  return iso ? `${iso}T12:00:00.000Z` : null
}
