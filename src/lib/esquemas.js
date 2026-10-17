/**
 * Esquemas de validacion de los formularios, con Zod.
 *
 * Antes cada componente validaba a mano, con una regla distinta por archivo: la
 * grilla exigia `Number.isInteger` en la edad y el dialogo no, asi que el mismo
 * dato se aceptaba en una pantalla y se rechazaba en la otra. Ademas los dos
 * hacian `Number(edad)` sobre el `null` de un campo vacio, que en JavaScript es
 * `0`: una persona sin edad registrada quedaba con 0 años, y con los rangos del
 * 345W eso la contaba en el rango 0-5.
 *
 * Estos schemas son **puros**: no importan Vue, ni Supabase, ni Vite. Eso los
 * hace importables desde node pelado y verificables en
 * `scripts/verify-esquemas.mjs`, que es el unico modo de comprobar los limites
 * sin levantar la app.
 *
 * Que los defina Zod y no la base no es una decision de estilo. La base ya tiene
 * los CHECK (`edad between 0 and 120`, `sexo in (F,M,O)`), pero a esa altura el
 * error llega despues del viaje de red y la persona ya escribio ocho personas
 * mas. La validacion tiene que estar antes del `INSERT`.
 *
 * Un schema por formulario, mas `validar()` para no repetir el `safeParse` en
 * cada componente.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Corre el schema y devuelve el primer mensaje de error, o `null` si paso.
 *
 * Se usa antes de guardar. Devuelve solo UN mensaje a proposito: mostrar los
 * veinte errores de una grilla de carga masiva a la vez es ruido, y el primero
 * es el que la persona puede arreglar.
 *
 * @param {import('zod').ZodType} schema
 * @param {unknown} datos
 * @returns {string|null}
 */
export function validar(schema, datos) {
  const resultado = schema.safeParse(datos)
  if (resultado.success) return null
  return resultado.error.issues[0]?.message ?? 'Datos inválidos.'
}

/**
 * El primer error, pero de un campo en particular.
 *
 * `validar` devuelve el primero de la lista, y para eso esta bien: antes de
 * guardar un formulario con veinte campos, mostrar uno basta. Para las `:rules`
 * de Vuetify NO sirve: si el campo que se esta mirando es el municipio y el
 * primero que falla es el título, el municipio se marcaría en rojo con un error
 * que no es suyo. Por eso las reglas usan esta, y `validar` la usa por debajo.
 *
 * @param {import('zod').ZodType} schema
 * @param {unknown} datos
 * @param {string} campo
 * @returns {string|null}
 */
export function validarCampo(schema, datos, campo) {
  const resultado = schema.safeParse(datos)
  if (resultado.success) return null

  // `.path` viene como arreglo de segmentos; el campo es el primero.
  const suyo = resultado.error.issues.find((i) => i.path[0] === campo)
  return suyo?.message ?? null
}

/**
 * Igual que `validar`, pero devuelve `true` si pasa. Para las `:rules` de
 * Vuetify, que esperan el string del error o `true`.
 */
export function comoRegla(schema, campo) {
  return (valor) => validarCampo(schema, { [campo]: valor }, campo) ?? true
}

/**
 * Texto de formulario a `null` si viene vacío.
 *
 * Casi todos los campos de la cabecera son nullable en la base, y mandar `''`
 * en vez de `null` los convierte en texto vacío que después aparece como dato
 * presente. Un `v-text-field` devuelve `''` cuando lo limpian.
 *
 * `.nullish()` y no un `union` con `z.undefined()`: dentro de un `z.object` de
 * Zod 4, poner `undefined` como opción del union NO vuelve opcional la clave, y
 * el parseo falla con "expected nonoptional, received undefined" en cuanto el
 * campo no viene. Hay que marcarlo con `.optional()`/`nullish()` sí o sí.
 */
const textoOpcional = z
  .string()
  .nullish()
  .transform((v) => {
    const limpio = typeof v === 'string' ? v.trim() : ''
    return limpio === '' ? null : limpio
  })

// ---------------------------------------------------------------------------
// Atencion: la persona atendida
// ---------------------------------------------------------------------------

/**
 * Edad de una persona atendida.
 *
 * El `null` es un caso de primera clase, no un forgot: la columna es nullable y
 * hay gente de la que no se registra la edad. Lo que NO puede pasar es que un
 * vacio termine guardado como 0, asi que `''` se transforma en `null` antes de
 * validar en vez de pasar por `Number('')`.
 *
 * `int()` y no un rango solo: la columna es `integer` y Postgres rechaza un
 * `12.5` con `22P02`, o sea que la app tiene que frenarlo antes.
 */
const EDAD = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null
    if (typeof v === 'number') return Number.isNaN(v) ? Number.NaN : v
    const n = Number(v.trim())
    return Number.isNaN(n) ? Number.NaN : n
  })
  .pipe(
    z
      .number()
      .int({ message: 'La edad debe ser un número entero.' })
      .min(0, { message: 'La edad no puede ser negativa.' })
      .max(120, { message: 'La edad debe estar entre 0 y 120.' })
      .nullable(),
  )

const SEXO = z
  .union([z.literal('F'), z.literal('M'), z.literal('O')])
  .nullish()
  .transform((v) => v ?? null)

/** Un id de catálogo: el `v-select` puede devolver `null` si se limpia. */
const UUID_OPCIONAL = z.uuid().nullish()

/**
 * Una persona atendida, tal como sale del formulario.
 *
 * Lo usan **los dos** puntos de entrada, el dialogo y la grilla de carga masiva.
 * Que compartan el schema es el punto: antes cada uno tenía su propia versión de
 * la regla de la edad, y por eso se comportaban distinto con el mismo dato.
 */
export const ATENCION = z.object({
  nombre_apellido: z
    .string({ message: 'El nombre es obligatorio.' })
    .trim()
    .min(1, { message: 'El nombre es obligatorio.' }),
  cedula: textoOpcional,
  edad: EDAD,
  sexo: SEXO,
  motivo: textoOpcional,
  grupo_atencion_id: UUID_OPCIONAL,
  indigena: z.boolean().optional(),
  gestante: z.boolean().optional(),
  discapacidad: z.boolean().optional(),
  lgbtiq: z.boolean().optional(),
  victima_trata: z.boolean().optional(),
  tipo_discapacidad: textoOpcional,
})

/**
 * Lo mismo, pero tolerante: acepta los `''` de las columnas vacias de la grilla
 * sin dar un error por cada fila en blanco.
 */
export const FILA_GRILLA = ATENCION

// ---------------------------------------------------------------------------
// Cabecera de la jornada
// ---------------------------------------------------------------------------

/** `YYYY-MM`, como lo devuelve un `<input type="month">`. */
const MES_REPORTE = z
  .string({ message: 'Elegí el mes de reporte.' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes no es válido.' })

/** Coordenada en rango terrestre. Viene de un campo de texto, puede venir vacía. */
const COORDENADA = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    return Number.isNaN(n) ? Number.NaN : n
  })
  .pipe(
    z
      .number({ message: 'Debe ser un número.' })
      .min(-90, { message: 'La latitud va entre -90 y 90.' })
      .max(90, { message: 'La latitud va entre -90 y 90.' })
      .nullable(),
  )

const LONGITUD = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    return Number.isNaN(n) ? Number.NaN : n
  })
  .pipe(
    z
      .number({ message: 'Debe ser un número.' })
      .min(-180, { message: 'La longitud va entre -180 y 180.' })
      .max(180, { message: 'La longitud va entre -180 y 180.' })
      .nullable(),
  )

/**
 * Cabecera de una jornada.
 *
 * `superRefine` para la jerarquía estado → municipio → parroquia, que no se
 * puede expresar con campos sueltos: una parroquia sin municipio es un dato que
 * no tiene sentido aunque los dos campos estén "rellenos".
 *
 * No se valida que el estado pertenezca a la lista de `venezuela.js`. Los
 * selectores ya lo restringen, y agregarlo suma una forma de falla nueva: si el
 * catálogo de Venezuela se actualiza o se corrige, toda cabecera guardada con un
 * estado que ya no figure en la lista quedaría sin poder editar.
 */
export const CABECERA = z
  .object({
    titulo: z
      .string({ message: 'El título es obligatorio.' })
      .trim()
      .min(1, { message: 'El título es obligatorio.' }),
    fecha: textoOpcional,
    mes_reporte: MES_REPORTE,
    coordinacion_id: z.uuid({ message: 'Elegí una coordinación.' }),
    responsable: textoOpcional,
    estado_ubicacion: z
      .string({ message: 'Elegí el estado.' })
      .trim()
      .min(1, { message: 'Elegí el estado.' }),
    municipio: z
      .string({ message: 'Elegí el municipio.' })
      .trim()
      .min(1, { message: 'Elegí el municipio.' }),
    parroquia: z
      .string({ message: 'Elegí la parroquia.' })
      .trim()
      .min(1, { message: 'Elegí la parroquia.' }),
    ubicacion: textoOpcional,
    tipo_establecimiento_id: UUID_OPCIONAL,
    fuente_financiamiento_id: UUID_OPCIONAL,
    latitud: COORDENADA,
    longitud: LONGITUD,
    observaciones: textoOpcional,
  })
  .superRefine((datos, ctx) => {
    if (!datos.municipio && datos.parroquia) {
      ctx.addIssue({
        code: 'custom',
        path: ['parroquia'],
        message: 'Elegí el municipio antes que la parroquia.',
      })
    }
  })

// ---------------------------------------------------------------------------
// Usuarios, perfil y catalogos
// ---------------------------------------------------------------------------

/** Los dos roles que acepta el CHECK de `profiles.rol`. */
export const ROLES = ['coordinador', 'admin']

export const ROL = z.enum(ROLES, { message: 'Elegí un rol válido.' })

/**
 * Alta de usuario.
 *
 * El alto real la hace la Edge Function `crear-usuario`, que corre con la
 * `service_role` y es la que de verdad autoriza. Esto es la primera línea: evita
 * el viaje de red y el error más común, que es el email mal escrito.
 */
export const USUARIO_NUEVO = z.object({
  email: z.email({ message: 'El email no es válido.' }),
  password: z
    .string({ message: 'La contraseña es obligatoria.' })
    .min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
  nombre: textoOpcional,
  rol: ROL.nullable(),
  coordinacion_id: UUID_OPCIONAL,
})

/** Cambio de contraseña desde el perfil. La coincidencia se chequea aparte. */
export const CAMBIO_CLAVE = z
  .object({
    clave: z
      .string({ message: 'Escribí la contraseña nueva.' })
      .min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
    repetir: z.string({ message: 'Repetí la contraseña.' }),
  })
  .refine((d) => d.clave === d.repetir, {
    path: ['repetir'],
    message: 'Las contraseñas no coinciden.',
  })

/**
 * Nombre de un catálogo (tipo de establecimiento, grupo de atención, fuente,
 * servicio).
 *
 * No se valida que no esté repetido: eso lo rechaza el `UNIQUE` de la base, y
 * para detectinglo en el cliente hay que pasarle la lista de nombres existentes
 * a cada schema. El error de la base es lo bastante claro y evita tener una
 * segunda lista de nombres desincronizada.
 */
export const CATALOGO = z.object({
  nombre: z
    .string({ message: 'El nombre es obligatorio.' })
    .trim()
    .min(1, { message: 'El nombre es obligatorio.' }),
  descripcion: textoOpcional,
})
