# BUG-366-02 — "Démapper" détachait l'event du SPACE au lieu de déliér uniquement le lien Weezevent/Digifood

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (l'event disparaissait de la liste du space, aucun moyen de le
  retrouver pour le re-mapper — perte d'usage, pas de perte de données)
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en testant le bouton "Démapper" (introduit pour
  BUG-365-02, cas PFC/SFP) : "ça doit pas être détaché de l'espace. C'est un événement de
  l'espace ; alors pourquoi ça détache de l'espace ? [...] on ne retrouve plus l'event dans la
  liste si on veut remmapper"
- **Fichiers** : `backend/src/features/events/events.service.ts:601-639`
  (`resolveWeezeventLink`) ; `frontend/src/components/integration/wizard/StepProcessTimeline.vue:1163-1187`
  (`handleUnmapEvent`)

## Symptôme

Le bouton "Démapper" par ligne (step 4) appelait `updateEvent(event.id, { spaceId: null })` —
détachait l'event du space ENTIER, pas seulement de son rattachement à la donnée Weezevent/
Digifood. Conséquence : l'event disparaissait de la liste (`loadTimeline` filtre les events CRUD
par `spaceId === current space`), impossible à retrouver pour le re-mapper à la bonne source sans
sortir du wizard.

## Cause racine

Confusion entre deux concepts distincts :
- **Le space de l'event** (où/pour quel espace ce match a lieu) — une propriété stable de
  l'event, pas un artefact de la Data Integration.
- **Le lien vers la donnée source** (`Event.weezeventEventId`, posé par BUG-021/BUG-331-02) — ce
  que le step 4 gère réellement (rattacher/dérattacher un match à son event Weezevent/Digifood).

`handleUnmapEvent` réutilisait par erreur le même endpoint que la fonctionnalité "détacher un
event du space" (`resolveEventSpaceFields`, prévue pour un usage différent — probablement un
copier-coller d'un autre flux), alors que le bouton "Démapper" du step 4 concerne exclusivement le
second concept.

## Correction

`handleUnmapEvent` appelle désormais `resolveWeezeventLink(event.id, null)` (endpoint déjà
existant, BUG-021) au lieu de `updateEvent(event.id, { spaceId: null })` — ne touche que
`weezeventEventId`, jamais `spaceId`. L'event reste dans la liste du space, juste avec un statut
"non lié".

`resolveWeezeventLink` (backend) purge en plus les agrégats périmés de l'ANCIEN rattachement —
`SpaceRevenueMinuteAgg` **et** `SpaceRevenueMinuteItemAgg` (la seconde n'était jamais purgée nulle
part avant ce fix, cf. constat fait en creusant le même bouton) — pour qu'un event délié n'affiche
plus de CA/data points obsolètes.

**Deux trous complémentaires trouvés en poussant le raisonnement à fond** (l'utilisateur a refusé
de laisser ces deux points en suspens — "on peut pas faire des choses à moitié") :

1. **Miroir `dfEventId` non synchronisé.** `SalesEvent.metadata.dfEventId` (miroir écrit par
   `bulkCreateEvents`, lu par `loadWeezeventEvents` pour réhydrater `weezEventMappings` côté
   front, BUG-331-02) n'était mis à jour QUE par `bulkCreateEvents` lui-même — jamais par
   `resolveWeezeventLink`. Après un Démapper, le vrai lien (`Event.weezeventEventId`) était bien
   cassé, mais le miroir continuait à pointer vers cet Event : même après un rechargement complet
   de la page, `weezEventMappings` montrait encore ce WeezeventEvent comme "déjà lié", le rendant
   **invisible pour toujours** pour "Créer et lier tout". Fix : `resolveWeezeventLink` synchronise
   désormais ce miroir lui-même (l'efface sur l'ancien lien s'il lui appartenait encore, le pose
   sur le nouveau) — pour n'importe quel appelant, pas seulement `bulkCreateEvents`.
2. **Doublon à la re-création.** Même une fois le miroir corrigé, la boucle de création de
   `bulkCreateEvents` appelait toujours `createEvent(...)` sans jamais vérifier qu'un Event de CET
   espace, non lié, existait déjà pour la même date — elle aurait créé un second Event fraîchement
   lié à côté de l'ancien (démappé, orphelin). Fix : avant de créer, recherche un event non lié de
   l'espace à la même date (`existingUnlinked`) et le relie (`resolveWeezeventLink`) au lieu d'en
   créer un nouveau. Nouveau compteur `relinkedCount`, distinct de `createdCount`, dans le message
   de fin ("X événement(s) démappé(s) reliés (pas de doublon créé)").

Tests ajoutés (`events.service.spec.ts`) : `spaceId` n'apparaît jamais dans le payload
`event.update` ; les deux tables d'agrégats sont purgées avec le bon scope ; le miroir `dfEventId`
est effacé sur l'ancien lien (seulement s'il appartenait encore à cet Event — ne vole pas le
miroir d'un autre Event qui aurait repris ce lien entretemps) et posé sur le nouveau. Suite
complète : 57/57 passent.

## Risque de régression / à surveiller

- Le dialog de résolution manuelle (`ResolveWeezeventLinkDialog`) qui aurait permis de choisir
  explicitement un `weezeventEventId` précis pour un event délié reste supprimé (BUG-361-02).
  Le flux de re-mapping repose maintenant entièrement sur la correspondance par DATE
  (`existingUnlinked`, ci-dessus) — correct pour "redonner à cet event son lien perdu à la même
  date", mais ne permet toujours pas de choisir manuellement un lien différent de celui suggéré
  par la date. Pas de cas d'usage identifié qui en aurait besoin à ce jour.
- La branche `spaceId === null` de `EventsService.update()` (nettoyage `SpaceRevenueMinuteAgg`
  historique) n'a pas été supprimée — plus aucun appelant frontend ne l'utilise après ce fix, mais
  laissée en place (API générique, un appelant futur pourrait légitimement vouloir détacher un
  event de son space).
- Pas testé en conditions réelles (pas de serveur de dev lancé pendant ce fix) — à valider :
  Démapper "SFP-Montauban", cliquer "Créer et lier tout", vérifier qu'un seul event
  "SFP-Montauban" existe au final (pas deux), correctement relié.

## Références

- [BUG-365-02](365_02_cron_safety_net_ignore_integration_contamination_ecriture.md) — a introduit
  le bouton "Démapper" testé ici (cas pratique PFC/SFP, Stade Jean Bouin).
- BUG-021 (`backend/docs/bugs/21_jointure_event_weezevent_par_date_seule.md`) — introduit
  `resolveWeezeventLink`, réutilisé ici pour son usage prévu d'origine.
