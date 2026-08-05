# Pages module — source de vérité par domaine

> Établi le 2026-07-15, en plusieurs passes le même jour. Ce dossier complète
> [`../CARTOGRAPHIE_MODULES.md`](../CARTOGRAPHIE_MODULES.md) (l'index/carte d'ensemble front+back)
> avec une page **détaillée et vérifiée contre le code réel** par domaine métier : modèles Prisma,
> routes, pièges architecturaux, bugs actifs confirmés (avec citations `fichier:ligne`), code mort,
> zones grises. **Pour les devs comme pour les agents IA** : lire la cartographie d'abord pour la
> vue d'ensemble, puis la page du domaine concerné avant de toucher au code.
>
> ⚠️ Ce dossier **remplace** un brouillon plus ancien et plus court qui vivait dans
> `docs/utiles/modules/` (même date, passe moins approfondie, ne couvrait pas Auth/RBAC/Technique)
> — supprimé le 2026-07-15 une fois vérifié qu'il n'apportait rien que ces pages ne couvrent déjà en
> plus détaillé.

## Méthode

Chaque page cite le code réel ligne par ligne (`fichier.ts:NNN`) plutôt que de décrire de mémoire.
L'archéologie complète (confrontation des tout premiers prototypes — Supabase KV 2024, React/Figma
Make 2025 — avec le code actuel) est dans [`../utiles/prototypes/`](../utiles/prototypes/00_INDEX_ET_SYNTHESE.md)
pour qui veut comprendre le "pourquoi historique" ; ces pages-ci n'ont besoin d'aucune lecture
préalable pour travailler sur le code.

## Pages

| Page | Domaine cartographie | Owner | Bugs actifs confirmés |
|---|---|---|---|
| [01_EVENT_PREDICT_ALGORITHME.md](01_EVENT_PREDICT_ALGORITHME.md) | Prévision (Event Predict) | Jean-Luc | 8 |
| [02_ANALYSE.md](02_ANALYSE.md) | Analyse & agrégation | Jean-Luc | 10 |
| [03_BUILDER_ESPACES.md](03_BUILDER_ESPACES.md) | Espaces & builder | Ulrich | 6 |
| [04_MENU_CATALOGUE.md](04_MENU_CATALOGUE.md) | Menu & recettes + Achats & référentiels | Ulrich | 5 |
| [05_INTEGRATIONS_VENTES.md](05_INTEGRATIONS_VENTES.md) | Intégrations & ventes | Ulrich | 6 |
| [06_STOCK_INVENTAIRE.md](06_STOCK_INVENTAIRE.md) | Stock | Jean-Luc / Ulrich | 7 |
| [07_EVENEMENTS.md](07_EVENEMENTS.md) | Événements | Ulrich | 5 |
| [08_AUTH_ONBOARDING.md](08_AUTH_ONBOARDING.md) | Auth & onboarding, RBAC | Emmanuel | 8 |
| [09_TECHNIQUE.md](09_TECHNIQUE.md) | Technique (Orchestrator/Health/Audit/Webhooks) | — | 6 |
| [11_LIVE.md](11_LIVE.md) 🟢 | Live events — front (A→E) + backend (v1+v2) livrés, mergés `develop` ; reste déploiement Render + question #34 (◉ Home) | Ulrich (fullstack) | 234 |

> 🟢 **Live** : `11_LIVE.md` était une conception ; le module est désormais **livré** (front A→E +
> backend v1+v2, mergés `develop`). Elle passera au format « cartographie vérifiée » une fois le
> backend **déployé sur Render** (les endpoints Live renvoient 404 tant que ce n'est pas fait).
| [10_POST_EVENT_INVENTORY.md](10_POST_EVENT_INVENTORY.md) | Stock — écrans Pre-event + Post-event Inventory, cycle de réconciliation et ponts inter-modules (page feature, complète 06 sans le dupliquer) ; § 9 vérification logique vs spec métier + § 10 exemple live Auxerre (2026-07-20) | Jean-Luc | — |
| [11_RH_STAFFING.md](11_RH_STAFFING.md) | RH / Staffing — étape 1 : écrans Suppliers/Positions branchés sur `/hr` (localStorage, sans BDD) ; cible complète (spec pptx + règles xlsx, algo à revalider Bertrand #28) conservée en § 6 (2026-07-21) | Jean-Luc | 3 (201-203) |
| [12_RAPPORT_J1.md](12_RAPPORT_J1.md) | Rapport J+1 — PDF post-événement (bouton bandeau rouge Analyse) : réel vs prédictif, Food/Beverage/Beer, top 5, météo facultative (2026-08-04, questions #42-#44/#46) | Jean-Luc | — |
| [13_RAPPORT_SAISON.md](13_RAPPORT_SAISON.md) | Rapport Saison — périodes personnalisées (Settings > Configuration > Saisons) reprises comme presets de dates Analyse/Predict ; SQL #12 à appliquer avant déploiement (2026-08-04, question #45) | Jean-Luc | — |

**~61 bugs/gaps actifs confirmés au total**, chacun avec sa citation `fichier:ligne` — voir la
section "Bugs actifs confirmés" de chaque page. **Ce n'est volontairement pas dupliqué ici** (la
liste serait déjà obsolète à la prochaine vérification) : cette page ne fait que pointer vers la
source vivante.

✅ **[`docs/bugs/`](../bugs/00_INDEX.md)** (et son pendant
[`api-datafriday-staging/docs/bugs/`](../../../api-datafriday-staging/docs/bugs/00_INDEX.md))
portent désormais chacun de ces bugs en fiche individuelle avec statut de correction — utiliser
`docs/bugs/` comme tracker de correction (qui corrige, quand, quel risque de régression), et
revenir ici pour le détail technique complet (citations `fichier:ligne`, repro, contexte du
piège).

## Comment garder ces pages vivantes

Ce ne sont pas des photographies figées. Dès qu'une ambiguïté est levée (via
[`../QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md)) ou qu'un bug listé ici est corrigé, la
page du domaine concerné doit être mise à jour dans la même PR — sinon elle redevient un piège plus
trompeur qu'une absence de doc.
