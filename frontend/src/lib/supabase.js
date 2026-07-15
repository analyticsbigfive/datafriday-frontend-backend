// src/lib/supabase.js
// Client Supabase pour l'authentification

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://alsgdtewqeldrrquypdy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsc2dkdGV3cWVsZHJycXV5cGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMjMyMTQsImV4cCI6MjA3ODU5OTIxNH0.MB_NcLncWd3mSxUwlgf3piU29XAbgFEahgWtyAFqF-A'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})

// Dédup in-flight de supabase.auth.getSession() : plusieurs sites d'appel non
// coordonnés (intercepteur axios, auth/initialize, ensureAuthAndLoad) peuvent
// se déclencher en concurrence avant que la session ne soit hydratée (ex. les 4
// requêtes de la phase 1 d'Analyse parties en Promise.all) → chacun voyait
// accessToken===null et relançait indépendamment getSession(), doublant /me et
// le refresh de token. Une seule requête en vol est désormais partagée.
let _sessionPromise = null
export function getSessionOnce() {
  if (!_sessionPromise) {
    _sessionPromise = supabase.auth.getSession().finally(() => { _sessionPromise = null })
  }
  return _sessionPromise
}

export default supabase
