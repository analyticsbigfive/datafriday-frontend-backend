// API functions for the Analyse module
// Endpoints documented in openapi.json (tag « Analyse »):
//   GET /analyse/dashboard
//   GET /analyse/kpis/menu
//   GET /analyse/kpis/events
//   GET /analyse/cost-breakdown
//
// All wrappers go through `apiOrMock` so that network errors, timeouts, 404s
// or 5xx are transparently replaced by the API-shaped mock payload.
import { api } from '../client'
import { apiOrMock } from '../apiOrMock'
// PERF: imports mock retirés. `apiOrMock` ignore le mockFactory (fallback démo
// supprimé) ; ces imports statiques tiraient `analyseApiMock` → `adidasArenaMock`
// (39KB) dans le chunk eager via store/modules/analyse.js. Chaîne cassée.

function buildQuery(params) {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((it) => usp.append(k, it))
    else usp.append(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}

export function getAnalyseDashboard(params = {}) {
  const qs = buildQuery(params)
  return apiOrMock(
    () => api.get(`/analyse/dashboard${qs}`),
    { label: 'analyse/dashboard' },
  )
}

export function getAnalyseKpisMenu(params = {}) {
  const qs = buildQuery(params)
  return apiOrMock(
    () => api.get(`/analyse/kpis/menu${qs}`),
    { label: 'analyse/kpis/menu' },
  )
}

export function getAnalyseKpisEvents(params = {}) {
  const qs = buildQuery(params)
  return apiOrMock(
    () => api.get(`/analyse/kpis/events${qs}`),
    { label: 'analyse/kpis/events' },
  )
}

export function getAnalyseCostBreakdown(params = {}) {
  const qs = buildQuery(params)
  return apiOrMock(
    () => api.get(`/analyse/cost-breakdown${qs}`),
    { label: 'analyse/cost-breakdown' },
  )
}
