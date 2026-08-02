-- RH-5 : renommer HrSupplier.sectors → HrSupplier.departments.
-- "Secteur" est renommé en "Département" côté produit (backlog RH-5, 2026-07-30).
-- Aucun alignement de valeurs avec HrRole.department (liste distincte, décision
-- utilisateur 2026-07-30) : seul le nom de colonne/libellé change, les valeurs
-- existantes (F&B, Hospitality, Merch, Ticketing, Access, Kitchen, Entertainment)
-- sont conservées telles quelles. Doit s'exécuter APRÈS 20260730160000_hr_staffing_module
-- (la table doit exister).

ALTER TABLE "HrSupplier" RENAME COLUMN "sectors" TO "departments";
