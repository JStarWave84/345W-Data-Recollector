/**
 * Store de actividades: la jornada abierta, la lista y las mutaciones.
 *
 * Decisiones:
 *
 * - Ninguna consulta usa la service_role. Todo va con la sesion del usuario, de
 *   modo que la RLS siga siendo la unica barrera. Un coordinador no puede ver
 *   ni escribir fuera de su coordinacion, y eso no depende de que el codigo
 *   sea cuidadoso.
 *
 * - Los errores de escritura se verifican por el DATO, no por el `error` que
 *   devuelve supabase-js. PostgREST no avisa cuando una policy filtra la fila
 *   en silencio: un UPDATE bloqueado devuelve { data: null, error: null }. Por
 *   eso cada mutacion que espera un resultado comprueba que la fila exista.
 *
 * - `marcarEnviada`, `validar` y `revertir` llaman a las funciones de la
 *   migracion 010/011 en vez de armar el UPDATE a mano: asi el estado y el
 *   timestamp se escriben en la misma sentencia.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { supabase } from '../lib/supabase.js'
import { obtenerCatalogos, serviciosDeCoordinacion } from '../lib/catalogos.js'
import { primerDia } from '../lib/fechas.js'
import { useAuthStore } from './auth.js'

const CAMPOS_CABECERA = [
  'titulo',
  'fecha',
  'mes_reporte',
  'coordinacion_id',
  'responsable',
  'estado_ubicacion',
  'municipio',
  'parroquia',
  'ubicacion',
  'tipo_establecimiento_id',
  'latitud',
  'longitud',
  'fuente_financiamiento_id',
  'observaciones',
]

// Los campos numericos se mandan como number o null. Si se mandara "", Postgres
// lo rechaza en numeric(10,6) con un error que no dice nada util.
function limpiarNumerico(valor) {
  if (valor === '' || valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

/**
 * Id del usuario autenticado, para las columnas de auditoria.
 *
 * La columna no tiene default en la base: si el cliente no la manda, queda en
 * null y se pierde la trazabilidad de quien cargo cada fila. Se lee del store de
 * auth, que es el unico lugar donde vive la sesion.
 */
function usuarioId() {
  return useAuthStore().user?.id ?? null
}

export const useActividadesStore = defineStore('actividades', () => {
  const actividades = ref([])
  const cargandoLista = ref(false)
  const errorLista = ref(null)

  // La jornada abierta
  const actividad = ref(null)
  const atenciones = ref([])
  const serviciosPorAtencion = ref({})
  const cargandoDetalle = ref(false)
  const guardando = ref(false)
  const errorDetalle = ref(null)

  const catalogos = ref(null)

  const estaAbierta = computed(() => actividad.value !== null)

  /**
   * Una actividad queda editable en borrador, y el admin puede corregirla en
   * cualquier estado: la RLS y el trigger lo permiten a proposito, porque una
   * actividad validada con un error de tipeo en el municipio no puede quedar
   * clavada para siempre. El coordinador solo edita mientras sea borrador.
   */
  const editable = computed(() => {
    if (!actividad.value) return false
    if (useAuthStore().isAdmin) return true
    return actividad.value.estado === 'borrador'
  })

  const porEstado = computed(() => {
    const cuenta = { borrador: 0, enviada: 0, validada: 0 }
    for (const a of actividades.value) {
      if (cuenta[a.estado] !== undefined) cuenta[a.estado] += 1
    }
    return cuenta
  })

  // -------------------------------------------------------------------------
  // Catalogos
  // -------------------------------------------------------------------------

  async function cargarCatalogos(forzar = false) {
    try {
      catalogos.value = await obtenerCatalogos({ forzar })
    } catch (e) {
      errorLista.value = e.message
    }
  }

  // -------------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------------

  /**
   * Carga la lista de actividades. La RLS ya filtra: un coordinador recibe
   * solo su coordinacion y un admin todas. Por eso no hay que filtrar en el
   * cliente, y agregar un filtro aca daria una sensacion de seguridad falsa.
   */
  async function cargarLista({ estados = null } = {}) {
    cargandoLista.value = true
    errorLista.value = null
    try {
      let consulta = supabase
        .from('actividades')
        .select('id, titulo, fecha, mes_reporte, coordinacion_id, estado, responsable, created_at')
        .order('mes_reporte', { ascending: false })
        .order('created_at', { ascending: false })

      if (estados?.length) consulta = consulta.in('estado', estados)

      const { data, error } = await consulta
      if (error) throw error
      actividades.value = data ?? []
    } catch (e) {
      errorLista.value = e.message
      actividades.value = []
    } finally {
      cargandoLista.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Detalle
  // -------------------------------------------------------------------------

  async function abrirActividad(id) {
    cargandoDetalle.value = true
    errorDetalle.value = null
    try {
      const { data: act, error } = await supabase
        .from('actividades')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!act) {
        errorDetalle.value =
          'No se encontro la actividad, o no pertenece a tu coordinacion.'
        actividad.value = null
        return
      }

      const { data: personas, error: eAtt } = await supabase
        .from('atenciones')
        .select('*')
        .eq('actividad_id', id)
        .order('created_at', { ascending: true })
      if (eAtt) throw eAtt

      const ids = (personas ?? []).map((p) => p.id)

      // El pivote se pide solo para las atenciones de esta actividad. La RLS
      // ya limita que se pueda leer, pero traer el pivote entero de la base
      // para quedarse con un puñado de filas es trabajo de mas: en una ONG con
      // varias coordinaciones son decenas de miles de filas.
      const pivote = ids.length
        ? (
            await supabase
              .from('atencion_servicios')
              .select('atencion_id, servicio_id, cantidad')
              .in('atencion_id', ids)
          )
        : { data: [], error: null }
      if (pivote.error) throw pivote.error

      const indice = {}
      for (const fila of pivote.data ?? []) {
        ;(indice[fila.atencion_id] ??= []).push(fila)
      }

      actividad.value = act
      atenciones.value = personas ?? []
      serviciosPorAtencion.value = indice
    } catch (e) {
      errorDetalle.value = e.message
    } finally {
      cargandoDetalle.value = false
    }
  }

  function cerrarActividad() {
    actividad.value = null
    atenciones.value = []
    serviciosPorAtencion.value = {}
    errorDetalle.value = null
  }

  // -------------------------------------------------------------------------
  // Cabecera
  // -------------------------------------------------------------------------

  async function crearActividad(datos) {
    guardando.value = true
    errorDetalle.value = null
    try {
      const carga = {
        titulo: datos.titulo,
        // mes_reporte se guarda como date en el primer dia del mes.
        mes_reporte: datos.mes_reporte ? primerDia(datos.mes_reporte) : null,
        fecha: datos.fecha || null,
        coordinacion_id: datos.coordinacion_id,
        responsable: datos.responsable || null,
        estado_ubicacion: datos.estado_ubicacion || null,
        municipio: datos.municipio || null,
        parroquia: datos.parroquia || null,
        establecimiento: datos.ubicacion || null,
        tipo_establecimiento_id: datos.tipo_establecimiento_id || null,
        latitud: limpiarNumerico(datos.latitud),
        longitud: limpiarNumerico(datos.longitud),
        fuente_financiamiento_id: datos.fuente_financiamiento_id || null,
        observaciones: datos.observaciones || null,
        estado: 'borrador',
        created_by: usuarioId(),
      }

      const { data, error } = await supabase
        .from('actividades')
        .insert(carga)
        .select('*')
        .single()
      if (error) throw error

      actividad.value = data
      atenciones.value = []
      serviciosPorAtencion.value = {}
      return data
    } catch (e) {
      errorDetalle.value = e.message
      return null
    } finally {
      guardando.value = false
    }
  }

  async function guardarCabecera(cambios) {
    if (!actividad.value) return false
    guardando.value = true
    errorDetalle.value = null
    try {
      const carga = {}
      for (const campo of CAMPOS_CABECERA) {
        if (!(campo in cambios)) continue
        if (campo === 'mes_reporte') {
          carga.mes_reporte = cambios.mes_reporte
            ? primerDia(cambios.mes_reporte)
            : null
        } else if (campo === 'latitud' || campo === 'longitud') {
          carga[campo] = limpiarNumerico(cambios[campo])
        } else if (campo === 'ubicacion') {
          carga.establecimiento = cambios.ubicacion || null
        } else {
          carga[campo] = cambios[campo] || null
        }
      }

      const { data, error } = await supabase
        .from('actividades')
        .update(carga)
        .eq('id', actividad.value.id)
        .select('*')
        .single()
      if (error) throw error
      if (!data) throw new Error('No se pudo guardar. La actividad ya no es editable.')

      actividad.value = data
      return true
    } catch (e) {
      errorDetalle.value = e.message
      return false
    } finally {
      guardando.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Atenciones
  // -------------------------------------------------------------------------

  async function crearAtencion(datos) {
    if (!actividad.value) return null
    errorDetalle.value = null
    try {
      const { data, error } = await supabase
        .from('atenciones')
        .insert({ ...datos, actividad_id: actividad.value.id, created_by: usuarioId() })
        .select('*')
        .single()
      if (error) throw error
      if (!data) throw new Error('No se pudo guardar la atencion.')

      atenciones.value = [...atenciones.value, data]
      serviciosPorAtencion.value = { ...serviciosPorAtencion.value, [data.id]: [] }
      return data
    } catch (e) {
      errorDetalle.value = e.message
      return null
    }
  }

  async function actualizarAtencion(id, cambios) {
    errorDetalle.value = null
    try {
      const { data, error } = await supabase
        .from('atenciones')
        .update(cambios)
        .eq('id', id)
        .select('*')
        .single()

      // El trigger y la RLS bloquean la escritura si la actividad ya no esta
      // en borrador. En ese caso no hay error: la fila simplemente no vuelve.
      if (error) throw error
      if (!data) {
        throw new Error(
          'No se pudo guardar. La actividad ya fue enviada y su morbilidad quedo bloqueada.',
        )
      }

      atenciones.value = atenciones.value.map((a) => (a.id === id ? data : a))
      return data
    } catch (e) {
      errorDetalle.value = e.message
      return null
    }
  }

  async function borrarAtencion(id) {
    errorDetalle.value = null
    try {
      const { data, error } = await supabase
        .from('atenciones')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      if (!data?.length) {
        throw new Error(
          'No se pudo borrar. La actividad ya fue enviada y su morbilidad quedo bloqueada.',
        )
      }

      atenciones.value = atenciones.value.filter((a) => a.id !== id)
      const copia = { ...serviciosPorAtencion.value }
      delete copia[id]
      serviciosPorAtencion.value = copia
      return true
    } catch (e) {
      errorDetalle.value = e.message
      return false
    }
  }

  // -------------------------------------------------------------------------
  // Servicios por atencion
  // -------------------------------------------------------------------------

  /**
   * Guarda el conjunto de servicios de una atencion.
   *
   * NO se hace "borrar todo y reinsertar". Con la RLS, un DELETE bloqueado
   * devuelve { data: null, error: null } igual que uno exitoso, y si despues
   * fallara el INSERT la persona se quedaria sin los servicios que ya tenia.
   * En vez de eso se calcula la diferencia: se actualiza lo que cambio de
   * cantidad, se inserta lo que es nuevo y se borra lo que se saco.
   *
   * El orden importa. Los borrados van ULTIMO a proposito: si fallara un
   * INSERT, el rollback es "sobran filas", que el siguiente guardado corrige
   * solo, mientras que borrar primero y fallar despues es "faltan filas", que
   * significa perder informacion que la persona ya habia capturado.
   *
   * Sigue sin ser atomico en el sentido estricto: son varias sentencias y
   * entre ellas la actividad podria pasar a enviada. Por eso, tras cualquier
   * excepcion se releen los servicios desde la base en vez de dejar el estado
   * local adivinando que quedo.
   */
  async function guardarServicios(atencionId, servicios) {
    errorDetalle.value = null
    try {
      const deseados = new Map()
      for (const s of servicios) {
        if (!s.servicio_id) continue
        deseados.set(s.servicio_id, Math.max(1, Number(s.cantidad) || 1))
      }

      const actuales = new Map(
        (serviciosPorAtencion.value[atencionId] ?? []).map((s) => [
          s.servicio_id,
          s.cantidad,
        ]),
      )

      const paraBorrar = [...actuales.keys()].filter((id) => !deseados.has(id))
      const paraActualizar = [...deseados.entries()].filter(
        ([id, cant]) => actuales.has(id) && actuales.get(id) !== cant,
      )
      const paraInsertar = [...deseados.entries()].filter(
        ([id]) => !actuales.has(id),
      )

      if (paraActualizar.length) {
        // La PK es compuesta, asi que la clave del upsert son las dos columnas
        // juntas. Sin esto PostgREST no podria decidir cual fila actualizar.
        for (const [servicioId, cantidad] of paraActualizar) {
          const { error } = await supabase
            .from('atencion_servicios')
            .upsert(
              { atencion_id: atencionId, servicio_id: servicioId, cantidad },
              { onConflict: 'atencion_id,servicio_id' },
            )
          if (error) throw error
        }
      }

      if (paraInsertar.length) {
        const { error } = await supabase
          .from('atencion_servicios')
          .insert(
            paraInsertar.map(([servicioId, cantidad]) => ({
              atencion_id: atencionId,
              servicio_id: servicioId,
              cantidad,
            })),
          )
        if (error) throw error
      }

      // Los borrados van al final: hasta aca solo se agrego o adjusts filas, y
      // cualquier falla deja informacion de mas en lugar de informacion de menos.
      if (paraBorrar.length) {
        const { error } = await supabase
          .from('atencion_servicios')
          .delete()
          .eq('atencion_id', atencionId)
          .in('servicio_id', paraBorrar)
        if (error) throw error
      }

      serviciosPorAtencion.value = {
        ...serviciosPorAtencion.value,
        [atencionId]: [...deseados.entries()].map(([servicio_id, cantidad]) => ({
          servicio_id,
          cantidad,
        })),
      }
      return true
    } catch (e) {
      errorDetalle.value = e.message
      // Como no hay transaccion, el estado local puede no coincidir con la
      // base. Se relee la fila y se muestra la verdad, no lo que se quiso.
      const { data } = await supabase
        .from('atencion_servicios')
        .select('servicio_id, cantidad')
        .eq('atencion_id', atencionId)
      if (data) {
        serviciosPorAtencion.value = {
          ...serviciosPorAtencion.value,
          [atencionId]: data,
        }
      }
      return false
    }
  }

  // -------------------------------------------------------------------------
  // Transiciones de estado (migraciones 010 y 011)
  // -------------------------------------------------------------------------

  async function marcarEnviada(id) {
    errorDetalle.value = null
    try {
      const { data, error } = await supabase.rpc('enviar_actividad', {
        p_actividad_id: id,
      })
      if (error) throw error
      if (!data) throw new Error('No se pudo enviar la actividad.')
      if (actividad.value?.id === id) actividad.value = data
      return data
    } catch (e) {
      errorDetalle.value = e.message
      return null
    }
  }

  async function validar(id) {
    errorDetalle.value = null
    try {
      const { data, error } = await supabase.rpc('validar_actividad', {
        p_actividad_id: id,
      })
      if (error) throw error
      if (!data) throw new Error('No se pudo validar la actividad.')
      if (actividad.value?.id === id) actividad.value = data
      return data
    } catch (e) {
      errorDetalle.value = e.message
      return null
    }
  }

  async function revertir(id) {
    errorDetalle.value = null
    try {
      const { data, error } = await supabase.rpc('revertir_actividad', {
        p_actividad_id: id,
      })
      if (error) throw error
      if (!data) throw new Error('No se pudo revertir la actividad.')
      if (actividad.value?.id === id) actividad.value = data
      return data
    } catch (e) {
      errorDetalle.value = e.message
      return null
    }
  }

  async function borrarActividad(id) {
    errorDetalle.value = null
    try {
      const { data, error } = await supabase
        .from('actividades')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data?.length) {
        throw new Error(
          'No se pudo borrar. Solo se puede borrar una actividad en borrador propia.',
        )
      }
      actividades.value = actividades.value.filter((a) => a.id !== id)
      if (actividad.value?.id === id) cerrarActividad()
      return true
    } catch (e) {
      errorLista.value = e.message
      return false
    }
  }

  /**
   * Copia una jornada como base de otra.
   *
   * Se relee la fila completa y no se copia desde la lista: la consulta de la
   * lista pide solo unos pocos campos, y duplicar desde ahi producira una copia
   * con municipio, parroquia y ubicacion vacios, que es peor que no duplicar.
   * La copia arranca en borrador y SIN morbilidad: es una plantilla, no un
   * clon de los datos de las personas.
   */
  async function duplicarActividad(id) {
    const { data: origen, error } = await supabase
      .from('actividades')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      errorDetalle.value = error.message
      return null
    }
    if (!origen) {
      errorDetalle.value = 'No se encontro la actividad que se quiso duplicar.'
      return null
    }

    return crearActividad({
      titulo: `${origen.titulo ?? 'Jornada'} (copia)`,
      mes_reporte: origen.mes_reporte?.slice(0, 7),
      fecha: origen.fecha,
      coordinacion_id: origen.coordinacion_id,
      responsable: origen.responsable,
      estado_ubicacion: origen.estado_ubicacion,
      municipio: origen.municipio,
      parroquia: origen.parroquia,
      ubicacion: origen.establecimiento,
      tipo_establecimiento_id: origen.tipo_establecimiento_id,
      latitud: origen.latitud,
      longitud: origen.longitud,
      fuente_financiamiento_id: origen.fuente_financiamiento_id,
      observaciones: origen.observaciones,
    })
  }

  return {
    // estado
    actividades,
    cargandoLista,
    errorLista,
    actividad,
    atenciones,
    serviciosPorAtencion,
    cargandoDetalle,
    guardando,
    errorDetalle,
    catalogos,
    estaAbierta,
    editable,
    porEstado,
    // acciones
    cargarCatalogos,
    cargarLista,
    abrirActividad,
    cerrarActividad,
    crearActividad,
    guardarCabecera,
    crearAtencion,
    actualizarAtencion,
    borrarAtencion,
    guardarServicios,
    marcarEnviada,
    validar,
    revertir,
    borrarActividad,
    duplicarActividad,
    // helpers
    serviciosDe: (id) => serviciosDeCoordinacion(id),
  }
})
