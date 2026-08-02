-- Composition "Combo"/"Menu" d'un MenuItem par d'autres MenuItem vendables (ex. "Burger + Frites").
-- Auto-relation calquée sur ComponentComponent (MenuComponent -> MenuComponent), seule autre
-- auto-relation à table de jonction du schéma.
CREATE TABLE "MenuItemCombo" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "cost" DECIMAL(10,4),

    CONSTRAINT "MenuItemCombo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MenuItemCombo_parentId_idx" ON "MenuItemCombo"("parentId");
CREATE INDEX "MenuItemCombo_childId_idx" ON "MenuItemCombo"("childId");
CREATE UNIQUE INDEX "MenuItemCombo_parentId_childId_key" ON "MenuItemCombo"("parentId", "childId");

ALTER TABLE "MenuItemCombo" ADD CONSTRAINT "MenuItemCombo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItemCombo" ADD CONSTRAINT "MenuItemCombo_childId_fkey" FOREIGN KEY ("childId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
