# ADR-0001 — Adopter un dispatch hybride orchestré (HEOS)

- **Statut** : Accepté (implémentation partielle en cours)
- **Date** : 2026-01-20
- **Domaine** : Architecture technique (transverse)

## Contexte

DataFriday est un SaaS B2B multi-tenant avec des besoins hétérogènes : lectures simples (CRUD),
données à fort taux de lecture qui bénéficient d'un cache, analytics sur gros volumes, calculs
lourds ponctuels, jobs asynchrones (sync Weezevent, exports). Traiter tous ces cas de la même
façon (Prisma direct partout) ne scale pas ; partir directement sur des microservices Kubernetes
est jugé disproportionné en coût et complexité pour la taille actuelle du projet (comparatif
chiffré : HEOS ~$150/mois vs monolithe classique ~$100/mois mais moins scalable, full serverless
$200-400/mois, microservices K8s $500-1000/mois — voir `HEOS_ARCHITECTURE_GUIDE.md`).

Alternatives non retenues documentées dans le guide : monolithe classique (scalabilité
insuffisante), full serverless (coût et complexité plus élevés sans gain net), microservices K8s
(complexité disproportionnée pour la taille actuelle).

## Décision

Adopter un dispatch hybride orchestré par NestJS ("HEOS" — Hybrid Event-driven Orchestrated
System) : chaque requête est routée par l'orchestrateur central vers la couche adaptée —
Prisma direct pour le simple (< 50ms), Redis pour le cache (< 10ms), Materialized Views pour
l'analytics (< 50ms), Supabase Edge Functions pour les calculs lourds (< 500ms), BullMQ pour les
jobs longs (async).

## Conséquences

Complexité moyenne assumée (plusieurs couches à maintenir et à choisir consciemment) en échange
d'un meilleur rapport coût/scalabilité qu'un monolithe pur ou des microservices. Tout nouvel
endpoint doit être classé explicitement dans une de ces 5 couches plutôt que systématiquement fait
en Prisma direct par défaut. L'implémentation réelle est **partielle** à ce jour — voir
`architecture/AUDIT_IMPLEMENTATION_2026.md` pour ce qui est fait vs en attente, et
`architecture/AUDIT_BACKEND_SCALABILITY_2026.md` pour l'audit de mai 2026.

## Références

- `architecture/HEOS_ARCHITECTURE_GUIDE.md`
- `architecture/AUDIT_IMPLEMENTATION_2026.md`
- `architecture/AUDIT_BACKEND_SCALABILITY_2026.md`
