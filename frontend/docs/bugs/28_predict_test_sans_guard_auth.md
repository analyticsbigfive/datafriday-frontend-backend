# BUG-028 — /predict-test monté sans aucun guard d'authentification

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟡 Moyenne (surface non authentifiée exposée, données mock)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `router/index.js:373-379` (avant correction)

## Symptôme

Accès direct à l'URL `/predict-test` en production sans authentification.

## Cause racine

La route était montée comme banc de test sans guard, y compris en production.

## Correction

La fiche laissait trois options ouvertes — guarder, désactiver en prod, ou assumer public. **Option
retenue : ne pas monter la route en production**, en conservant l'accès libre hors production.

```js
...(process.env.NODE_ENV === 'production' ? [] : [{ path: '/predict-test', ... }]),
```

Raisonnement : c'est un banc de test du moteur predict sur données mock. Poser un guard d'auth
dessus lui ferait perdre son intérêt (pouvoir exercer le moteur sans compte), alors que sa présence
en production n'apporte rien et ajoute une surface non authentifiée. Retirer la route du bundle de
production réconcilie les deux : l'outil reste pleinement utilisable là où il sert, et disparaît là
où il ne sert pas.

Le choix est cohérent avec le traitement de [[27_bypass_demo_actif_sans_distinction_env]], corrigé
dans la même PR : les deux relèvent de la même famille — des commodités de développement laissées
accessibles en production.

## Risque de régression / à surveiller

Le composant `views/PredictTestView.vue` reste référencé par un `import()` dynamique dans le code
source : webpack peut donc encore émettre son chunk au build de production. Ce n'est pas un
problème de sécurité — la route n'est pas déclarée, donc le chunk est inatteignable par navigation —
mais ne pas conclure de la présence du fichier dans `dist/` que le correctif n'a pas pris.

**À retester** : en développement, `/predict-test` doit continuer de répondre normalement. Après un
build de production, l'URL doit tomber sur la route de repli (404 / redirection home).

Si le banc de test devait un jour être exposé à un client en production, ne pas simplement rétablir
la route : il faudrait alors trancher la question laissée ouverte à l'origine (guard d'auth, ou
publication assumée).

## Références

- [`../modules/08_AUTH_ONBOARDING.md`](../modules/08_AUTH_ONBOARDING.md) §"Récapitulatif — bugs
  actifs confirmés" #5
- [`../MODULE_AUTHENTIFICATION.md`](../MODULE_AUTHENTIFICATION.md)
- [[27_bypass_demo_actif_sans_distinction_env]] — corrigé dans la même PR
