# Produits non mappés — La Beaujoire Nantes (à mapper au wizard étape 3)

Contexte : décision JLH 24/08 (BUG-137-01 api / BUG-356-01 web) — les ventes non mappées restent
COMPTÉES et affichées « Non mappées » dans l'Analyse. Le seul fix légitime pour qu'un produit
(ex. « Gallia nouveau western ») cesse d'apparaître en « Non mappées » est de faire son mapping
Data Integration (wizard étape 3). Liste mesurée en base dev le 24/08 (intégrations
`cmt7ml1mf0028i4le7tjtt3de` et `cmt5my7za1xdpwqqq0ezb4sdi`) :

| Produit Weezevent/Digifood | Lignes de vente |
|---|---|
| Heineken original 45CL + Consigne | 2 450 |
| Eau plate (50CL) + Consigne | 1 754 |
| Coca-Cola 33CL + Consigne | 1 536 |
| Gallia nouveau western IPA 45cL + Consigne | 1 392 |
| Fuzetea pêche 33CL + Consigne | 1 036 |
| Canari 45cL + Consigne | 692 |
| BRASSES Coup d'envoi 45CL + Consigne | 640 |
| Coca-Cola Cherry 33CL + Consigne | 606 |
| Fanta orange 33CL + Consigne | 574 |
| Eau gazeuse + Consigne | 450 |
| Affligem 45cL + Consigne | 434 |
| Coca-Cola zéro sucres 33CL + Consigne | 368 |
| Offre x 4 Heineken original 45CL + 4 Consigne | 218 |
| Combo chips + soda + hot dog | 78 |
| Offre x 4 Canari 45cL + 4 Consigne | 74 |
| Combo frites + soda + burger | 54 |
| Combo potatoes + soda + burger porc | 46 |
| Combo chips + soda + croque | 34 |
| Bière sans alcool 33CL + Consigne | 30 |
| Monster original 50CL + Consigne | 20 |
| Bière du moment 45cL + Consigne | 10 |

Requête réutilisable (read-only, psql — remplacer la liste d'intégrations) :

```sql
SELECT wp.name AS produit, COUNT(*) AS lignes
FROM "WeezeventProduct" wp
LEFT JOIN "WeezeventProductMapping" wpm
  ON wpm."weezeventProductId" = wp.id AND wpm."menuItemId" IS NOT NULL
JOIN "WeezeventTransactionItem" ti ON ti."productId" = wp.id
WHERE wp."integrationId" IN ('cmt7ml1mf0028i4le7tjtt3de', 'cmt5my7za1xdpwqqq0ezb4sdi')
  AND wpm.id IS NULL
GROUP BY 1
ORDER BY lignes DESC;
```

— JLH
