import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { supabase } from '../lib/supabase.js'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const profile = ref(null)
  const loading = ref(true)
  const initialized = ref(false)

  const user = computed(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => !!session.value)
  const isAdmin = computed(() => profile.value?.rol === 'admin')
  const coordinacion = computed(
    () => profile.value?.coordinaciones?.nombre ?? null,
  )

  // El perfil lo crea el trigger on_auth_user_created, asi que puede tardar un
  // instante en existir justo despues de un signup. Un unico reintento alcanza.
  async function loadProfile(userId) {
    for (let intento = 0; intento < 2; intento++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nombre, rol, coordinacion_id, coordinaciones(nombre)')
        .eq('id', userId)
        .maybeSingle()

      if (!error && data) {
        profile.value = data
        return
      }
      if (error && intento === 0) await new Promise((r) => setTimeout(r, 400))
    }
  }

  // supabase-js bloquea si se espera una consulta dentro del callback de
  // onAuthStateChange: el callback retiene un lock que la consulta necesita.
  // Por eso el trabajo se difiera con setTimeout.
  supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
    session.value = nuevaSesion
    setTimeout(() => {
      if (nuevaSesion) {
        loadProfile(nuevaSesion.user.id)
      } else {
        profile.value = null
      }
    }, 0)
  })

  let initPromise

  function init() {
    if (!initPromise) {
      loading.value = true
      initPromise = supabase.auth
        .getSession()
        .then(async ({ data }) => {
          session.value = data.session
          if (data.session) await loadProfile(data.session.user.id)
        })
        .finally(() => {
          loading.value = false
          initialized.value = true
        })
    }
    return initPromise
  }

  /**
   * Vuelve a leer el perfil del usuario actual.
   *
   * Hace falta porque `init()` esta guardado con initPromise: corre una sola
   * vez y despues solo devuelve la promesa cacheada. Asi que llamar a init()
   * para "refrescar" tras editar el nombre no hacia nada, y la pantalla se
   * quedaba mostrando el valor viejo hasta recargar la pagina.
   *
   * No limpia `profile` mientras lee, para que la barra y los permisos no
   * parpadeen durante el UPDATE.
   */
  async function refreshProfile() {
    const userId = session.value?.user?.id
    if (!userId) return
    await loadProfile(userId)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    session.value = data.session
    if (data.session) await loadProfile(data.session.user.id)
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    session.value = null
    profile.value = null
  }

  return {
    session,
    profile,
    loading,
    initialized,
    user,
    isAuthenticated,
    isAdmin,
    coordinacion,
    init,
    refreshProfile,
    signIn,
    signOut,
  }
})
