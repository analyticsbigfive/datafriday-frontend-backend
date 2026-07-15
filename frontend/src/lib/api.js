// src/lib/api.js
// DEPRECATED entrypoint — kept only for backward compatibility.
//
// The app now has a single Axios client (src/api/client.js) with one token
// source (setAccessToken) and one 401 policy (refresh-then-retry, else redirect).
// This file used to declare a second client with a divergent 401 handler, which
// caused inconsistent behavior depending on the import path. It now re-exports
// the canonical client so existing `@/lib/api` imports keep working.
//
// Prefer importing from '@/api/client' directly in new code.
export { default } from '@/api/client'
export * from '@/api/client'
