/**
 * Contrato de columnas del 345W.
 *
 * Vive solo en este archivo, sin dependencias, y `export345w.js` lo importa.
 * Antes estaba en el medio del modulo de exportacion, que ademas importa el
 * cliente de Supabase: eso hacia imposible verificar el orden de las columnas
 * con node pelado, porque `import.meta.env` solo existe bajo Vite. Y el orden de
 * estas columnas es justo lo que hay que poder verificar: es el contrato con la
 * ONU, y si se mueve nadie se entera hasta que rechazan el archivo.
 *
 * `scripts/verify-edades.mjs` tiene la lista esperada por separado, a proposito:
 * si estuviera aca el chequeo seria tautologico.
 *
 * El `grupo` existe para que las hojas "Edades" y "Personas" se armen con las
 * MISMAS columnas de identificacion y no con una copia que se queda vieja en
 * silencio. La hoja "Edades" usa IDENTIFICACION; el 345W usa el arreglo entero.
 *
 * EL ORDEN DE LAS 21 COLUMNAS DEL 345W NO SE TOCA.
 */
export const COLUMNAS = [
  { excel: 'REPORTING MONTH', origen: 'fecha', formato: 'YYYY-MM-DD', grupo: 'identificacion' },
  { excel: 'Coordinacion', origen: 'coordinacion', grupo: 'identificacion' },
  { excel: 'DEPARTMENT', origen: 'estado_ubicacion', grupo: 'identificacion' },
  { excel: 'MUNICIPALITY', origen: 'municipio', grupo: 'identificacion' },
  { excel: 'ADMIN 3', origen: 'parroquia', grupo: 'identificacion' },
  { excel: 'ESTABLISHMENT NAME', origen: 'establecimiento', grupo: 'identificacion' },
  { excel: 'ESTABLISHMENT TYPE', origen: 'tipo_establecimiento', grupo: 'identificacion' },
  { excel: 'Latitud', origen: 'latitud', grupo: 'identificacion' },
  { excel: 'Longitud', origen: 'longitud', grupo: 'identificacion' },
  { excel: 'Total of people reached', origen: 'total_atenciones', grupo: 'morbilidad' },
  { excel: 'Girls', origen: 'girls', grupo: 'morbilidad' },
  { excel: 'Boys', origen: 'boys', grupo: 'morbilidad' },
  { excel: 'Female', origen: 'female', grupo: 'morbilidad' },
  { excel: 'Male', origen: 'male', grupo: 'morbilidad' },
  { excel: 'Elderly Female', origen: 'elderly_female', grupo: 'morbilidad' },
  { excel: 'Elderly Male', origen: 'elderly_male', grupo: 'morbilidad' },
  { excel: 'Número de población indígena', origen: 'indigenas', grupo: 'morbilidad' },
  { excel: 'Número de personas con discapacidad', origen: 'discapacidad', grupo: 'morbilidad' },
  { excel: 'Número de personas embarazadas o en lactancia', origen: 'gestantes', grupo: 'morbilidad' },
  { excel: 'Número de personas LGBTIQ+', origen: 'lgbtiq', grupo: 'morbilidad' },
  { excel: 'Número de víctimas de Trata de Personas', origen: 'victimas_trata', grupo: 'morbilidad' },
]

/** Las 9 columnas que identifican la jornada. Compartidas por las hojas 1 y 2. */
export const IDENTIFICACION = COLUMNAS.filter((c) => c.grupo === 'identificacion')

/** Las 12 de morbilidad del 345W, sin las de identificacion. */
export const MORBILIDAD_345W = COLUMNAS.filter((c) => c.grupo === 'morbilidad')
