/**
 * Agregados de morbilidad del 345W.
 *
 * Estas reglas NO viven en la base: la vista v_agregados_actividad (migracion
 * 007) es la que calcula los agregados reales y es la unica fuente de verdad
 * para la exportacion. Este archivo existe para dos cosas:
 *
 *   1. Mostrar el conteo mientras se carga, que es lo que la persona ve.
 *   2. Advertir sobre las dos trampas del formato, que son de lectura del
 *      formulario y por lo tanto no se pueden detectar en SQL.
 *
 * Si alguien cambia la vista 007, este archivo puede quedar desfasado. Por eso
 * los nombres de las claves son los mismos que usa la vista, y la migracion
 * 007 tiene el comentario de correlacion al lado.
 */

// Las mismas clausulas filter() que la vista 007, en el mismo orden.
export function clasificarAtencion(a) {
  const edad = Number(a.edad)
  const sexo = a.sexo

  const esNina = edad < 18 && sexo === 'F'
  const esNino = edad < 18 && sexo === 'M'
  const esFemenino = edad >= 18 && sexo === 'F'
  const esMasculino = edad >= 18 && sexo === 'M'

  return {
    girls: esNina,
    boys: esNino,
    female: esFemenino,
    male: esMasculino,
    // Elderly es un desglose de female/male, no una categoria aparte: se
    // cuentan dentro de ellas, no en addition.
    elderly_female: edad >= 60 && sexo === 'F',
    elderly_male: edad >= 60 && sexo === 'M',
    indigenas: a.indigena === true,
    discapacidad: a.discapacidad === true,
    gestantes: a.gestante === true,
    lgbtiq: a.lgbtiq === true,
    victimas_trata: a.victima_trata === true,
  }
}

const ETIQUETAS = {
  girls: 'Girls',
  boys: 'Boys',
  female: 'Female',
  male: 'Male',
  elderly_female: 'Elderly F',
  elderly_male: 'Elderly M',
  indigenas: 'Indigenas',
  discapacidad: 'Discapacidad',
  gestantes: 'Gestantes',
  lgbtiq: 'LGBTIQ+',
  victimas_trata: 'Victimas',
}

const ORDEN = [
  'girls',
  'boys',
  'female',
  'male',
  'elderly_female',
  'elderly_male',
  'indigenas',
  'discapacidad',
  'gestantes',
  'lgbtiq',
  'victimas_trata',
]

/** Conteo agregado de una lista de atenciones ya capturadas. */
export function contarMorbilidad(atenciones) {
  const totales = Object.fromEntries(ORDEN.map((k) => [k, 0]))

  for (const atencion of atenciones ?? []) {
    const clase = clasificarAtencion(atencion)
    for (const clave of ORDEN) {
      if (clase[clave]) totales[clave] += 1
    }
  }

  return {
    total_atenciones: (atenciones ?? []).length,
    ...totales,
  }
}

/** Los pares etiqueta/valor para pintar la tira de conteos. */
export function resumenContable(atenciones) {
  const conteo = contarMorbilidad(atenciones)
  return ORDEN.map((clave) => ({
    clave,
    etiqueta: ETIQUETAS[clave],
    valor: conteo[clave],
  }))
}

/**
 * Trampa 1: sexo = 'O' no entra en ningun desglose de sexo.
 *
 * La vista (007) suma girls/boys/female/male y quien tiene 'O' no esta en
 * ninguno. Esta correcto: forzar a esas personas dentro de una categoria
 * binaria falsearia el dato. Pero en terreno es facil elegir 'O' sin saber que
 * esa persona va a aparecer en total_atenciones y en ninguno de los otros
 * cuatro. Se avisa, no se bloquea.
 */
export function sinClasificarPorSexo(atenciones) {
  return (atenciones ?? []).filter(
    (a) => a.sexo === 'O' || a.sexo === null || a.sexo === '',
  ).length
}

/**
 * Trampa 2: tipo_discapacidad sin discapacidad = true.
 *
 * La columna es texto libre y no entra en ningun filtro de la vista, asi que un
 * valor huerfano no rompe el Excel: simplemente se pierde. Por eso la UI
 * deshabilita el campo cuando el checkbox esta apagado. Esta funcion cubre el
 * caso en que el dato ya esta guardado asi (por ejemplo, si se edita desde
 * otra herramienta).
 */
export function tipoDiscapacidadIncoherente(atencion) {
  return atencion.discapacidad !== true && !!atencion.tipo_discapacidad?.trim()
}
