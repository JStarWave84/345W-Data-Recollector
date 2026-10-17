/**
 * Genera src/lib/venezuela.js a partir de scripts/datos-crudos.json.
 *
 * No se edita el catalogo a mano: se re-scrappea y se regenera. Asi el cambio
 * queda en el commit y es revisable.
 *
 * Limpieza aplicada (NO cambia que parroquia hay, solo como se escribe):
 *   - quita los prefijos "No Urbana", "Urbana", "Capital Urbana" y "Capital"
 *     que el sitio antepone a algumas parroquias;
 *   - descarta filas de resumen de poblacion ("Municipio Total de Poblacion ...");
 *   - quita aclaraciones entre parentesis que el sitio agrega al final
 *     ("Santa Rosalia de Palermo de El Hatillo ( Area metropolitana de Caracas)").
 *
 * Uso: node scripts/build-venezuela.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(HERE, '..')

/**
 * El orden importa: "Capital Urbana Calabozo" tiene que perder los dos
 * prefijos, y no solo "Urbana" (quedaria "Capital Calabozo").
 */
const PREFIJOS = [
  /^Parroquia\s+No\s+Urbana\s+/i,
  /^Parroquia\s+Urbana\s+/i,
  /^No\s+Urbana\s+/i,
  /^Urbana\s+/i,
  /^Parroquia\s+Rural\s+/i,
  /^Parroquia\s+Capital\s+Urbana\s+/i,
  /^Parroquia\s+Capital\s+/i,
  /^Capital\s+Urbana\s+/i,
  /^Capital\s+/i,
  /^Parroquia\s+/i,
]

const BASURA = [
  /^Municipio Total de Poblaci/i,
  /^Poblaci/i,
  /^Lista de/i,
  /^Total\b/i,
]

function sinPrefijo(nombre) {
  let n = nombre.trim()
  for (const re of PREFIJOS) n = n.replace(re, '')
  // "( Area metropolitana de Caracas)" y similares al final.
  n = n.replace(/\s*\((?:[^()]*)\)\s*$/, '').trim()
  return n
}

function esBasura(nombre) {
  return BASURA.some((re) => re.test(nombre)) || nombre.length < 2
}

/**
 * El mismo nombre sin tildes ni mayusculas. El sitio a veces lista dos veces
 * una parroquia cambiando solo la acentuacion ("Bolivar" y "Bolívar" en Lara).
 */
function clave(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const llevaTilde = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') !== s

/** Comilla simple para los literales de JS. */
function lit(s) {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

async function main() {
  const crudo = JSON.parse(await readFile(join(HERE, 'datos-crudos.json'), 'utf8'))

  const descartadas = []

  const estados = crudo.estados
    .map((e) => {
      const municipios = e.municipios
        .map((m) => {
          const parroquias = []
          const vistas = new Map()
          for (const p of m.parroquias) {
            const nombre = sinPrefijo(p.nombre)
            if (esBasura(nombre)) {
              descartadas.push(`${e.nombre} / ${m.nombre}: ${p.nombre}`)
              continue
            }
            const k = clave(nombre)
            const previo = vistas.get(k)
            if (previo === undefined) {
              vistas.set(k, parroquias.length)
              parroquias.push(nombre)
            } else if (llevaTilde(nombre) && !llevaTilde(parroquias[previo])) {
              // Mismo nombre, una version con tilde y otra sin: gana la acentuada.
              parroquias[previo] = nombre
            }
          }
          return { nombre: m.nombre, parroquias }
        })
        .filter((m) => m.parroquias.length > 0)
      return { nombre: e.nombre, municipios }
    })
    .filter((e) => e.municipios.length > 0)

  const cuerpo = estados
    .map((e) => {
      const mus = e.municipios
        .map((m) => `      { nombre: ${lit(m.nombre)}, parroquias: [${m.parroquias.map(lit).join(', ')}] },`)
        .join('\n')
      return `  {\n    nombre: ${lit(e.nombre)},\n    municipios: [\n${mus}\n    ],\n  },`
    })
    .join('\n')

  const salida = `/**
 * Datos geográficos de Venezuela: estados, municipios y parroquias.
 *
 * NO EDITAR A MANO. Este archivo lo genera scripts/build-venezuela.mjs a partir
 * de scripts/datos-crudos.json, que a su vez sale de scrapear-lugares.mjs.
 *
 * Para actualizarlo:
 *   node scripts/scrapear-lugares.mjs && node scripts/build-venezuela.mjs
 *   node scripts/verify-venezuela.mjs
 *
 * Estructura: array de objetos { nombre, municipios: [{ nombre, parroquias: [...] }] }
 * Se usa en el formulario de ubicación para selects dependientes con búsqueda.
 */

export const VENEZUELA = [
${cuerpo}
]

/**
 * Devuelve la lista de nombres de estados para el select.
 */
export function nombresEstados() {
  return VENEZUELA.map((e) => e.nombre)
}

/**
 * Devuelve los municipios de un estado dado.
 */
export function municipiosDe(estadoNombre) {
  const estado = VENEZUELA.find((e) => e.nombre === estadoNombre)
  return estado ? estado.municipios.map((m) => m.nombre) : []
}

/**
 * Devuelve las parroquias de un municipio dado dentro de un estado.
 */
export function parroquiasDe(estadoNombre, municipioNombre) {
  const estado = VENEZUELA.find((e) => e.nombre === estadoNombre)
  if (!estado) return []
  const municipio = estado.municipios.find((m) => m.nombre === municipioNombre)
  return municipio ? municipio.parroquias : []
}
`

  const destino = join(RAIZ, 'src', 'lib', 'venezuela.js')
  await writeFile(destino, salida, 'utf8')

  const nMun = estados.reduce((a, e) => a + e.municipios.length, 0)
  const nPar = estados.reduce((a, e) => a + e.municipios.reduce((b, m) => b + m.parroquias.length, 0), 0)

  console.log(`${estados.length} estados, ${nMun} municipios, ${nPar} parroquias`)
  console.log(`escrito: ${destino}`)
  if (descartadas.length) {
    console.log('--- descartadas ---')
    descartadas.forEach((d) => console.log(`  ${d}`))
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})