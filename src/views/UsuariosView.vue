<script setup>
/**
 * Gestion de usuarios (solo admin).
 *
 * Hay dos caminos distintos y es importante no mezclarlos:
 *
 *   - CREAR un usuario exige la API admin de Auth, que necesita la service_role.
 *     Esa clave no puede ir en el frontend, asi que se llama a la Edge Function
 *     crear-usuario, que verifica que quien llama es admin y crea el usuario.
 *
 *   - EDITAR rol/coordinacion/activo y DESACTIVAR van directo por Supabase,
 *     porque la RLS de profiles ya le da al admin permiso de escritura.
 *
 * La lista se lee de public.profiles (que tiene email y nombre), no de
 * auth.users: la RLS deja al admin ver todos los perfiles.
 */
import { computed, onMounted, ref } from 'vue'
import { CircleCheck, CircleOff, Pencil, UserPlus } from 'lucide-vue-next'
import { supabase } from '../lib/supabase.js'
import { USUARIO_NUEVO, validar, validarCampo } from '../lib/esquemas.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

const URL_SUPABASE = 'https://sgyekoxqbfvhovkiulny.supabase.co'
// La Edge Function pide el apikey para identificar el proyecto, ademas del JWT
// del usuario. Sin ese header responde 401 antes de correr.
const PUBLISHABLE = import.meta.env.VITE_SUPABASE_ANON_KEY

const usuarios = ref([])
const coordinaciones = ref([])
const cargando = ref(true)
const error = ref(null)

const dialogo = ref(false)
const editando = ref(null)
const guardando = ref(false)

// v-model no acepta expresiones complejas, asi que cada dialogo tiene su
// computado que deriva de dialogo + editando.
const dialogoCrear = computed({
  get: () => dialogo.value && !editando.value,
  set: (v) => {
    dialogo.value = v
  },
})
const dialogoEditar = computed({
  get: () => dialogo.value && !!editando.value,
  set: (v) => {
    dialogo.value = v
  },
})

// Formulario de creacion
const form = ref({ email: '', password: '', nombre: '', rol: 'coordinacion', coordinacion_id: null })
// Formulario de edicion
const editForm = ref({ rol: 'coordinador', coordinacion_id: null, activo: true })

const ROLES = [
  { title: 'Coordinador', value: 'coordinador' },
  { title: 'Admin', value: 'admin' },
]

const coordinacionNombre = computed(() => {
  return (id) => coordinaciones.value.find((c) => c.id === id)?.nombre ?? '—'
})

async function cargar() {
  cargando.value = true
  error.value = null
  const [{ data: perfiles, error: e1 }, { data: coords, error: e2 }] = await Promise.all([
    supabase.from('profiles').select('id, email, nombre, rol, coordinacion_id, activo').order('email'),
    supabase.from('coordinaciones').select('id, nombre').order('nombre'),
  ])
  cargando.value = false
  if (e1) {
    error.value = e1.message
    return
  }
  if (e2) {
    error.value = e2.message
    return
  }
  usuarios.value = perfiles ?? []
  coordinaciones.value = coords ?? []
}

function abrirNuevo() {
  editando.value = null
  form.value = { email: '', password: '', nombre: '', rol: 'coordinador', coordinacion_id: null }
  dialogo.value = true
}

function abrirEditar(u) {
  editando.value = u
  editForm.value = {
    rol: u.rol,
    coordinacion_id: u.coordinacion_id,
    activo: u.activo,
  }
  dialogo.value = true
}

const reglaEmail = (valor) =>
  validarCampo(USUARIO_NUEVO, { ...form.value, email: valor }, 'email') ?? true
const reglaPassword = (valor) =>
  validarCampo(USUARIO_NUEVO, { ...form.value, password: valor }, 'password') ?? true

async function crearUsuario() {
  const { email, password, nombre, rol, coordinacion_id } = form.value

  // El alta real la hace la Edge Function, que corre con la service_role y es la
  // que autoriza. Esto es la primera linea: frena el error mas comun, que es el
  // email mal escrito, antes de gastar un viaje de red.
  const problema = validar(USUARIO_NUEVO, { email, password, nombre, rol, coordinacion_id })
  if (problema) {
    error.value = problema
    return
  }

  guardando.value = true
  error.value = null

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const res = await fetch(`${URL_SUPABASE}/functions/v1/crear-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email, password, nombre, rol, coordinacion_id }),
    })

    const cuerpo = await res.json().catch(() => ({}))

    if (!res.ok) {
      error.value = cuerpo.error ?? `Error ${res.status} al crear el usuario.`
      return
    }

    dialogo.value = false
    await cargar()
  } catch (e) {
    // Red caida, CORS, o la Edge Function sin deployar: se explica, no se traga.
    error.value = e?.message ?? 'No se pudo crear el usuario. Intentá de nuevo.'
  } finally {
    guardando.value = false
  }
}

async function guardarEdicion() {
  guardando.value = true
  error.value = null
  const { error: e } = await supabase
    .from('profiles')
    .update({
      rol: editForm.value.rol,
      coordinacion_id: editForm.value.coordinacion_id,
      activo: editForm.value.activo,
    })
    .eq('id', editando.value.id)
  guardando.value = false
  if (e) {
    error.value = e.message
    return
  }
  dialogo.value = false
  await cargar()
}

async function alternarActivo(u) {
  const { error: e } = await supabase
    .from('profiles')
    .update({ activo: !u.activo })
    .eq('id', u.id)
  if (e) {
    error.value = e.message
    return
  }
  await cargar()
}

onMounted(cargar)
</script>

<template>
  <v-container fluid class="py-6" style="max-width: 1000px">
    <header class="mb-6">
      <span class="sobreline">Administración</span>
      <h1 class="text-h4 mt-1">Usuarios</h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Creá cuentas, asigná rol y coordinación, y desactivá el acceso de quienes
        ya no deben entrar.
      </p>
    </header>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
      {{ error }}
    </v-alert>

    <v-card variant="outlined">
      <v-card-title class="d-flex align-center justify-space-between px-6 pt-5">
        <span class="text-h6">Usuarios de la organización</span>
        <v-btn color="primary" variant="flat" :prepend-icon="UserPlus" @click="abrirNuevo">
          Crear usuario
        </v-btn>
      </v-card-title>

      <v-card-text class="px-6 pb-5">
        <v-progress-linear v-if="cargando" indeterminate class="mb-4" />

        <v-table v-else density="comfortable">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Coordinación</th>
              <th>Activo</th>
              <th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usuarios" :key="u.id">
              <td class="text-body-2">{{ u.email }}</td>
              <td>{{ u.nombre || '—' }}</td>
              <td>
                <v-chip
                  size="small"
                  variant="tonal"
                  :color="u.rol === 'admin' ? 'primary' : 'default'"
                >
                  {{ u.rol === 'admin' ? 'Admin' : 'Coordinador' }}
                </v-chip>
              </td>
              <td>{{ coordinacionNombre(u.coordinacion_id) }}</td>
              <td>
                <v-chip size="small" :variant="u.activo ? 'tonal' : 'flat'" :color="u.activo ? 'success' : 'default'">
                  {{ u.activo ? 'Sí' : 'No' }}
                </v-chip>
              </td>
              <td class="text-end">
                <v-btn :icon="Pencil" variant="text" size="small" title="Editar" @click="abrirEditar(u)" />
                <v-btn
                  variant="text"
                  size="small"
                  :title="u.activo ? 'Desactivar' : 'Activar'"
                  @click="alternarActivo(u)"
                >
                  <v-icon :icon="u.activo ? CircleOff : CircleCheck" :color="u.activo ? 'warning' : 'success'" />
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <!-- Dialogo de creacion -->
    <v-dialog v-model="dialogoCrear" max-width="520">
      <v-card>
        <v-card-title class="px-6 pt-5">Crear usuario</v-card-title>
        <v-card-text class="px-6 pt-4">
          <v-text-field
              v-model="form.email"
              label="Email"
              type="email"
              :rules="[reglaEmail]"
              validate-on="input lazy"
              class="mb-3"
            />
          <v-text-field
            v-model="form.password"
            label="Contraseña"
            type="password"
            :rules="[reglaPassword]"
            validate-on="input lazy"
            hint="Mínimo 6 caracteres."
            persistent-hint
            class="mb-3"
          />
          <v-text-field v-model="form.nombre" label="Nombre" class="mb-3" />
          <v-select v-model="form.rol" :items="ROLES" label="Rol" class="mb-3" />
          <v-select
            v-model="form.coordinacion_id"
            :items="coordinaciones"
            item-title="nombre"
            item-value="id"
            label="Coordinación"
            clearable
            hint="Obligatoria para un coordinador; un admin la puede dejar vacía."
            persistent-hint
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="dialogo = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardando" @click="crearUsuario">
            Crear
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialogo de edicion -->
    <v-dialog v-model="dialogoEditar" max-width="480">
      <v-card>
        <v-card-title class="px-6 pt-5">Editar usuario</v-card-title>
        <v-card-text class="px-6 pt-4">
          <p class="text-body-2 text-medium-emphasis mb-4">{{ editando?.email }}</p>
          <v-select v-model="editForm.rol" :items="ROLES" label="Rol" class="mb-3" />
          <v-select
            v-model="editForm.coordinacion_id"
            :items="coordinaciones"
            item-title="nombre"
            item-value="id"
            label="Coordinación"
            clearable
            class="mb-3"
          />
          <v-switch
            v-model="editForm.activo"
            label="Acceso activo"
            color="primary"
            density="compact"
            hide-details
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="dialogo = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardando" @click="guardarEdicion">
            Guardar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
