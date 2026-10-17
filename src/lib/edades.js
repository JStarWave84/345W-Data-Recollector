/**
 * Rangos de edad para el desglose de la exportacion.
 *
 * Igual que `morbilidad.js`, estas reglas NO son la fuente de verdad: los
 * conteos reales los calcula `v_agregados_actividad` (migracion 015) y eso es lo
 * que va al Excel. Este archivo existe para:
 *
 *   1. Escribir las 14 columnas de la hoja de edades sin tenerlas hardcodeadas
 *      de a pares.
 *   2. Poner la columna "Rango de edad" de la hoja de detalle, que es la unica
 *      que se calcula aca (la vista agrupa, no clasifica persona por persona).
 *   3. Servir de documentacion: si se cambia un limite en la migracion, este
 *      archivo tiene que cambiar con ella.
 *
 * Ojo con el `null`. `atenciones.edad` es nullable, y en SQL una comparacion
 * con NULL da NULL, asi que esas personas NO cuentan en ningun rango (pero si
 * en `total_atenciones`). `clasificarEdad` devuelve `null` para ese caso, y no
 * 0: si devolviera 0 caeria en el rango 0-5 y el detalle de la hoja de personas
 * contradiria a la hoja de edades. Ese mismo error existe hoy en
 * `morbilidad.js:19` con `Number(a.edad)`.
 */

/**
 * Los 7 rangos, en orden creciente. `max: null` es "y hasta el final".
 *
 * Son contiguos y sin superposicion: la edad 6 cae en 6-19, no en 0-5. Por eso
 * `clasificarEdad` puede buscar el primer rango cuyo max alcanza la edad.
 */
export const RANGOS_EDAD = [
  { clave: '0_5', etiqueta: '0-5', min: 0, max: 5 },
  { clave: '6_19', etiqueta: '6-19', min: 6, max: 19 },
  { clave: '20_49', etiqueta: '20-49', min: 20, max: 49 },
  { clave: '50_59', etiqueta: '50-59', min: 50, max: 59 },
  { clave: '60_69', etiqueta: '60-69', min: 60, max: 69 },
  { clave: '70_79', etiqueta: '70-79', min: 70, max: 79 },
  { clave: '80_mas', etiqueta: '80+', min: 80, max: null },
]

/** Etiquetas de sexo, para las columnas del desglose. */
export const SEXOS_RANGO = [
  // `letra` tiene que ir en minuscula: es el sufijo del nombre de la columna en
  // la vista, que Postgres devuelve tal cual esta escrita en la migracion
  // (`edad_0_5_f`). Con mayuscula, el `.select('*')` devuelve `edad_0_5_F` y
  // el mapeo no encuentra el valor.
  { letra: 'f', etiqueta: 'Femenino' },
  { letra: 'm', etiqueta: 'Masculino' },
]

/**
 * A que rango de edad pertenece una edad.
 *
 * @param {number|string|null|undefined} edad
 * @returns {object|null} el rango de `RANGOS_EDAD`, o null si la edad es null,
 *   no es un numero, o queda fuera de 0..120 (que el check de la base ya
 *   impide, pero el dato puede venir de una importacion vieja).
 */
export function clasificarEdad(edad) {
  if (edad === null || edad === undefined || edad === '') return null

  const n = Number(edad)
  if (!Number.isInteger(n) || n < 0 || n > 120) return null

  return RANGOS_EDAD.find((r) => n >= r.min && (r.max === null || n <= r.max)) ?? null
}

/** Etiqueta del rango, o el guion que usa el resto del exportador para vacios. */
export function etiquetaRango(edad) {
  return clasificarEdad(edad)?.etiqueta ?? '—'
}

/**
 * Las 14 columnas del desglose: un par por rango, en el orden F y luego M.
 *
 * `origen` es el nombre de la columna en `v_agregados_actividad`, que se arma
 * como `${clave}_${letra}`: `0_5_f`, `6_19_m`, `80_mas_f`...
 */
export const COLUMNAS_EDAD = RANGOS_EDAD.flatMap((rango) =>
  SEXOS_RANGO.map((sexo) => ({
    excel: `${rango.etiqueta} ${sexo.etiqueta}`,
    // El encabezado de la hoja de edades es de dos filas: el rango arriba,
    // fusionado sobre su par, y el sexo abajo. Esta etiqueta es la de arriba.
    etiquetaRango: rango.etiqueta,
    // Con prefijo `edad_`: es como las nombra la vista (`edad_0_5_f`). Sin el,
    // el `.select('*')` devuelve `edad_0_5_f` y el mapeo no encuentra nada, y
    // la celda sale vacia sin ningun error visible.
    origen: `edad_${rango.clave}_${sexo.letra}`,
    claveRango: rango.clave,
    letraSexo: sexo.letra,
  })),
)

/** Las claves de las 14 columnas de la vista, para validarlas contra la fila. */
export const CLAVES_EDAD = COLUMNAS_EDAD.map((c) => c.origen)
