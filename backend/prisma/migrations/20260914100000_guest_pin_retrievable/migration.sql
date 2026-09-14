-- Critère d'acceptation 2026-09-14 (Pre-event Inventory) : "Quand le popup est fermé, le
-- code PIN peut être retrouvé sous le bouton Reset Code PIN". Le hash HMAC seul ne
-- permettait pas de le réafficher. On ajoute le PIN CHIFFRÉ (AES-256-GCM, clé dérivée
-- de GUEST_PIN_HMAC_SECRET, cf. src/features/guest-pin-access/guest-pin-crypto.ts),
-- déchiffré uniquement pour le status board directeur.
--
-- Les fenêtres déjà ouvertes gardent un pinCiphertext NULL : leur PIN reste
-- irrécupérable, il faudra le régénérer une fois pour qu'il devienne retrouvable.

ALTER TABLE "InventoryWindow" ADD COLUMN IF NOT EXISTS "pinCiphertext" TEXT;
