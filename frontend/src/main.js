import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import vuetify from './plugins/vuetify'
import { canDirective } from './plugins/permissions'
// Bootstrap : CSS seulement. Le bundle JS (+ Popper) était importé sans AUCUN
// usage dans l'app (zéro attribut data-bs-*, zéro appel Modal/Tooltip/etc. —
// tout l'interactif passe par Vuetify) → retiré du chunk eager.
import 'bootstrap/dist/css/bootstrap.min.css'
import '../src/index.css'
import './style.css'
import './styles/workspace-ui.css'

createApp(App)
  .use(router)
  .use(store)
  .use(vuetify)
  .directive('can', canDirective)
  .mount('#app')
