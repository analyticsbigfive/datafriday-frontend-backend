# Capture réseau des pages lentes (mode d'emploi, version 2)

But : savoir ce que l'utilisateur attend vraiment sur Analyse, Commandes et Event Predict. Le cache Redis masque des appels lents du côté base ; seule la capture du navigateur le dit.

À faire sur la version de recette ou de production, connecté, avec Chrome. Aucun serveur de dev à lancer par l'assistant.

## Pourquoi une version 2

La version 1 lisait tout le journal de mesures du navigateur. Ce journal garde les appels de toutes les pages visitées depuis l'ouverture de l'onglet et plafonne à 250 entrées : trois captures successives ont donné trois fois le même tableau (214 appels, dont des flux `/live/stream` ouverts pendant des heures). La version 2 vide le journal avant de naviguer, ne garde que les appels lancés après ce repère, retire les flux `/live/stream` et affiche les temps relatifs au premier appel.

## Ce que la capture ne contient pas de secret

Ne pas exporter de fichier HAR : il contient les jetons d'authentification et les cookies. Utiliser les scripts ci-dessous, qui ne sortent que des chemins d'API, des durées et des tailles.

## Procédure (une page à la fois, un onglet dédié)

Pour chaque page : Analyse, Commandes (liste), Event Predict, puis Inventaire si possible.

1. Ouvrir un onglet normal, connecté, sur une page quelconque de l'application (pas la page à mesurer). Ouvrir DevTools (F12), onglet Console. Au premier collage, Chrome demande de taper `allow pasting` puis Entrée.
2. **Avant de naviguer** : coller le script 1 ci-dessous (repère), Entrée.
3. Aller sur la page à mesurer **par le menu de l'application, sans recharger** (un rechargement complet, F5, remet le journal à zéro et le script 1 est alors à relancer juste après l'arrivée sur la page, ce qui fait perdre les premiers appels : préférer le clic dans le menu). Pour une capture à froid du cache navigateur, cocher « Disable cache » dans l'onglet Network avant l'étape 2.
4. Attendre que le dernier indicateur de chargement disparaisse, puis coller le script 2, Entrée. Il affiche une synthèse, un tableau de tous les appels dans l'ordre de départ, et copie le résultat dans le presse-papiers.
5. Coller le presse-papiers dans un message, avec le nom de la page, l'espace et les événements choisis (par exemple « Analyse, Abbé Deschamps, 30 événements »).
6. Pour une deuxième capture (à chaud, cache serveur rempli), refaire les étapes 2 à 5 sur la même page : revenir sur une autre page par le menu, relancer le script 1, retourner sur la page.

## Script 1 : repère (avant de naviguer)

```js
(() => {
  performance.setResourceTimingBufferSize(2000);
  performance.clearResourceTimings();
  window.__t0 = performance.now();
  console.log('Repère posé. Navigue maintenant vers la page, puis lance le script 2.');
})();
```

## Script 2 : lecture (après le chargement)

```js
(() => {
  if (typeof window.__t0 !== 'number') { console.warn('Lance d abord le script 1.'); return; }
  const isApi = (r) => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest';
  const isNoise = (p) => p.includes('/live/stream');
  const all = performance.getEntriesByType('resource')
    .filter((r) => isApi(r) && r.startTime >= window.__t0 - 1);
  const res = all.filter((r) => !isNoise(new URL(r.name).pathname));
  if (!res.length) { console.warn('Aucun appel capturé depuis le repère.'); return; }
  const base = Math.min(...res.map((r) => r.startTime));
  const rows = res
    .map((r) => ({
      chemin: new URL(r.name).pathname,
      debut_ms: Math.round(r.startTime - base),
      fin_ms: Math.round(r.responseEnd - base),
      duree_ms: Math.round(r.duration),
      ko: Math.round((r.transferSize || 0) / 1024),
    }))
    .sort((a, b) => a.debut_ms - b.debut_ms);
  // Plages pendant lesquelles au moins un appel est en cours, et trous entre elles.
  const plages = [];
  [...rows].sort((a, b) => a.debut_ms - b.debut_ms).forEach((r) => {
    const last = plages[plages.length - 1];
    if (last && r.debut_ms <= last[1]) last[1] = Math.max(last[1], r.fin_ms);
    else plages.push([r.debut_ms, r.fin_ms]);
  });
  const trous = plages.slice(1).map((p, i) => ({ de_ms: plages[i][1], a_ms: p[0], trou_ms: p[0] - plages[i][1] }))
    .filter((t) => t.trou_ms > 100);
  const repetes = Object.entries(rows.reduce((m, r) => ((m[r.chemin] = (m[r.chemin] || 0) + 1), m), {}))
    .filter(([, n]) => n > 1).map(([chemin, n]) => ({ chemin, fois: n }));
  const synthese = {
    page: location.pathname,
    appels_api: rows.length,
    flux_live_exclus: all.length - res.length,
    premier_appel_apres_repere_ms: Math.round(base - window.__t0),
    derniere_reponse_ms: Math.max(...rows.map((r) => r.fin_ms)),
    reseau_actif_ms: plages.reduce((s, p) => s + (p[1] - p[0]), 0),
    plus_long_ms: Math.max(...rows.map((r) => r.duree_ms)),
    total_ko: rows.reduce((s, r) => s + r.ko, 0),
    alerte_journal_plein: res.length >= 240,
  };
  console.log(JSON.stringify(synthese));
  console.table(rows);
  if (trous.length) console.table(trous);
  if (repetes.length) console.table(repetes);
  copy(JSON.stringify({ synthese, trous, repetes, detail: rows }));
})();
```

Lecture des temps : `debut_ms` et `fin_ms` sont relatifs au premier appel de la page (0 = premier appel). `premier_appel_apres_repere_ms` dit combien de temps s'écoule entre le clic et le premier appel (démarrage, session, routage). `reseau_actif_ms` comparé à `derniere_reponse_ms` dit si la page attend le réseau ou attend sa propre séquence.

## À savoir

- Si `appels_api` approche 240 ou si `alerte_journal_plein` vaut `true`, le journal a débordé : refaire avec le script 1 juste avant.
- Les tailles (`ko`) valent 0 quand l'API est sur un autre domaine sans l'en-tête `Timing-Allow-Origin` : les durées restent valides. Pour une taille précise, lire la colonne « Size » de l'onglet Network sur les 3 appels les plus longs.
- Le chemin est affiché sans paramètres. Les paramètres (liste d'identifiants d'événements) sont retirés exprès.
- Les flux `/live/stream` (SSE) restent ouverts des heures : ce ne sont pas des appels lents, ils sont exclus et comptés dans `flux_live_exclus`. L'appel `/auth/v1/token` (renouvellement de session) est un appel court normal.
- Une mesure sur un réseau très rapide (fibre, même ville) sous-estime ce que vit un utilisateur mobile. Si possible, refaire une capture avec « Fast 4G » dans Network > Throttling.
- Lancer chaque capture 3 fois et garder la médiane : un seul essai dépend trop du cache serveur.
