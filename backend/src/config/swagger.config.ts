import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Config OpenAPI partagée entre le bootstrap (src/main.ts) et l'export statique
 * de la spec (scripts/export-openapi.mjs → docs/api/openapi.json).
 * Tout ajout de tag doit rester aligné sur les @ApiTags des contrôleurs
 * (et sur les SECTIONS de scripts/generate-api-reference.mjs).
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('DataFriday API')
    .setDescription(`
## API Multi-tenant pour la gestion d'événements et l'intégration Weezevent

> 📖 **Documentation interactive** : [\`${process.env.API_BASE_URL || 'http://localhost:3000'}/docs\`](${process.env.API_BASE_URL || 'http://localhost:3000'}/docs)

### 🔐 Authentification
L'API utilise **Supabase Auth** pour l'authentification. Après connexion via Supabase, incluez le JWT token dans le header:
\`\`\`
Authorization: Bearer <votre_token_jwt>
\`\`\`

### 🏢 Multi-tenant
Chaque utilisateur appartient à une organisation (tenant). Le tenant est automatiquement déterminé à partir du token JWT.

### 📋 Endpoints publics (sans auth)
- \`GET /api/v1/health\` - Status de l'API
- \`POST /api/v1/webhooks/weezevent/:tenantId/:integrationId\` - Réception des webhooks Weezevent
- \`GET /api/v1/openapi.json\` - Spécification OpenAPI brute (tooling front / CI)

### 🔑 Onboarding (auth Supabase requise, pas de tenant)
- \`GET /api/v1/onboarding/status\` - Vérifier si l'utilisateur existe en DB
- \`POST /api/v1/onboarding\` - Créer une organisation
- \`POST /api/v1/onboarding/join-by-code\` - Rejoindre via code d'invitation

### 🛡️ Endpoints protégés (auth + tenant requis)
Tous les autres endpoints nécessitent un utilisateur lié à un tenant.
Le RBAC est dynamique : 7 rôles métier (ADMIN + 6 rôles écran), permissions par écran
servies par \`/roles\` et \`/permissions\`.

### 🗂️ Modules disponibles
| Module | Description |
|---|---|
| Users / Roles / Permissions | Gestion des utilisateurs, invitations, RBAC dynamique |
| Me | Profil de l'utilisateur courant (+ téléphone, tenant) |
| Organizations / Tenants | Organisation courante et administration des tenants |
| Spaces | Espaces/établissements, configurations, éléments (shops), accès |
| Builder v2 | Builder 3D v2 : zones, éléments, adhésions par configuration (verrou optimiste If-Match) |
| Space Menus | Menus assignés aux shops, disponibilité serveur, inventaire dérivé + storage |
| Space Dashboard | Dashboard agrégé et santé des agrégations par espace |
| Inventory / Restock State | Snapshots d'inventaire (append-only), comptages, état de réarmement |
| Events | Référentiel des événements, types/catégories/sous-catégories, équipes (Teams) |
| Event Predict Versions | Versions de prédiction par événement (défaut exclusif) |
| Market Prices | Prix de marché + taxonomie dédiée (Market Price Types/Categories) |
| Menu Items | Articles de menu : recettes, prix par espace (TTC/HT/TVA), historique des prix |
| Product Types / Categories | Taxonomie des menu items |
| Brands / Display Names | Référentiels marques et noms d'affichage |
| Menu Components | Sous-assemblages de recettes |
| Ingredients / Packaging / Suppliers | Ingrédients, emballages, fournisseurs |
| Mappings | Intégration Weezevent : mapping locations/shops/merchants/produits + progression |
| Aggregation | Traitement et synchronisation des données événements |
| Analyse | KPIs et tableaux de bord analytiques |
| Integrations | Connecteurs (Weezevent multi-instance, Webhooks) |
| Weezevent | Données Weezevent synchronisées : transactions, produits, jobs de sync |
| Weezevent Analytics | Analyse des ventes Weezevent |
| KV | Stockage clé/valeur léger (préférences front) |
| Orchestrator | Stratégies de traitement et cache |
    `)
    .setVersion('1.0')
    .addServer(
      process.env.API_BASE_URL || 'http://localhost:3000',
      process.env.API_BASE_URL ? 'Production' : 'Local',
    )
    .addServer('http://localhost:3000', 'Local (dev)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT Supabase',
      },
      'supabase-jwt',
    )
    .addTag('Health', 'Vérification du status de l\'API et métriques (/metrics)')
    .addTag('Onboarding', 'Création de compte et organisation')
    .addTag('Tenants', 'Gestion des organisations (admin)')
    .addTag('Users', 'Gestion des utilisateurs : invitations, réinvitation, statut de connexion, accès espaces')
    .addTag('Roles', 'Rôles métier (RBAC dynamique)')
    .addTag('Permissions', 'Catalogue des permissions par écran')
    .addTag('Me', 'Profil utilisateur courant')
    .addTag('Organizations', 'Gestion de l\'organisation courante')
    .addTag('Spaces', 'Gestion des espaces/établissements et de leurs éléments (shops)')
    .addTag('Configurations', 'Configurations d\'espace (legacy v1 : floors JSON + éléments)')
    .addTag('Builder v2', 'Builder 3D v2 : zones, éléments, adhésions par configuration (verrou optimiste If-Match)')
    .addTag('Pinned Spaces', 'Espaces favoris de l\'utilisateur courant')
    .addTag('Space Dashboard', 'Dashboard et analytics par espace')
    .addTag('Space Menus', 'Menus assignés aux shops, disponibilité calculée serveur, inventaire dérivé + storage')
    .addTag('Inventory', 'Snapshots d\'inventaire (append-only) et comptages unitaires')
    .addTag('Restock State', 'État de réarmement par espace (upsert JSON)')
    .addTag('Events', 'Gestion des événements (tickets, équipes, scores)')
    .addTag('Event Types', 'Référentiel des types d\'événements')
    .addTag('Event Categories', 'Référentiel des catégories d\'événements')
    .addTag('Event Subcategories', 'Référentiel des sous-catégories d\'événements')
    .addTag('Teams', 'Référentiel des équipes sportives (scopées tenant)')
    .addTag('Event Predict Versions', 'Versions de prédiction par événement (défaut exclusif)')
    .addTag('Market Prices', 'Référentiel des prix marché par tenant')
    .addTag('Market Price Types', 'Taxonomie dédiée des Market Prices — types')
    .addTag('Market Price Categories', 'Taxonomie dédiée des Market Prices — catégories')
    .addTag('Menu Items', 'Articles de menu : recettes, prix par espace (TTC/HT/TVA), historique des prix')
    .addTag('Brands', 'Référentiel des marques (brands) des articles de menu')
    .addTag('Display Names', 'Référentiel des noms d\'affichage des articles de menu')
    .addTag('Product Types', 'Types de produits (Food, Beverages, etc.)')
    .addTag('Product Categories', 'Catégories de produits')
    .addTag('Menu Components', 'Sous-assemblages de recettes')
    .addTag('Ingredients', 'Ingrédients avec coûts et unités')
    .addTag('Packaging', 'Emballages avec coûts unitaires et marketPrice')
    .addTag('Suppliers', 'Gestion des fournisseurs (sites = espaces desservis)')
    .addTag('Mappings', 'Intégration Weezevent — mapping locations/shops/merchants/produits + progression')
    .addTag('Aggregation', 'Traitement et synchronisation des données événements Weezevent')
    .addTag('Analyse', 'KPIs et tableaux de bord analytiques')
    .addTag('Integrations', 'Configuration des connecteurs (Weezevent multi-instance, Webhooks)')
    .addTag('Weezevent', 'Données Weezevent synchronisées : transactions, produits, jobs de sync par bissection')
    .addTag('Weezevent Analytics', 'Analyse des ventes par produit, merchant et période')
    .addTag('Weezevent Webhooks', 'Réception des webhooks Weezevent (endpoint public signé)')
    .addTag('KV', 'Stockage clé/valeur léger (préférences front)')
    .addTag('Orchestrator', 'Stratégies de traitement et invalidation du cache')
    .build();
}
