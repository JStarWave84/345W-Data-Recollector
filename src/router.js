import { createRouter, createWebHashHistory } from 'vue-router'

import { useAuthStore } from './stores/auth.js'
import { ES_MOVIL } from './lib/plataforma.js'

const routes = [
  // La app abre en la lista de jornadas: es la pantalla de trabajo, no un
  // tablero. El dashboard y la exportacion son pantallas secundarias.
  { path: '/', redirect: { name: 'actividades' } },
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { publica: true },
  },
  {
    path: '/actividades',
    name: 'actividades',
    component: () => import('./views/ActividadesView.vue'),
  },
  {
    // Sin props: true: la vista lee el id con useRoute(), y al pasar el param
    // como prop Vue advertia "Extraneous non-props attributes (id)" porque la
    // vista renderiza un fragmento (AppBar + v-main) y no puede heredarlo.
    path: '/actividad/:id',
    name: 'actividad',
    component: () => import('./views/ActividadView.vue'),
  },
  {
    // El .xlsx 345W es un archivo de 21 columnas que se arma en memoria con
    // exceljs y se guarda con un dialogo nativo: en el movil no hay donde
    // guardarlo. `soloEscritorio` lo saca de alla en el guard de mas abajo.
    path: '/exportar',
    name: 'exportar',
    component: () => import('./views/HomeView.vue'),
    meta: { soloEscritorio: true },
  },
  {
    // El coordinador gestiona los servicios de su coordinacion.
    path: '/servicios',
    name: 'servicios',
    component: () => import('./views/ServiciosView.vue'),
  },
  {
    // El admin gestiona los usuarios de la organizacion.
    path: '/usuarios',
    name: 'usuarios',
    component: () => import('./views/UsuariosView.vue'),
  },
  {
    // El admin gestiona los catalogos: tipos, grupos, fuentes, coordinaciones.
    path: '/catalogos',
    name: 'catalogos',
    component: () => import('./views/CatalogosView.vue'),
  },
  {
    path: '/perfil',
    name: 'perfil',
    component: () => import('./views/PerfilView.vue'),
  },
  { path: '/:pathMatch(.*)*', redirect: { name: 'actividades' } },
]

const router = createRouter({
  // Hash history y no HTML5: en el build de Tauri el protocolo de assets no
  // sabe servir /actividades, asi que con createWebHistory un refresh daria 404.
  // Con el hash, el webview siempre resuelve index.html.
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) await auth.init()

  if (!to.meta.publica && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.publica && auth.isAuthenticated) {
    return { name: 'actividades' }
  }
  // Sin esto, ocultar el enlace del sidebar no alcanza: la ruta sigue
  // entrando por URL o por el historial del navegador movil.
  if (to.meta.soloEscritorio && ES_MOVIL) {
    return { name: 'actividades' }
  }
  return true
})

export default router
