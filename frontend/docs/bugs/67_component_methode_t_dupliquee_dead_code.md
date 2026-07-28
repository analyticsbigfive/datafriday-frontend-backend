# BUG-067 — Méthode `t()` définie deux fois dans ComponentCreateView.vue (dead code)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`

## Symptôme

Aucun symptôme visible côté utilisateur — piège pour un futur lecteur/éditeur du fichier.

## Cause racine

L'objet `methods` du composant contenait deux entrées `t` : `t: translate` (raccourci direct vers la
fonction d'import) déclarée en tête de `methods`, puis `t(key) { return translate(key, this.locale);
}` déclarée plus bas dans le même objet littéral. En JavaScript, la seconde définition d'une même clé
dans un objet littéral écrase silencieusement la première — la première (`t: translate`) était donc
du code strictement mort, jamais exécuté, mais laissé dans le fichier au point de faire croire à un
comportement (utiliser `translate` directement, sans passer par `this.locale`) qui n'était en réalité
jamais actif.

## Correction

Retirée dans le cadre de la migration vers `useI18n()` ([[61_component_i18n_contourne_localstorage_manuel_et_textes_en_dur]]) :
les deux définitions de `t` ont disparu, remplacées par le `t` réactif retourné par `setup()`.

## Risque de régression / à surveiller

Aucun — les deux définitions étaient fonctionnellement équivalentes une fois `this.locale` fixé (la
première n'était de toute façon jamais appelée).

## Références

- [[61_component_i18n_contourne_localstorage_manuel_et_textes_en_dur]]
