-- Intégrité référentielle : WeezeventLocationShopMapping.spaceElementId -> SpaceElement.id
--
-- CONTEXTE : jusqu'ici `spaceElementId` était une String SANS clé étrangère. Quand un
-- SpaceElement était supprimé/recréé (ancien delete+recreate de saveConfiguration), le mapping
-- survivait en pointant dans le vide ("dangling") et le PDV apparaissait démappé en silence.
-- Le save de config passe désormais en reconcile-in-place (id immuable) ; on verrouille en plus
-- l'invariant au niveau DB.
--
-- ORDRE : cette migration nettoie d'abord les mappings orphelins (sinon l'ADD CONSTRAINT échoue
-- sur les lignes existantes qui violent la FK), puis pose la contrainte.

-- 1) Cleanup : supprimer les mappings shop dont le SpaceElement n'existe plus.
--    Ils sont déjà non-fonctionnels (l'élément cible a disparu) ; le PDV redevient remappable
--    proprement (et le reconcile garantit désormais la stabilité de l'id).
DELETE FROM "WeezeventLocationShopMapping" m
WHERE NOT EXISTS (
  SELECT 1 FROM "SpaceElement" se WHERE se.id = m."spaceElementId"
);

-- 2) Clé étrangère + cascade.
--    onDelete: Cascade = quand un shop est RÉELLEMENT supprimé (suppression d'espace/config),
--    son mapping part avec lui — au lieu de rester orphelin. Le reconcile ne supprimant jamais
--    un élément porteur d'un mapping, aucun mapping légitime n'est perdu en fonctionnement normal.
ALTER TABLE "WeezeventLocationShopMapping"
  ADD CONSTRAINT "WeezeventLocationShopMapping_spaceElementId_fkey"
  FOREIGN KEY ("spaceElementId") REFERENCES "SpaceElement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
