/**
 * Resolucion de una ubicacion guardada (estado / municipio / parroquia) contra
 * el catalogo actual, para el backfill de scripts/migrar-lugares.mjs.
 *
 * Vive aparte y sin dependencias de red para poder testearlo en
 * scripts/verify-venezuela.mjs sin una sesion de Supabase.
 */

import { VENEZUELA } from '../src/lib/venezuela.js'

/**
 * Renombres y correcciones que SI sabemos aplicar.
 *
 * La clave es "estadoViejo|municipioViejo" o
 * "estadoViejo|municipioViejo|parroquiaVieja"; el valor es el nombre nuevo.
 *
 * Solo van los que son unívocos. Cuando el catalogo viejo y el nuevo se
 * contradicen (el sitio se comio una parroquia, o escribio la capital donde
 * debia ir el nombre de la parroquia) NO se inventa el destino: se reporta.
 */
export const ALIASES = {
  // El sitio no publica Nueva Esparta; estos vienen del catalogo anterior.
  'Nueva Esparta|Antolín del Campo|La Plaza de Paraguachí': 'Antolín del Campo',
  'Nueva Esparta|Arismendi|La Asunción': 'Arismendi',
  'Nueva Esparta|García|El Valle del Espíritu Santo': 'García',
  'Nueva Esparta|Península de Macanao|San Francisco de Macanao': 'San Francisco',
  'Nueva Esparta|Tubores|Punta de Piedras': 'Tubores',
  'Nueva Esparta|Villalba|San Francisco de Coche': 'San Pedro de Coche',

  // El sitio arrastro una capital a donde va el nombre de la parroquia.
  'Amazonas|Alto Orinoco|La Esmeralda': 'La Esmeralda',

  // El catalogo anterior arrastro la parroquia del municipio equivocado.
  'Lara|Planas': 'Simón Planas',

  // Aragua: el catalogo anterior anteponia "No Urbana" a parroquias que en el
  // sitio no lo llevan (Las Delicias es urbana, Choroni es la unica no urbana).
  //
  // Maracay, Las Mercedes, San Mateo y Magallanes NO van aca a proposito: no son
  // parroquias de esos municipios en el catalogo actual (Maracay y Las Mercedes
  // son ciudades; San Mateo es parroquia de Aragua/Bolivar). Una fila guardada
  // con esos valores se reporta como huerfana en vez de recibir un destino
  // inventado. verify-venezuela.mjs falla si alguno deja de existir.
  'Aragua|Girardot|No Urbana Las Delicias': 'Las Delicias',
  'Aragua|Girardot|No Urbana Madre María de San José': 'Madre María de San José',
  'Aragua|Girardot|No Urbana Joaquín Crespo': 'Joaquín Crespo',
  'Aragua|Girardot|No Urbana Pedro José Ovalles': 'Pedro José Ovalles',
  'Aragua|Girardot|No Urbana José Casanova Godoy': 'José Casanova Godoy',
  'Aragua|Girardot|No Urbana Andrés Eloy Blanco': 'Andrés Eloy Blanco',
  'Aragua|Girardot|No Urbana Los Tacariguas': 'Los Tacariguas',
  'Aragua|Camatagua|No Urbana Carmen de Cura': 'Carmen de Cura',
  'Aragua|Francisco Linares Alcántara|No Urbana Francisco de Miranda': 'Francisco de Miranda',
  'Aragua|José Félix Ribas|No Urbana Zuata': 'Zuata',
  'Aragua|Libertador|No Urbana San Martín de Porres': 'San Martín de Porres',
  'Aragua|Mario Briceño Iragorry|No Urbana Caña de Azúcar': 'Caña de Azúcar',
  'Aragua|San Casimiro|No Urbana Güiripa': 'Güiripa',
  'Aragua|San Casimiro|No Urbana Ollas de Caramacate': 'Ollas de Caramacate',
  'Aragua|San Casimiro|No Urbana Valle Morín': 'Valle Morín',
  'Aragua|Santiago Mariño|No Urbana Arévalo Aponte': 'Arévalo Aponte',
  'Aragua|Santiago Mariño|No Urbana Chuao': 'Chuao',
  'Aragua|Santiago Mariño|No Urbana Samán de Güere': 'Samán de Güere',
  'Aragua|Santos Michelena|No Urbana Tiara': 'Tiara',
  'Aragua|Sucre|No Urbana Bella Vista': 'Bella Vista',
  'Aragua|Urdaneta|No Urbana Las Peñitas': 'Las Peñitas',
  'Aragua|Urdaneta|No Urbana San Francisco de Cara': 'San Francisco de Cara',
  'Aragua|Urdaneta|No Urbana Taguay': 'Taguay',
}

const porEstado = new Map(VENEZUELA.map((e) => [e.nombre, e]))

/**
 * Resuelve una fila contra el catalogo.
 *
 * Devuelve { estado, municipio, parroquia, cambia, problema, candidatos }.
 * Los tres primeros son SIEMPRE valores escribibles: si algo no se pudo
 * resolver se devuelve el original sin tocar, nunca un string vacio. Asi una
 * fila huerfana no puede empeorar por pasar por aca.
 */
export function resolver({ estado_ubicacion: estado, municipio, parroquia }) {
  const e = (estado ?? '').trim()
  const m = (municipio ?? '').trim()
  const p = (parroquia ?? '').trim()

  if (!e || !m || !p) {
    return { estado: e, municipio: m, parroquia: p, cambia: false, problema: 'campos vacios' }
  }

  const estadoFinal = ALIASES[e] ?? e
  const estadoObj = porEstado.get(estadoFinal)
  if (!estadoObj) {
    return {
      estado,
      municipio,
      parroquia,
      cambia: false,
      problema: `estado "${e}" no esta en el catalogo`,
      candidatos: [...porEstado.keys()],
    }
  }

  const aliasMun = ALIASES[`${e}|${m}`]
  const municipioFinal = aliasMun ?? m
  const municipioObj = estadoObj.municipios.find((x) => x.nombre === municipioFinal)
  if (!municipioObj) {
    return {
      estado: estadoFinal,
      municipio,
      parroquia,
      cambia: estadoFinal !== e,
      problema: `municipio "${m}" no esta en ${estadoFinal}`,
      candidatos: estadoObj.municipios.map((x) => x.nombre),
    }
  }

  const aliasPar = ALIASES[`${e}|${m}|${p}`]
  const parroquiaFinal = aliasPar ?? p
  if (!municipioObj.parroquias.includes(parroquiaFinal)) {
    return {
      estado: estadoFinal,
      municipio: municipioFinal,
      parroquia,
      cambia: estadoFinal !== e || municipioFinal !== m,
      problema: `parroquia "${p}" no esta en ${estadoFinal}/${municipioFinal}`,
      candidatos: municipioObj.parroquias,
    }
  }

  return {
    estado: estadoFinal,
    municipio: municipioFinal,
    parroquia: parroquiaFinal,
    cambia: estadoFinal !== e || municipioFinal !== m || parroquiaFinal !== p,
    problema: null,
  }
}