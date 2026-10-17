/**
 * Iconset de Vuetify sobre Lucide.
 *
 * Por que un iconset propio: Vuetify no trae uno de lucide, y el `mdi-svg`
 * que se usaba antes venía con los paths sueltos. Acá se resuelve distinto:
 *
 * Los aliases se pasan como COMPONENTE, no como string. En `useIcon`, si el
 * valor no es un string, Vuetify usa `VComponentIcon` y renderiza el
 * componente tal cual. Eso evita tener que traducir Lucide a paths SVG a mano.
 *
 * El `size` de Vuetify se respeta por CSS, no por prop: Lucide dibuja el svg
 * con width/height fijos (24), asi que en main.css hay una regla que lo lleva a
 * 1em y pasa a seguir el font-size del v-icon, que es lo que Vuetify ajusta
 * con el prop `size`.
 *
 * Los imports son NOMBRADOS a proposito: un `import * as` traeria las 5847
 * jpgs de la libreria al bundle y arruinaria el tree-shaking.
 */
import { h } from 'vue'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleDot,
  CircleX,
  Command,
  CornerDownLeft,
  Delete,
  File,
  Fullscreen,
  Info,
  LoaderCircle,
  Menu,
  Minimize,
  Minus,
  MoveVertical,
  Palette,
  Pause,
  Pencil,
  Pipette,
  Play,
  Plus,
  Search,
  Space,
  Square,
  SquareCheckBig,
  SquareMinus,
  Star,
  TriangleAlert,
  Upload,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next'

/**
 * Aliases que pide Vuetify por nombre ($dropdown, $clear, $sortAsc...).
 * Los que la app no usa no estan, pero conviene mapearlos todos: si un
 * componente de Vuetify pide uno y no esta, se cae al fallback de abajo.
 */
export const aliases = {
  // desplegar / plegar
  collapse: ChevronUp,
  expand: ChevronDown,
  dropdown: ChevronDown,
  subgroup: ChevronDown,
  unfold: MoveVertical,
  menu: Menu,

  // confirmacion y cierre
  complete: Check,
  cancel: CircleX,
  close: X,
  clear: X,
  delete: X,
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: CircleX,

  // navegacion
  first: ChevronsLeft,
  last: ChevronsRight,
  prev: ChevronLeft,
  next: ChevronRight,
  play: Play,
  pause: Pause,
  fullscreen: Fullscreen,
  fullscreenExit: Minimize,

  // seleccion
  checkboxOn: SquareCheckBig,
  checkboxOff: Square,
  checkboxIndeterminate: SquareMinus,
  radioOn: CircleDot,
  radioOff: Circle,
  delimiter: Circle,

  // tablas y arboles
  sortAsc: ArrowUp,
  sortDesc: ArrowDown,
  treeviewCollapse: ChevronDown,
  treeviewExpand: ChevronRight,
  tableGroupExpand: ChevronRight,
  tableGroupCollapse: ChevronDown,

  // edicion y archivos
  edit: Pencil,
  file: File,
  plus: Plus,
  minus: Minus,
  calendar: Calendar,
  upload: Upload,
  color: Palette,
  eyeDropper: Pipette,
  search: Search,

  // estado
  ratingEmpty: Star,
  ratingFull: Star,
  ratingHalf: Star,
  loading: LoaderCircle,

  // teclado (los atajos de Vuetify)
  command: Command,
  ctrl: ChevronUp,
  alt: Command,
  shift: ArrowUp,
  space: Space,
  enter: CornerDownLeft,
  backspace: Delete,
  arrowup: ArrowUp,
  arrowdown: ArrowDown,
  arrowleft: ArrowLeft,
  arrowright: ArrowRight,

  // volumen
  volumeHigh: Volume2,
  volumeMedium: Volume1,
  volumeLow: Volume,
  volumeOff: VolumeX,
}

/**
 * Set de respaldo. La app pasa todos los iconos como componente importado, asi
 * que nunca deberia llegar aca; existe para que un string sin resolver
 * (un typo, o un componente de Vuetify pidiendo un alias que no mapeamos)
 * renderice algo vacio en vez de romper con "component is undefined".
 */
export const lucide = {
  component: {
    name: 'LucideFallbackIcon',
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => h('svg', { ...attrs, viewBox: '0 0 24 24' })
    },
  },
}
