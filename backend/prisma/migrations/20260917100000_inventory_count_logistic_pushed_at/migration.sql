-- Push incrémental du comptage vers Logistic (fix/pre-event-flow-robust) : une ligne
-- validée n'est repoussée que si elle a changé depuis son dernier push.
ALTER TABLE "InventoryCount" ADD COLUMN "logisticPushedAt" TIMESTAMP(3);
