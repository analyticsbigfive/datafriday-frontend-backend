const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { defineConfig } = require('@vue/cli-service')

const DEVTOOLS_WORKSPACE_UUID_FILE = '.chrome-devtools-workspace-uuid'
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function createUuidV4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    '$1-$2-$3-$4-$5'
  )
}

function getDevtoolsWorkspaceUuid() {
  const uuidPath = path.resolve(__dirname, DEVTOOLS_WORKSPACE_UUID_FILE)

  try {
    const uuid = fs.readFileSync(uuidPath, 'utf8').trim()
    if (UUID_V4_RE.test(uuid)) return uuid
  } catch (_) {
    // Missing file: create one below.
  }

  const uuid = createUuidV4()

  try {
    fs.writeFileSync(uuidPath, `${uuid}\n`, { flag: 'w' })
  } catch (_) {
    // Read-only checkout: DevTools still works, but UUID changes each restart.
  }

  return uuid
}

module.exports = defineConfig({
  transpileDependencies: true,

  // Source maps CSS en dev : mappe le CSS compilé (scoped, data-v-*) vers le
  // bloc <style> d'origine dans le .vue → visible dans DevTools > Styles et
  // éditable via le Workspace connecté (cf. middleware com.chrome.devtools.json).
  css: {
    sourceMap: true,
  },

  // NOTE : un seul bloc `devServer`. Il y en avait deux — le second
  // (`historyApiFallback`) écrasait silencieusement ce bloc et faisait sauter
  // la config du client HMR (`webSocketURL`), d'où le live-reload qui ne
  // marchait plus. Tout est fusionné ici.
  devServer: {
    historyApiFallback: true,
    // Auto-reload type BrowserSync : HMR + rechargement complet en secours.
    hot: true,
    liveReload: true,
    historyApiFallback: true,
    setupMiddlewares: (middlewares) => {
      const workspacePayload = JSON.stringify({
        workspace: {
          root: __dirname,
          uuid: getDevtoolsWorkspaceUuid(),
        },
      })

      middlewares.unshift({
        name: 'chrome-devtools-workspace',
        path: '/.well-known/appspecific/com.chrome.devtools.json',
        middleware: (_req, res) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(workspacePayload)
        },
      })

      return middlewares
    },
    client: {
      webSocketURL: 'auto://0.0.0.0:0/ws',
      overlay: {
        runtimeErrors: (error) => {
          if (error?.message === 'ResizeObserver loop completed with undelivered notifications.') return false;
          if (error?.message === 'ResizeObserver loop limit exceeded') return false;
          return true;
        },
      },
    },
    // Sur certains montages (Docker/VM/réseau monté), les événements FS natifs
    // ne remontent pas : le polling garantit la détection des changements.
    // Activez-le en lançant le serveur avec CHOKIDAR_USEPOLLING=true.
    ...(process.env.CHOKIDAR_USEPOLLING === 'true'
      ? { watchFiles: { paths: ['src/**/*'], options: { usePolling: true, interval: 300 } } }
      : {}),
  },

  pluginOptions: {
    vuetify: {
			// https://github.com/vuetifyjs/vuetify-loader/tree/next/packages/vuetify-loader
		}
  },

  // PWA : forcer le nouveau service worker à prendre le contrôle dès le
  // prochain chargement. Sans ceci, le SW reste en "waiting" et continue
  // de servir l'ancien bundle en cache après un déploiement Vercel — les
  // utilisateurs ne voyaient pas les nouveautés (ex : menu Réarmement).
  pwa: {
    workboxOptions: {
      skipWaiting: true,
      clientsClaim: true,
      // PERF : ne précacher QUE le shell applicatif. Avant, les ~82 fichiers du
      // build (46 JS + 27 CSS + 4 formats de police MDI ≈ 9 Mo) étaient tous
      // téléchargés en fond à CHAQUE déploiement (precacheAndRoute + skipWaiting)
      // → la majorité des ~189 requêtes constatées au chargement. Les chunks
      // lazy et polices passent en cache runtime (remplis à l'usage réel).
      exclude: [
        /\.map$/,
        // Police MDI : seul le .woff2 est réellement utilisé par les
        // navigateurs modernes ; .ttf/.eot/.woff ≈ 2,5 Mo précachés pour rien.
        /\.(?:eot|ttf|woff)$/,
        /\.mjs$/,
        // Chunks lazy (noms numériques webpack) : hors shell. On garde
        // app / chunk-vendors / vendor-vuetify (+ index.html, woff2, img).
        /^(?:js|css)\/(?!(?:app|chunk-vendors|vendor-vuetify)\.)/,
      ],
      runtimeCaching: [
        {
          // Chunks lazy : servis du cache puis revalidés (noms hashés →
          // jamais périmés ; un nouveau déploiement référence d'autres noms).
          urlPattern: /\/(?:js|css)\/[^/]+\.(?:js|css)$/,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'df-lazy-assets',
            expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 3600 },
          },
        },
        {
          urlPattern: /\/fonts\/[^/]+\.(?:woff2?|ttf|eot)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'df-fonts',
            expiration: { maxEntries: 12, maxAgeSeconds: 365 * 24 * 3600 },
          },
        },
      ],
    },
  },

  // Transformers.js : ne pas tenter de bundler les .wasm / workers,
  // les laisser charger à la volée depuis le CDN HuggingFace (default).
  configureWebpack: {
    resolve: {
      fallback: {
        fs: false,
        path: false,
        crypto: false,
      },
    },
    ignoreWarnings: [
      {
        module: /@huggingface\/transformers/,
        message: /Critical dependency: 'import\.meta' cannot be used as a standalone expression/,
      },
    ],
    // PERF: découpe les gros vendors (Vuetify, chart.js) dans des chunks dédiés
    // à cache long. Vuetify/chart.js changent rarement ; les isoler évite que le
    // hash du chunk vendor ne soit invalidé à chaque modif applicative (meilleur
    // taux de cache navigateur entre déploiements) et permet leur téléchargement
    // en parallèle. Le tree-shaking JS Vuetify est déjà actif (vuetify-loader).
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vuetify: {
            name: 'vendor-vuetify',
            test: /[\\/]node_modules[\\/]vuetify[\\/]/,
            priority: 30,
            reuseExistingChunk: true,
            enforce: true,
          },
          charts: {
            name: 'vendor-charts',
            test: /[\\/]node_modules[\\/](chart\.js|chartjs-[^\\/]+)[\\/]/,
            priority: 25,
            reuseExistingChunk: true,
            enforce: true,
          },
        },
      },
    },
  },
})
