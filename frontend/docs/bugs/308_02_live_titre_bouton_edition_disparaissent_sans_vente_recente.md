# BUG-308-02 — Live : titre/bouton d'édition disparaissaient dès qu'aucune vente depuis 30 min

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Live events
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-05 (signalé par l'utilisateur : « pourquoi tu me remets Analyse alors que je suis sur la page live », bouton d'édition introuvable)
- **Fichiers** : `src/components/analyse/AnalyseView.vue` (`applyLiveScope`, nouveau `findTodayEventId`)

## Symptôme

Le titre du bandeau retombait sur le générique "Analyse" (au lieu du nom de l'event) et le bouton
d'édition de l'event (ajouté le même jour, cf. BUG-306-02/§18) disparaissait dès que la dernière
vente réelle datait de plus de 30 minutes — alors qu'un event pour AUJOURD'HUI existait bel et bien
pour cet espace (vérifié en base : "[Simulé] 6 A — 2026-08-05", dernière vente 73 min avant le
constat).

## Cause racine

`applyLiveScope()` liait TOUT (badge, titre via `selectedEventIds`, bouton d'édition) au même signal
strict `getLiveStatus()` (vente réelle dans les 30 dernières minutes). Sans vente récente,
`selectedEventIds` était vidé (`else` branch), donc `filteredEvents`/`singleSelectedEventLabel`
n'avaient plus rien à nommer — titre générique, et le bouton d'édition (alors gardé par le même
`liveEventDetected`) disparaissait aussi, alors que l'event du jour reste éditable et pertinent
même pendant un creux de ventes.

## Correction

Nouveau repli dans `applyLiveScope()` : si `getLiveStatus()` ne renvoie pas d'`eventId` (pas de vente
< 30 min), recherche d'un event dont la fenêtre `[eventStartDate, eventEndDate]` (repli sur
`date`/`eventDate` seul) couvre AUJOURD'HUI pour cet espace (`findTodayEventId()`, lecture pure sur
`state.events` déjà à jour — aucun appel réseau supplémentaire). Cet event sert d'ancre pour
`selectedEventIds` (donc pour le titre) même sans vente récente. Le badge ● LIVE (pulse), lui, reste
strictement gardé par `liveEventDetected` (vente < 30 min) — seul le bouton d'édition et le titre
utilisent la nouvelle ancre plus large (`liveEventId`).

## Risque de régression / à surveiller

Bien distinguer les deux signaux dans tout futur ajout à l'écran Live : `liveEventDetected` (pulse
strict, badge uniquement) vs `liveEventId` (ancre stable, event du jour, tout le reste). Pas de test
dédié ajouté (fonction simple sur des données déjà couvertes par les tests `state.events`
existants) — à ajouter si cette logique se complexifie.

## Références

- `docs/modules/11_LIVE.md` §18.
- BUG-306-02 (badge, même famille de correctifs le même jour).
