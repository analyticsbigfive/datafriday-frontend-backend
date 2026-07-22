# BUG-220 — Décalage de fuseau horaire (UTC vs local) lors de la création d'événement depuis une date non couverte

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue:1065-1098`
  (`handleCreateEventFromDate`), `:1100-1116` (`roundUpToQuarterHour`), contraste avec `:819-820`
  (commentaire de `formatDate` sur ce même risque)

## Symptôme

`baseEndDate` est dérivé via `toInputDate` (`String(d).slice(0,10)`), une troncature de date
**calendaire UTC** de la chaîne ISO renvoyée par le backend. Mais `roundUpToQuarterHour(rawLastTx)`
construit `new Date(rawLastTx)` et lit `.getHours()`/`.setDate()` dans le fuseau **local** du
navigateur pour décider de l'heure de fin arrondie et s'il faut basculer `addDay` au jour suivant.
Pour un utilisateur hors UTC, une dernière transaction juste avant minuit UTC (déjà après minuit
local, ou l'inverse) peut être classée dans le mauvais jour calendaire par rapport à `baseEndDate`
— la combinaison finale `eventEndDate`/`eventEndTime` ne borne alors silencieusement plus vraiment
la transaction à partir de laquelle elle a été calculée.

## Cause racine

Deux bases de fuseau horaire différentes (troncature de chaîne UTC vs objet `Date` local) utilisées
pour ce qui devrait être une seule notion cohérente de "à quel jour appartient ce timestamp", dans
la même chaîne de méthodes. Le fichier connaît déjà cette classe de bug (le commentaire dans
`formatDate`) mais n'a pas appliqué la même prudence ici.

## Correction

Unifié les deux calculs sur une base UTC exclusive, cohérente avec `toInputDate` :
- `roundUpToQuarterHour` utilise maintenant `setUTCHours`/`setUTCDate`/`getUTCHours`/
  `getUTCMinutes` au lieu des équivalents locaux (`setHours`/`setDate`/`getHours`/`getMinutes`)
  pour déterminer l'heure arrondie et si `addDay` doit basculer au jour calendaire suivant.
- `handleCreateEventFromDate` construit désormais `new Date(baseEndDate + 'T00:00:00Z')` (au lieu
  de `'T00:00:00'`, interprété en local) et incrémente via `setUTCDate` avant de re-tronquer via
  `toInputDate`/`toISOString`, pour l'incrément de jour calendaire quand `addDay` est vrai.

Les deux fonctions raisonnent maintenant en UTC de bout en bout ; plus de mélange UTC/local dans
la même chaîne de calcul.

## Risque de régression / à surveiller

Tester spécifiquement avec des utilisateurs dans des fuseaux horaires très décalés d'UTC (ex.
UTC+10, UTC-8) et des transactions proches de minuit UTC.

## Références

- Commentaire existant dans `formatDate` (même fichier, ligne 819-820) qui documente déjà ce piège
  pour un autre cas d'usage.
