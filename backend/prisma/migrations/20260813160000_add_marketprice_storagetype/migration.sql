-- Écrite à la main (comme les migrations précédentes, cf. 20260813150000_add_stocktransferloss) :
-- SQL identique à ce que Prisma aurait généré pour le champ MarketPrice.storageType (schema.prisma),
-- appliqué via `prisma migrate deploy`.
-- Ajoute le type de stockage au niveau du prix fournisseur (supplier item) : la valeur est un
-- nom de référentiel StorageType (Dry/Cold/Frozen). Nullable : les lignes existantes restent NULL
-- (le frontend retombe alors sur l'ancienne heuristique par catégorie).

ALTER TABLE "MarketPrice" ADD COLUMN "storageType" TEXT;
