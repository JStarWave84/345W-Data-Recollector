/**
 * Armado del .xlsx de las tres hojas.
 *
 * Vive aparte de `export345w.js` por una razón concreta: este módulo no importa
 * ni el cliente de Supabase ni los plugins de Tauri, así que `scripts/verify-
 * export.mjs` lo puede importar con node pelado y testear el código REAL.
 *
 * Cuando estas funciones estaban dentro de `export345w.js`, el script de
 * verificación tenía que reimplementarlas para poder correrlas, y terminó
 * probando una copia: la hoja de detalle de la copia tenía 2 columnas y la real
 * 17. Eso es exactamente lo que dejó pasar un bug que rompía la exportación
 * entera (`getColumn()` sin claves definidas revienta). Un test tiene que
 * importar lo que corre en producción.
 */
import { COLUMNAS, IDENTIFICACION } from './columnas345w.js'
import { COLUMNAS_EDAD, etiquetaRango } from './edades.js'

/** Nombre del archivo, con el rango que se exporta. */
export function nombreArchivo345W(desde, hasta) {
  return `planilla-345W_${desde}_a_${hasta}.xlsx`
}

/**
 * Columnas de la hoja de detalle: una fila por persona atendida.
 *
 * Cada `calculo` arma la celda. Casi todas leen un campo de `atenciones`, pero
 * el rango de edad se calcula y los nombres de grupo y servicios vienen
 * enriquecidos antes (ver `armarDetalle` en la vista), porque la consulta de
 * `atenciones` no trae los joins.
 */
const COLUMNAS_PERSONA = [
  { excel: 'REPORTING MONTH', calculo: (a) => a.fecha ?? '' },
  { excel: 'Jornada', calculo: (a) => a.titulo ?? '' },
  { excel: 'ESTABLISHMENT NAME', calculo: (a) => a.establecimiento ?? '' },
  { excel: 'Cedula', calculo: (a) => a.cedula ?? '' },
  { excel: 'Nombre y apellido', calculo: (a) => a.nombre_apellido ?? '' },
  { excel: 'Edad', calculo: (a) => (a.edad === null || a.edad === undefined ? '' : a.edad) },
  { excel: 'Rango de edad', calculo: (a) => etiquetaRango(a.edad) },
  { excel: 'Sexo', calculo: (a) => a.sexo ?? '' },
  { excel: 'Motivo', calculo: (a) => a.motivo ?? '' },
  { excel: 'Grupo de atención', calculo: (a) => a.grupo ?? '' },
  { excel: 'Tipo discapacidad', calculo: (a) => a.tipo_discapacidad ?? '' },
  { excel: 'Indígena', calculo: (a) => (a.indigena ? 'X' : '') },
  { excel: 'Gestante', calculo: (a) => (a.gestante ? 'X' : '') },
  { excel: 'Discapacidad', calculo: (a) => (a.discapacidad ? 'X' : '') },
  { excel: 'LGBTIQ+', calculo: (a) => (a.lgbtiq ? 'X' : '') },
  { excel: 'Víctima de trata', calculo: (a) => (a.victima_trata ? 'X' : '') },
  { excel: 'Servicios', calculo: (a) => a.servicios ?? '' },
]

/** Exportado para que el script de verificación no tenga que duplicarlo. */
export { COLUMNAS_PERSONA }

/** Mapea una fila de la vista a una fila de la hoja 345W. */
function aFilaExcel(fila) {
  const salida = {}

  for (const col of COLUMNAS) {
    if (col.origen === null) {
      salida[col.excel] = ''
      continue
    }

    const valor = fila[col.origen]
    if (valor === null || valor === undefined) {
      salida[col.excel] = ''
    } else if (col.formato === 'YYYY-MM-DD') {
      salida[col.excel] = String(valor).slice(0, 10)
    } else if (col.formato === 'YYYY-MM') {
      salida[col.excel] = String(valor).slice(0, 7)
    } else {
      salida[col.excel] = valor
    }
  }

  return salida
}

/**
 * Hoja con encabezado de una fila, que es el de la 345W y el del detalle.
 *
 * Definir `hoja.columns` es lo que le da clave a cada columna. Importa: sin
 * claves, `getColumn('texto')` no busca por nombre sino que interpreta el texto
 * como letra de columna y revienta con "Out of bounds".
 */
function conEncabezadoSimple(hoja, columnas) {
  hoja.columns = columnas.map((col) => ({
    header: col.excel,
    key: col.excel,
    width: col.excel.length > 24 ? 34 : 16,
  }))
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnas.length },
  }
}

/**
 * Arma el libro con las tres hojas.
 *
 * - `345W`: las 21 columnas que exige la ONU, sin cambios.
 * - `Edades`: las 9 de identificación + los 7 rangos por sexo, con el rango
 *   fusionado sobre su par.
 * - `Personas`: una fila por persona atendida.
 *
 * Las hojas de edades y de personas NO llevan la columna de total a propósito:
 * el desglose por edad no lo suma todo (quien tiene sexo 'O' o edad nula queda
 * fuera, ver la migración 015), así que poner el total al lado invita a leer una
 * diferencia como error de cálculo cuando es la regla de conteo.
 *
 * @param {object[]} filas filas de `v_agregados_actividad`
 * @param {object[]} [personas] atenciones ya enriquecidas con la jornada
 * @returns {Promise<ArrayBuffer>}
 */
export async function construirWorkbook(filas, personas = []) {
  // Import dinamico: son ~925 KB y solo hacen falta al exportar.
  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js')

  const libro = new ExcelJS.Workbook()
  libro.creator = 'data-recollection-ftr'
  libro.created = new Date()

  // --- Hoja 1: el 345W, intacto ---
  const hoja345 = libro.addWorksheet('345W')
  conEncabezadoSimple(hoja345, COLUMNAS)
  for (const fila of filas) hoja345.addRow(aFilaExcel(fila))

  // --- Hoja 2: desglose por edad, con encabezado de dos filas ---
  // Un encabezado plano con 14 columnas del tipo "Femenino 0-5" se lee mal: el
  // rango se repite y no se ve el par. Se agrupa el rango arriba con sus dos
  // sexos abajo, y por eso el filtro y el panel congelado arrancan en la fila 2.
  const hojaEdades = libro.addWorksheet('Edades')
  const encabezadoEdades = [...IDENTIFICACION, ...COLUMNAS_EDAD]

  // El ancho se fija POR INDICE, no por nombre. Esta hoja no puede usar
  // `hoja.columns` porque su encabezado es de dos filas y ExcelJS escribiría la
  // primera sola, tapando la fila 2. Sin claves definidas, `getColumn(texto)`
  // interpreta el texto como letra de columna y tira "Out of bounds: Excel
  // supports columns from 1 to 16384".
  encabezadoEdades.forEach((col, i) => {
    hojaEdades.getColumn(i + 1).width = col.excel.length > 24 ? 30 : 14
  })

  // Fila 1: los nombres de las columnas de identificacion, y el RANGO en la
  // columna de cada par (la de la izquierda, que es la que sobrevive al
  // merge). Fila 2: vacio arriba de la identificacion, y el sexo bajo el rango.
  hojaEdades.addRow([
    ...IDENTIFICACION.map((c) => c.excel),
    ...COLUMNAS_EDAD.map((c) => (c.letraSexo === 'f' ? c.etiquetaRango : null)),
  ])
  hojaEdades.addRow([
    ...IDENTIFICACION.map(() => null),
    ...COLUMNAS_EDAD.map((c) => (c.letraSexo === 'f' ? 'Femenino' : 'Masculino')),
  ])

  for (const fila of filas) {
    hojaEdades.addRow(encabezadoEdades.map((col) => fila[col.origen] ?? ''))
  }

  // El rango se fusiona sobre su par de columnas. Va despues de cargar las
  // filas porque ExcelJS necesita que las celdas de origen ya existan.
  COLUMNAS_EDAD.forEach((col, i) => {
    if (col.letraSexo !== 'f') return
    const columna = IDENTIFICACION.length + i + 1
    hojaEdades.mergeCells(1, columna, 1, columna + 1)
  })

  hojaEdades.getRow(1).font = { bold: true }
  hojaEdades.getRow(2).font = { bold: true }
  hojaEdades.views = [{ state: 'frozen', ySplit: 2 }]
  hojaEdades.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: encabezadoEdades.length },
  }

  // --- Hoja 3: detalle persona por persona ---
  const hojaPersonas = libro.addWorksheet('Personas')
  conEncabezadoSimple(hojaPersonas, COLUMNAS_PERSONA)
  for (const persona of personas) {
    hojaPersonas.addRow(
      Object.fromEntries(
        COLUMNAS_PERSONA.map((col) => [col.excel, col.calculo(persona) ?? '']),
      ),
    )
  }

  return libro.xlsx.writeBuffer()
}
