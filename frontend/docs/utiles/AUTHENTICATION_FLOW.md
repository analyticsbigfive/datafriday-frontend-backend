# Flux d'Authentification DataFriday

## Architecture

L'application utilise une architecture en 2 couches :
1. **Supabase** pour l'authentification (JWT tokens)
2. **DataFriday API** pour les données métier (utilisateurs, organisations, etc.)

## API Backend

- **Base URL**: `https://datafriday-api.onrender.com/api/v1`
- **Health Check**: `https://datafriday-api.onrender.com/api/v1/health`
- **Documentation**: `https://datafriday-api.onrender.com/docs`

## Flux de Connexion

### 1. Login avec Email/Password

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  LoginView  │────▶│   Supabase   │────▶│  Store (auth)   │────▶│ DataFriday   │
│             │     │   Auth API   │     │                 │     │     API      │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────────────┘
     │                     │                      │                      │
     │  signIn()          │                      │                      │
     ├────────────────────▶│                      │                      │
     │                     │                      │                      │
     │  JWT Token          │                      │                      │
     │◀────────────────────┤                      │                      │
     │                     │   SET_SESSION        │                      │
     │                     │   SET_USER           │                      │
     │                     ├─────────────────────▶│                      │
     │                     │                      │                      │
     │                     │                      │ GET /onboarding/status
     │                     │                      ├─────────────────────▶│
     │                     │                      │                      │
     │                     │                      │  User + Tenant       │
     │                     │                      │◀─────────────────────┤
     │                     │   SET_DB_USER        │                      │
     │                     │   SET_TENANT         │                      │
     │                     │◀─────────────────────┤                      │
     │                     │                      │                      │
     │  Redirect /dashboard ou /onboarding        │                      │
     │◀───────────────────────────────────────────┤                      │
```

### 2. Login avec Google OAuth

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  LoginView  │────▶│   Supabase   │────▶│  Google OAuth   │
│             │     │   Auth API   │     │                 │
└─────────────┘     └──────────────┘     └─────────────────┘
     │                     │                      │
     │  signInWithGoogle() │                      │
     ├────────────────────▶│                      │
     │                     │  Redirect to Google  │
     │                     ├─────────────────────▶│
     │                     │                      │
     │                     │  User confirms       │
     │                     │◀─────────────────────┤
     │  Redirect /auth/callback avec token        │
     │◀───────────────────────────────────────────┤
```

## Logs Console - Ce que tu verras

### Au démarrage de l'app
```
🚀 [AUTH] Initialisation de l'authentification...
⚠️ [AUTH] Aucune session active
✅ [AUTH] Initialisation terminée
```

### Lors d'une connexion réussie
```
📝 [LOGIN] Soumission du formulaire
🔐 [AUTH] Tentative de connexion pour: user@example.com
✅ [AUTH] Connexion Supabase réussie pour: user@example.com
🔍 [AUTH] Vérification du profil dans la base DataFriday...
🌐 [API] GET https://datafriday-api.onrender.com/api/v1/onboarding/status
✅ [API] Réponse 200 de /onboarding/status
✅ [AUTH] Utilisateur trouvé dans DataFriday avec organisation
✅ [LOGIN] Connexion réussie, redirection...
```

### Si l'utilisateur n'existe pas dans DataFriday
```
🔐 [AUTH] Tentative de connexion pour: newuser@example.com
✅ [AUTH] Connexion Supabase réussie pour: newuser@example.com
🔍 [AUTH] Vérification du profil dans la base DataFriday...
🌐 [API] GET https://datafriday-api.onrender.com/api/v1/onboarding/status
❌ [API] Erreur 404 sur /onboarding/status
⚠️ [ONBOARDING] Utilisateur non trouvé dans DataFriday
```

### En cas d'erreur de connexion
```
📝 [LOGIN] Soumission du formulaire
🔐 [AUTH] Tentative de connexion pour: user@example.com
❌ [AUTH] Erreur Supabase: Invalid login credentials
❌ [AUTH] Échec de connexion: Email ou mot de passe incorrect
❌ [LOGIN] Erreur de connexion: Email ou mot de passe incorrect
```

## Messages d'Erreur (Traduits en Français)

| Erreur Supabase | Message en Français |
|-----------------|---------------------|
| `Invalid login credentials` | Email ou mot de passe incorrect |
| `Email not confirmed` | Veuillez confirmer votre email avant de vous connecter |
| `User not found` | Aucun compte trouvé avec cet email |
| `already registered` | Cet email est déjà utilisé |
| `password` (validation) | Le mot de passe doit contenir au moins 6 caractères |
| `invalid email` | Format d'email invalide |

## Après une Connexion Réussie

1. **JWT Token** stocké dans le state Vuex (`auth/session`)
2. **User Supabase** stocké dans `auth/user`
3. **Appel API** à `/onboarding/status` avec le token JWT dans le header `Authorization: Bearer <token>`
4. **Réponse API**:
   - Si l'utilisateur existe: `{ exists: true, hasOrganization: true/false, user: {...}, tenant: {...} }`
   - Si l'utilisateur n'existe pas: `404` → onboarding requis
5. **Redirection**:
   - Si `hasOrganization === true` → `/dashboard`
   - Si `hasOrganization === false` → `/onboarding`

## Intercepteurs API (Automatiques)

### Request Interceptor
- Ajoute automatiquement `Authorization: Bearer <token>` à toutes les requêtes
- Log: `🌐 [API] GET/POST/PUT/DELETE <url>`

### Response Interceptor
- Log des réponses: `✅ [API] Réponse 200 de <url>`
- Log des erreurs: `❌ [API] Erreur 401 sur <url>`
- Si erreur 401 → déconnexion automatique + redirection vers `/login`

## Fichiers Clés

- `src/store/modules/auth.js` - Gestion de l'authentification
- `src/lib/api.js` - Client API avec intercepteurs
- `src/lib/supabase.js` - Client Supabase
- `src/views/LoginView.vue` - Page de connexion
- `src/router/index.js` - Navigation guards

## Test de l'API

```bash
# Test de santé
curl https://datafriday-api.onrender.com/api/v1/health

# Test avec token
curl -H "Authorization: Bearer <JWT_TOKEN>" \
     https://datafriday-api.onrender.com/api/v1/onboarding/status
```
