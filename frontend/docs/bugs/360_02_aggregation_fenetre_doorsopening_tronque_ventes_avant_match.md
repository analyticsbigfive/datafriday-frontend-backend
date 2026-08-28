# BUG-360-02 — `resolveEventWindow` (mode doorsOpening±buffer) tronquait les ventes antérieures à l'ouverture des portes — remplacé par la journée calendaire locale

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (CA sous-évalué, silencieusement, sur tout event dont l'activité
  commerciale démarre significativement avant `doorsOpening` — ventes VIP/hospitalité/avant-match)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-08-24/25 — en creusant BUG-358-02 (step 4 vide pour Nantes-Rodez) : même
  après avoir débloqué le rattachement du conteneur Digifood, seul 17 183,25 € sur 61 091,81 € réels
  (28%) apparaissait, à cause de la fenêtre `doorsOpening ± buffer` ; règle de remplacement
  spécifiée par KOUAME Ulrich le 2026-08-25.
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts` (`resolveEventWindow`,
  anciennement lignes ~296-378)
- **Commit** : `fb2bb604` "fix(aggregation): remplace la fenêtre doorsOpening±buffer par la journée
  calendaire locale complète"

## Symptôme

Event "Nantes-Rodez" (22/08/2026, doors 19h00, `eventEndTime` 23h50) : les vraies ventes Digifood
démarrent à 13h58 heure de Paris (hospitalité/avant-match) et courent jusqu'à 17h00 — bien avant
l'ouverture officielle des portes. L'ancienne fenêtre (`doorsOpening − 120min` = 17h00, jusqu'à
`eventEndTime + 120min`) excluait donc toutes les ventes de 13h58 à 17h00 : seuls 1668 transactions
sur 4204 (17 183,25 € sur 61 091,81 € réels, 28%) auraient été agrégées — un CA plausible mais faux,
sans aucune alerte visuelle contrairement à un écran vide.

## Cause racine

`resolveEventWindow` (mode 2, introduit par BUG-329-02) ancrait la fenêtre sur l'heure d'ouverture
DÉCLARÉE (`sessions[0].doorsOpening`) ± un buffer fixe (`DEFAULT_OFFSET_OPEN_MINUTES = -120`,
`staffing-calculator.service.ts`), en supposant que l'activité commerciale ne débordait jamais de
plus de 2h avant l'ouverture officielle. Hypothèse fausse pour un stade avec restauration
matinale/hospitalité — écart réel observé de ~3h10 (13h58 → 17h00) sur ce cas concret, potentiellement
plus sur d'autres tenants.

## Correction

Remplacement complet des modes 2/3/4 de `resolveEventWindow` (`doorsOpening ± buffer`, scan large
+ MIN/MAX ± buffer, repli jour calendaire brut) par une règle métier unique, spécifiée par
l'utilisateur :

> Chaque jour capture toute sa journée calendaire locale par défaut (00h00 → minuit suivant, fuseau
> de l'espace) — y compris le premier jour, qui ne démarre jamais à l'heure d'ouverture déclarée.
> Seul le DERNIER jour d'un event multi-jours peut se terminer avant 23h59, si `eventEndTime` place
> la coupure sur le jour suivant (activité qui déborde sur la nuit, ex. fermeture du bar après un
> match du soir). Les jours intermédiaires (event 3+ jours), faute de coupure par jour dans le
> modèle actuel, restent des journées calendaires complètes par défaut — pas d'heuristique
> inventée.

Implémentation :
```
start = combineDayAndLocalTime(eventStartDate, '00:00', spaceTimezone)
end   = (multi-jours ET eventEndTime) ? combineDayAndLocalTime(eventEndDate, eventEndTime, tz)
                                       : startOfNextLocalDay(eventEndDate, tz)
```
Vérifié cohérent avec des events multi-jours réels en base ("SFP vs La Rochelle" :
`eventStartDate`/`eventEndDate` deux jours consécutifs, `eventEndTime` "02:00").

Le mode 1 (rattachement exact par `weezeventEventId`, hors conteneur de saison) est inchangé.
`sessions`/`doorsOpening` ne sont plus lus par `resolveEventWindow` — restent utilisés ailleurs
(staffing, affichage) sans changement.

## Risque de régression / à surveiller

- 3 tests obsolètes réécrits dans `aggregation.service.spec.ts` (doorsOpening±buffer, scan MIN/MAX,
  repli historique) ; 2 tests corrigés séparément car ils supposaient à tort que `$queryRaw` n'était
  jamais appelé quand un lien exact existe — faux depuis BUG-338-02
  (`resolveSeasonContainerEventIds` appelle `$queryRaw` une fois par run, indépendamment du mode).
  Suite complète : 56/56 passent après correction.
- Un test préexistant (`fix #8`, events multi-jours) asserait une borne haute calculée en
  arithmétique UTC brute (`d.getDate() === 13`) — devenu incorrect car la nouvelle borne est ancrée
  sur minuit LOCAL (Europe/Paris), qui ne coïncide pas avec minuit UTC. Corrigé pour comparer via
  `combineDayAndLocalTime`.
- Events 3+ jours à coupures distinctes par jour (pas juste la dernière) : non supportés par le
  modèle de données actuel (`Event.eventEndTime` est un champ unique, pas par jour) — limitation
  documentée, pas un bug caché.
- `executeProcessEvents` pas encore relancé en conditions réelles sur Nantes-Rodez au moment de ce
  commit — à confirmer que le CA affiché atteint bien les 61 091,81 € réels une fois combiné à
  BUG-358-02 et BUG-359-02.

## Références

- [BUG-329-02](329_02_aucune_heure_capturee_evenement_buffer_pre_ouverture.md) — introduisait le
  mode `doorsOpening ± buffer` que ce fix remplace.
- [BUG-328-02](328_02_aggregation_chevauchement_fenetres_events_double_comptage.md),
  [BUG-330-02](330_02_aggregation_utiliser_transaction_eventid_au_lieu_de_date_range.md),
  [BUG-338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) — protections
  anti-double-comptage inchangées par ce fix (mode exact + `eventLinkClause`).
- [BUG-358-02](358_02_digifood_conteneur_site_cold_start_non_detecte.md),
  [BUG-359-02](359_02_digifood_deconsigne_signe_ecrase_math_abs.md) — bugs distincts découverts dans
  la même investigation (step 4 vide pour Nantes-Rodez).
