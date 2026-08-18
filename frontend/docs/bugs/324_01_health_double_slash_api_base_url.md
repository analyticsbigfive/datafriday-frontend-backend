# BUG-324-01 — `GET /api/v1//health` 404 : double slash quand `VUE_APP_API_URL` finit par « / »

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Technique (client API / warm-up backend)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-18
- **Fichiers** : `src/api/client.js:8` (base URL), `:33` (warmUpBackend), `:49` (isBackendAwake)

## Symptôme

Console au chargement : `datafriday-api.onrender.com/api/v1//health : Failed to load
resource: 404`. Le warm-up anti cold-start Render (ping `/health` au chargement du module)
et la sonde `isBackendAwake` (décision de retry après timeout) tombaient en 404 — le
backend n'était donc jamais réveillé en avance, et le retry post-timeout ne se déclenchait
jamais.

## Cause racine

`API_BASE_URL = process.env.VUE_APP_API_URL` utilisé brut dans les deux `fetch()`
(`${API_BASE_URL}/health`). La valeur d'environnement déployée finit par « / » →
`.../api/v1//health`. Seuls ces deux fetch bruts sont touchés : tous les autres appels
passent par Axios, dont `combineURLs` dédoublonne le slash.

## Correction

Branche `fix/analyse-page-load-perf` (2026-08-18) — `client.js:8` :

```js
const API_BASE_URL = (process.env.VUE_APP_API_URL || '').replace(/\/+$/, '')
```

## Risque de régression / à surveiller

Aucun attendu (Axios dédoublonnait déjà). Vérifier en réseau : plus de `//health`, réponse
200 sur `/health`.

## Références

- BUG-323-01 (même session de diagnostic perf Analyse)
