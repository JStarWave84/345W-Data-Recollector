import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router.js'
// main.css entra por el plugin de Vuetify, DESPUES de 'vuetify/styles', para que
// sus reglas (altos de campo, radios, color de fondo) ganen sobre la base del
// framework. Si se importara aca, el orden dependeria del bundler.
import vuetify from './plugins/vuetify.js'

const app = createApp(App)

app.use(createPinia())
app.use(vuetify)
app.use(router)

app.mount('#app')
