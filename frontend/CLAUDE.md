# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before touching code 

Read in this order — each links to the next:

1. [`docs/CARTOGRAPHIE_MODULES.md`](docs/CARTOGRAPHIE_MODULES.md) — entry point, project overview.
2. [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) — how the code is organized
   technically (folders, naming, Vuex pattern, API layer, routing, i18n, dead zones). Condensed
   below in "Architecture", but the full file has the detail and the reasoning.
3. [`docs/modules/00_INDEX.md`](docs/modules/00_INDEX.md) — one page per business domain, rules
   verified against the real code, active bugs, dead code.
4. [`docs/bugs/00_INDEX.md`](docs/bugs/00_INDEX.md) — a bug may already be diagnosed. Some are
   "documented, not fixed by choice" — do not fix those without explicit validation.
5. [`docs/adr/00_INDEX.md`](docs/adr/00_INDEX.md) — an existing architecture may already be a
   deliberate decision.
6. If a business rule stays ambiguous after that: don't decide alone. Log the question in
   [`docs/QUESTIONS_A_BERTRAND.md`](docs/QUESTIONS_A_BERTRAND.md) rather than guessing — divergent
   interpretations of the same rule are the most frequent source of bugs in this project.

Full contributor workflow (bug fixing, feature checklist, git workflow, deployment gotchas):
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Hard rules for this session

- **Never run `pnpm build`** (or any build) yourself, including "just to check for compile
  errors" — the user builds and reports errors back. Re-read the edited file if syntax is in
  doubt instead.
- **Never start, kill, or restart the user's dev server.** It runs in their terminal with their
  logs visible; a detached process squatting the port blocks them and hides their logs. If a
  restart is needed to test something, ask them to do it. When they say "stop", stop everything
  immediately.
- **Never commit** unless the current message explicitly asks for it — a prior commit is not
  standing permission. Never add a `Co-Authored-By` trailer.
- `src/` is the only source of truth ([ADR-0001](docs/adr/0001_vue_source_de_verite_unique.md)).
  `versionReact/` and `api-datafriday-main/` (repo root) are archived prototypes — never read them
  to understand current behavior, never build on them.

## Commands

```bash
pnpm install          # install deps

pnpm dev               # dev server (vue-cli-service serve) — do not run yourself, see above
pnpm build             # production build — do not run yourself, see above

pnpm test:unit                                   # run all unit tests (Jest)
pnpm test:unit -- tests/unit/asyncPool.spec.js    # single test file
pnpm test:unit -- -t "some test name"             # single test by name

pnpm test:e2e          # Cypress e2e tests (tests/e2e/specs)
```

There is no lint script configured in `package.json`.

## Architecture

Stack: Vue 3 (mostly Options API, `<script setup>` accepted), Vuetify 3, Vuex 4, Vue Router 4,
Axios, an in-house i18n (not `vue-i18n`), Vue CLI (not Vite).

Data flow, one direction, never skipped:

```
.vue component → composable (use*.js) → Vuex store module → api/endpoints/*.api.js → api/client.js (Axios) → backend
```

- **`src/views/`** — older, core routed pages (auth, dashboard, `Space*View`).
- **`src/components/<domain>/`** — everything else, organized by business domain, each with
  `views/` (routed CRUD pages), `dialogs/` (modals), `drawers/` (side panels), flat display
  components. Nested domains (e.g. `menu-fb`) repeat this same `views/dialogs/drawers` shape one
  level deeper.
- **`src/components/common/`** — cross-domain components.
- **Vuex (`src/store/modules/*.js`)**, 34 namespaced modules: standard pattern (28/34) is
  `state: { list, cachedAt, fetching }`, getter `isCacheValid` (15 min TTL), actions
  `fetchList({ force })` / `invalidate` — copy this template for any new module. Strict
  mutations(sync)/actions(async) separation. Consume via `useStore()` (Composition API); only the
  legacy `auth` module still uses `mapGetters`/`mapActions` — don't reproduce that. Full detail and
  debt inventory: [`docs/AUDIT_VUEX_STORE.md`](docs/AUDIT_VUEX_STORE.md).
- **`src/api/`** — single Axios instance in `client.js` (never instantiate a second one), one file
  per domain in `api/endpoints/<domain>.api.js` (`getX`/`createX`/`updateX`, try/catch/rethrow, no
  silent swallow). `src/utils/api.js` is a 45KB legacy monolith used only by Restock — don't add to
  it.
- **`src/router/`** — every view is lazy-imported (`() => import(...)`); a static import breaks
  code-splitting. Access guards live in `router/guards.js` (`requireAuth`, `requireOrganization`,
  `guestOnly`, `spaceEntryGuard`, `onboardingGuard`) — no inline access checks in page components.
- **`src/i18n/`** — in-house (`translations.js` + `useI18n()` composable), no hardcoded
  user-facing text in templates.
- **Dead zones — do not build on these**: `src/ui/` (94 shadcn-like components ported from a
  React/Figma Make prototype, one legitimate consumer only), `src/figma/`, `src/hooks/`,
  `src/types/` (same prototype, unwired), `versionReact/` and `api-datafriday-main/` at repo root.

Typography follows a closed scale (1 UI font + 1 monospace font, 7 sizes, 4 weights) —
[`docs/CHARTE_GRAPHIQUE.md`](docs/CHARTE_GRAPHIQUE.md) ([ADR-0003](docs/adr/0003_charte_graphique_typographie.md)).
Any new `font-size`/`font-weight`/`font-family` must conform.

## Git workflow

Personal branches (`feat/...`, `fix/...`), never push directly to `develop` or `staging`. Open a
PR against `staging` (current work base) — only the lead merges into `staging`/`develop`. Pushing
to `develop` currently triggers an unreviewed production Cloudflare deploy — treat it as
protected, not as a safe staging environment. Details:
[`CONTRIBUTING.md`](CONTRIBUTING.md#workflow-git).
