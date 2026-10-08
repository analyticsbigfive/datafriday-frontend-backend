-- Raison de mouvement « Ventilation » : dépôt d'un logisticien sur un PDV ou un
-- stockage depuis la feuille de ventilation (réponse Bertrand du 2026-10-08).
-- Ajout de valeur d'enum seul, sans réécriture de table.
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'VENTILATION';
