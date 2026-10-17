// Backfill de actividades.estado_ubicacion / municipio / parroquia contra el
// catalogo actual de src/lib/venezuela.js.
//
//   node scripts/migrar-lugares.mjs            # dry-run: no escribe nada
//   node scripts/migrar-lugares.mjs --aplicar  # escribe
//
// Las tres columnas son `text` libre (migracion 014), no claves foraneas, asi
// que este script NO cambia el schema: solo reescribe lo que ya existe.
//
// Que una fila quede huerfana no es lo mismo que este mal. Una actividad con un
// estado que el catalogo ya no lista sigue siendo un dato historico valido: el
// problema es que al editarla el select en cascada no puede ofrecer nada. Por eso
// lo huerfano NO se borra ni se pisa nunca; se reporta para que una persona
// decida. La correccion de verdad la hace ALIASES, en resolver-lugares.mjs.
//
// Corre con service_role. El trigger bloquear_edicion_actividad (011) tiene
// "if auth.uid() is null then return new", asi que la service_role pasa y puede
// tocar actividades en cualquier estado, incluidas las validadas.
//
// Usa scripts/run-migrar-lugares.ps1, que lee la service_role del proyecto.

import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { resolver } from './resolver-lugares.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const URL = 'https://sgyekoxqbfvhovkiulny.supabase.co'
const SERVICE = process.env.SB_SERVICE_ROLE
const APLICAR = process.argv.includes('--aplicar')

if (!SERVICE) {
  console.error('Falta SB_SERVICE_ROLE. Usar scripts/run-migrar-lugares.ps1')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

/** Csv con lo que no se pudo mapear. */
function csvEscape(s) {
  const v = String(s ?? '')
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

async function main() {
  const { data, error } = await admin
    .from('actividades')
    .select('id, titulo, estado, estado_ubicacion, municipio, parroquia')

  if (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }

  const cambios = []
  const huerfanos = []
  let sinCambio = 0

  for (const a of data) {
    const r = resolver(a)
    if (r.problema) huerfanos.push({ ...a, problema: r.problema, candidatos: r.candidatos })
    else if (r.cambia) cambios.push({ ...a, nuevo: r })
    else sinCambio += 1
  }

  console.log(`actividades: ${data.length}`)
  console.log(`  sin cambio:  ${sinCambio}`)
  console.log(`  a corregir:  ${cambios.length}`)
  console.log(`  huerfanas:   ${huerfanos.length}`)

  if (cambios.length) {
    console.log('\n--- correcciones ---')
    for (const c of cambios) {
      console.log(`  ${c.titulo} [${c.estado}]`)
      console.log(`    ${c.estado_ubicacion} / ${c.municipio} / ${c.parroquia}`)
      console.log(` -> ${c.nuevo.estado} / ${c.nuevo.municipio} / ${c.nuevo.parroquia}`)
    }
  }

  if (huerfanos.length) {
    console.log('\n--- huerfanas (NO se tocan) ---')
    for (const h of huerfanos) {
      console.log(`  ${h.titulo} [${h.estado}]`)
      console.log(`    ${h.estado_ubicacion} / ${h.municipio} / ${h.parroquia}`)
      console.log(`    ${h.problema}`)
      if (h.candidatos?.length) {
        console.log(`    opciones: ${h.candidatos.slice(0, 12).join(' ; ')}`)
      }
    }

    const filas = [
      'id,titulo,estado,estado_ubicacion,municipio,parroquia,problema,candidatos',
      ...huerfanos.map((h) =>
        [
          h.id,
          csvEscape(h.titulo),
          csvEscape(h.estado),
          csvEscape(h.estado_ubicacion),
          csvEscape(h.municipio),
          csvEscape(h.parroquia),
          csvEscape(h.problema),
          csvEscape((h.candidatos ?? []).join(' ; ')),
        ].join(','),
      ),
    ]
    const destino = join(HERE, 'reporte-lugares-huerfanos.csv')
    await writeFile(destino, filas.join('\n') + '\n', 'utf8')
    console.log(`\n  reporte: ${destino}`)
  }

  if (!APLICAR) {
    console.log('\nDRY-RUN: no se escribio nada. Con --aplicar se aplican las correcciones.')
    if (huerfanos.length) console.log('Las huerfanas NO se tocan en ningun caso.')
    return
  }

  if (!cambios.length) {
    console.log('\nnada que aplicar.')
    return
  }

  console.log('\naplicando correcciones...')
  for (const c of cambios) {
    const { error: e2 } = await admin
      .from('actividades')
      .update({
        estado_ubicacion: c.nuevo.estado,
        municipio: c.nuevo.municipio,
        parroquia: c.nuevo.parroquia,
      })
      .eq('id', c.id)

    if (e2) {
      console.error(`  FALLA ${c.id}: ${e2.message}`)
      process.exitCode = 1
    } else {
      console.log(`  ok ${c.id}`)
    }
  }
  console.log(`\n${cambios.length} corregidas, ${huerfanos.length} huerfanas sin tocar.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})