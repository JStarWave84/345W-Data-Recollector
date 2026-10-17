/**
 * Descarga y parsea el catalogo de estados / municipios / parroquias desde
 * venezuelatelefonos.com.
 *
 * La pagina de cada estado trae la jerarquia en HTML plano, separada por <br>:
 *
 *   <tr><td> Municipio Girardot
 *   <br> Parroquia El Baul
 *   <br> Parroquia Sucre
 *
 * Cuando la parroquia trae capital, el sitio la escribe "Parroquia Nombre, Capital".
 * El nombre de la parroquia y la capital se guardan por separado: se mezclan en
 * varios estados (Amazonas, Miranda) y confundirlos produce datos falsos.
 *
 * Salida: scripts/datos-crudos.json
 *
 * Uso: node scripts/scrapear-lugares.mjs
 */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = 'https://venezuelatelefonos.com/parroquia'

/**
 * El sitio no usa un slug homogeneo. Estos 24 son los que existen:
 * - 'capital-federal' es Distrito Capital. NO existe 'distrito-capital' (404).
 * - 'caracas' existe pero trae parroquias de Miranda (El Cafetal, Chacaito, ...),
 *   no de Caracas, asi que queda fuera a proposito.
 * - 'vargas' es el estado La Guaira; su unico municipio tambien se llama Vargas.
 *   Se muestra como 'La Guaira' porque es el nombre vigente y el que ya tienen
 *   guardado los registros.
 */
const PAGINAS = [
  { slug: 'amazonas', estado: 'Amazonas' },
  { slug: 'anzoategui', estado: 'Anzoátegui' },
  { slug: 'apure', estado: 'Apure' },
  { slug: 'aragua', estado: 'Aragua' },
  { slug: 'barinas', estado: 'Barinas' },
  { slug: 'bolivar', estado: 'Bolívar' },
  { slug: 'carabobo', estado: 'Carabobo' },
  { slug: 'cojedes', estado: 'Cojedes' },
  { slug: 'delta-amacuro', estado: 'Delta Amacuro' },
  { slug: 'distrito-capital-no-existe', estado: null, omitir: true },
  { slug: 'capital-federal', estado: 'Distrito Capital' },
  { slug: 'falcon', estado: 'Falcón' },
  { slug: 'guarico', estado: 'Guárico' },
  { slug: 'lara', estado: 'Lara' },
  { slug: 'merida', estado: 'Mérida' },
  { slug: 'miranda', estado: 'Miranda' },
  { slug: 'monagas', estado: 'Monagas' },
  // Nueva Esparta no tiene pagina en el sitio (ver SUPPLEMENTO_MANUAL).
  { slug: 'portuguesa', estado: 'Portuguesa' },
  { slug: 'sucre', estado: 'Sucre' },
  { slug: 'tachira', estado: 'Táchira' },
  { slug: 'trujillo', estado: 'Trujillo' },
  { slug: 'vargas', estado: 'La Guaira' },
  { slug: 'yaracuy', estado: 'Yaracuy' },
  { slug: 'zulia', estado: 'Zulia' },
]

/**
 * La unica fuente de verdad es el sitio, pero hay una excepcion:
 * Nueva Esparta no tiene pagina. /parroquia/nueva-esparta da 404, y tambien
 * 404 en /estado/ y /municipio/; solo sobrevive el enlace del menu, que esta
 * roto. El sitio tampoco publica el conteo de ese estado.
 *
 * Estos datos van provistos a mano y entran por el mismo pipeline que el
 * scrapeo, asi que src/lib/venezuela.js sigue generandose entero y no queda
 * ningun estado escrito a mano.
 *
 * Sin esto el catalogo queda en 23 estados / 324 municipios; con esto, 24 / 335,
 * que es el total oficial.
 */
const SUPPLEMENTO_MANUAL = [
  {
    estado: 'Nueva Esparta',
    municipios: [
      { nombre: 'Antolín del Campo', parroquias: ['Antolín del Campo'] },
      { nombre: 'Arismendi', parroquias: ['Arismendi'] },
      { nombre: 'Díaz', parroquias: ['San Juan Bautista', 'Zabala'] },
      { nombre: 'García', parroquias: ['García', 'Francisco Fajardo'] },
      {
        nombre: 'Gómez',
        parroquias: ['Bolívar', 'Guevara', 'Matasiete', 'Santa Ana', 'Sucre'],
      },
      { nombre: 'Maneiro', parroquias: ['Aguirre', 'Maneiro'] },
      { nombre: 'Marcano', parroquias: ['Adrián', 'Juan Griego'] },
      { nombre: 'Mariño', parroquias: ['Mariño'] },
      { nombre: 'Península de Macanao', parroquias: ['San Francisco'] },
      { nombre: 'Tubores', parroquias: ['Tubores', 'Los Barales'] },
      { nombre: 'Villalba', parroquias: ['Vicente Fuentes', 'San Pedro de Coche'] },
    ],
  },
]

/**
 * Correcciones puntuales sobre lo que devuelve el sitio.
 *
 * A diferencia de SUPPLEMENTO_MANUAL, aqui el estado SI se publica: lo que
 * falta son parroquias que la pagina del sitio omite. Van como "agregar", nunca
 * como reemplazo: el sitio manda sobre lo que si publica.
 *
 * Lara / Palavecino
 *   El sitio lista Cabudare y Agua Viva, y omite "Jose Gregorio Bastidas",
 *   que si es parroquia de ese municipio. No es un cambio de nombre ni una
 *   diferencia de criterio: la pagina se la salteo. Sin esta correccion el
 *   municipio queda con 2 de sus 3 parroquias y las actividades ya guardadas
 *   con "Jose Gregorio Bastidas" quedan con el select en cascada vacio, que es
 *   justo lo que'avisa esquemas.js:219-222.
 */
const CORRECCIONES_MANUALES = {
  'Lara|Palavecino': {
    agregar: ['José Gregorio Bastidas'],
  },
}

/**
 * El sitio escribe el municipio con un cola de conteo en algunas paginas
 * ("Municipio Libertador de Caracas  tiene  22 parroquias.") y en otras usa
 * el nombre largo donde el resto del catalogo usa el corto.
 */
const RENOMBRES_MUNICIPIO = {
  'Libertador de Caracas': 'Libertador',
}

/** Quita acentos y signos para comparar nombres sin depender de la tilde. */
function base(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function limpiar(texto) {
  return texto
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&amp;/g, '&')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Convierte el HTML en lineas de texto. Los <br> son separadores reales de
 * registro; el resto de etiquetas se descarta.
 *
 * Los bloques <style> y <script> se eliminan enteros: el CSS inline lleva
 * punto y coma por todos lados y, sin filtrarlo, cada regla se parsea como si
 * fuera una fila de la tabla de parroquias.
 */
function aLineas(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(limpiar)
    .filter(Boolean)
}

const RUIDO =
  /es la capital del estado|cuántas parroquias|cuales son los|anexo:parroquias|lista de parroquias|lista por estado|ciudad;\s*municipio|municipio;\s*parroquia|ver también|ver tambien|códigos de|buscar|guía telefónica|páginas|directorio|marcador|en vivo|noticias|pregunta/i

/**
 * El sitio usa varias convenciones de marcado. Se detectan por la cabecera en
 * lugar de adivinarlas, porque "A; B; C" significa cosas distintas segun la
 * pagina: en Aragua es Ciudad/Municipio/Parroquia, en Tachira es
 * Municipio/Parroquia/Capital.
 */
function detectarEsquema(lineas) {
  for (const l of lineas) {
    // "Ciudad; Municipio; Parroquia; Poblacion", a veces precedida de otras
    // columnas ("Lista de parroquias por capital municipal; ...; Ciudad; ...").
    if (/ciudad\s*;\s*municipio\s*;\s*parroquia/i.test(l)) return 'tabla_ciudad'
    if (/^\s*municipio\s*;\s*parroquia\s*;\s*capital/i.test(l)) return 'tabla_municipio'
  }
  // Lara y Falcon listan "Parroquia, Capital" sin la palabra "Parroquia".
  const conPrefijo = lineas.filter((l) => /^Parroquia\s+\S/.test(l)).length
  const conComa = lineas.filter((l) => /^Municipio\s+\S/.test(l)).length
  return conPrefijo === 0 && conComa > 0 ? 'bloque_sin_prefijo' : 'bloque'
}

/**
 * Interpreta las lineas de un estado y devuelve los municipios con sus
 * parroquias y, cuando el sitio la da, la capital de cada parroquia.
 *
 * En las tablas las filas vienen ordenadas por poblacion, asi que las parroquias
 * de un mismo municipio NO son contiguas: se agrupa por nombre.
 */
function parsear(lineas) {
  const esquema = detectarEsquema(lineas)

  /** @type {Map<string, {nombre: string, parroquias: {nombre: string, capital: string|null}[]}>} */
  const porNombre = new Map()
  let municipioActual = null

  const asegurar = (nombre) => {
    let m = porNombre.get(nombre)
    if (!m) {
      m = { nombre, parroquias: [] }
      porNombre.set(nombre, m)
    }
    return m
  }

  const agregar = (m, nombre, capital) => {
    if (!nombre) return
    const cap = capital && capital !== nombre ? capital : null
    // El sitio repite filas entre municipios; dentro de uno, un duplicado es basura.
    if (!m.parroquias.some((p) => p.nombre === nombre)) {
      m.parroquias.push({ nombre, capital: cap })
    }
  }

  /** "Municipio Iribarren", "Municipio Ayacucho;", "Municipio de Vargas (La Guaira) es la..." */
  const nombreDeLineaMunicipio = (l) =>
    l
      .replace(/^Municipio\s+(?:de\s+)?/, '')
      .replace(/\s*\(.*?\)\s*es la capital.*$/i, '')
      .replace(/\s*es la capital del estado.*$/i, '')
      .replace(/\s+tiene\s+\d+\s+parroquias?\.?$/i, '')
      .replace(/[;,\s]+$/, '')
      .trim()

  for (const linea of lineas) {
    if (linea.length > 180) continue
    if (RUIDO.test(linea)) continue

    // --- Declaracion de municipio: "Municipio Iribarren", "Municipio Ayacucho;" ---
    // Exige un espacio despues de "Municipio" para no capturar la cabecera
    // "Municipio; Parroquia; Capital".
    if (/^Municipio\s/.test(linea)) {
      const nombre = nombreDeLineaMunicipio(linea)
      if (!nombre || nombre.length > 80) continue
      municipioActual = asegurar(RENOMBRES_MUNICIPIO[nombre] ?? nombre)
      continue
    }

    // --- Tablas ---
    if (linea.includes(';') && esquema.startsWith('tabla')) {
      const p = linea.split(';').map((x) => x.trim())
      if (p.length < 2) continue
      // La fila de totales ("...; Poblacion Total del Municipio 460 380;")
      // no es una parroquia.
      if (p.some((x) => /^poblaci/i.test(x))) continue

      if (esquema === 'tabla_ciudad') {
        // Ciudad; Municipio; Parroquia; Poblacion
        if (p.length < 3 || !p[1] || !p[2]) continue
        agregar(asegurar(RENOMBRES_MUNICIPIO[p[1]] ?? p[1]), p[2], p[0])
      } else if (p.length >= 3 && p[0] && p[1]) {
        // Tachira, las primeras filas: Municipio; Parroquia; Capital
        agregar(asegurar(RENOMBRES_MUNICIPIO[p[0]] ?? p[0]), p[1], p[2])
      } else if (municipioActual && p[0]) {
        // Tachira, despues de un "Municipio X;": Parroquia; Capital
        agregar(municipioActual, p[0], p[1])
      }
      continue
    }

    // --- "Parroquia Y, Capital" (Amazonas y similares) ---
    if (/^Parroquia\s+\S/.test(linea)) {
      if (!municipioActual) continue
      const [nombre, capital] = linea
        .replace(/^Parroquia\s+/, '')
        .split(/\s*,\s*/)
        .map((x) => x.trim())
      agregar(municipioActual, nombre, capital)
      continue
    }

    // --- "Y, Capital" sin la palabra Parroquia (Lara) ---
    if (esquema === 'bloque_sin_prefijo' && municipioActual && linea.includes(',')) {
      const [nombre, ...resto] = linea.split(',').map((x) => x.trim())
      agregar(municipioActual, nombre, resto.join(', '))
    }
  }

  return [...porNombre.values()]
}

async function bajar(pagina) {
  const url = `${BASE}/${pagina.slug}`
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (scraper catalogo locations)' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return { url, html: await res.text() }
}

async function main() {
  const estados = []
  const avisos = []

  for (const pagina of PAGINAS) {
    if (pagina.omitir) continue

    const { url, html } = await bajar(pagina)
    const municipios = parsear(aLineas(html))

    if (!municipios.length) throw new Error(`${url}: no se encontro ningun municipio`)

   // Parroquias que el sitio omite, agregadas sobre lo que si publico.
    for (const m of municipios) {
      const correccion = CORRECCIONES_MANUALES[`${pagina.estado}|${m.nombre}`]
      if (!correccion?.agregar) continue
      for (const nombre of correccion.agregar) {
        if (m.parroquias.some((p) => p.nombre === nombre)) continue
        m.parroquias.push({ nombre, capital: null })
        console.log(`      + ${nombre} (correccion manual)`)
      }
    }

    estados.push({ nombre: pagina.estado, municipios })

    const nParroquias = municipios.reduce((a, m) => a + m.parroquias.length, 0)
    console.log(
      `${String(municipios.length).padStart(3)} municipios ` +
        `${String(nParroquias).padStart(4)} parroquias  ${pagina.estado}`,
    )

    // Los municipios sin parroquia rompen el select en cascada.
    for (const m of municipios) {
      if (!m.parroquias.length) avisos.push(`${pagina.estado}: "${m.nombre}" sin parroquias`)
    }
  }

  // Estados que el sitio no publica, con los datos provistos a mano.
  for (const extra of SUPPLEMENTO_MANUAL) {
    const municipios = extra.municipios.map((m) => ({
      nombre: m.nombre,
      parroquias: m.parroquias.map((nombre) => ({ nombre, capital: null })),
    }))

    if (!municipios.length) throw new Error(`${extra.estado}: suplemento vacio`)

    estados.push({ nombre: extra.estado, municipios })

    const nParroquias = municipios.reduce((a, m) => a + m.parroquias.length, 0)
    console.log(
      `${String(municipios.length).padStart(3)} municipios ` +
        `${String(nParroquias).padStart(4)} parroquias  ${extra.estado} (a mano)`,
    )

    for (const m of municipios) {
      if (!m.parroquias.length) avisos.push(`${extra.estado}: "${m.nombre}" sin parroquias`)
    }
  }

  estados.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const salida = join(HERE, 'datos-crudos.json')
  await writeFile(salida, JSON.stringify({ estados }, null, 2) + '\n', 'utf8')

  const totalMunicipios = estados.reduce((a, e) => a + e.municipios.length, 0)
  const totalParroquias = estados.reduce(
    (a, e) => a + e.municipios.reduce((b, m) => b + m.parroquias.length, 0),
    0,
  )

  console.log('---')
  console.log(`${estados.length} estados, ${totalMunicipios} municipios, ${totalParroquias} parroquias`)
  console.log(`escrito: ${salida}`)

  if (avisos.length) {
    console.log('--- avisos ---')
    avisos.forEach((a) => console.log(`  ${a}`))
  }
}

export { aLineas, parsear, detectarEsquema, limpiar, base, PAGINAS }

// Solo corre cuando se ejecuta el archivo, no cuando otro lo importa.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
}