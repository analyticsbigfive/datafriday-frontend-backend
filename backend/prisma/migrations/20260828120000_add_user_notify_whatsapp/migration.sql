-- Décision Bertrand (08/2026) : notifications WhatsApp en option pour les logisticiens.
-- Terrain préparé (flag opt-in, User.phone déjà existant réutilisé comme numéro
-- WhatsApp), aucun envoi réel tant qu'un fournisseur (Twilio/Meta Cloud API) n'est
-- pas branché. Colonne nullable-safe (DEFAULT false), purement additive.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT false;
