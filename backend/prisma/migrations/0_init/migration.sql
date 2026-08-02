-- CreateEnum
CREATE TYPE "ElementType" AS ENUM ('access', 'hospitality', 'entertainment', 'shop', 'merchshop', 'entrance', 'storage', 'kitchen', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'seating', 'stage', 'parking', 'restroom', 'office', 'other');

-- CreateEnum
CREATE TYPE "GoodType" AS ENUM ('Food', 'Beverage', 'Packaging', 'Other');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('Cold', 'Dry', 'Frozen');

-- CreateEnum
CREATE TYPE "Diet" AS ENUM ('Vegetarian', 'Vegan', 'GlutenFree', 'Halal', 'Kosher');

-- CreateEnum
CREATE TYPE "MenuItemCategory" AS ENUM ('Starter', 'Main', 'Dessert', 'Side', 'Beverage', 'Snack');

-- CreateEnum
CREATE TYPE "ComponentCategory" AS ENUM ('Sauce', 'Condiment', 'Topping', 'Base', 'Filling', 'Other');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('Vegetable', 'Meat', 'Fish', 'Dairy', 'Bread', 'Spice', 'Condiment', 'Grain', 'Fruit', 'Herb', 'Oil', 'Sweetener', 'Beverage', 'Packaging', 'Other');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('venueentrance', 'emergency', 'service', 'vip');

-- CreateEnum
CREATE TYPE "HospitalityType" AS ENUM ('salon', 'lounge', 'restaurant', 'bar', 'vip_area');

-- CreateEnum
CREATE TYPE "EntertainmentType" AS ENUM ('sportground', 'stage', 'screen', 'playground');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('food', 'beverages', 'beer', 'merchandise', 'souvenirs', 'retail');

-- CreateEnum
CREATE TYPE "EntranceType" AS ENUM ('public', 'vip', 'service', 'emergency');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "logo" TEXT,
    "plan" "TenantPlan" NOT NULL DEFAULT 'FREE',
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitationCode" TEXT,
    "invitationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "organizationType" TEXT,
    "siret" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'France',
    "email" TEXT,
    "phone" TEXT,
    "numberOfEmployees" INTEGER,
    "numberOfSpaces" INTEGER,
    "paymentMethod" TEXT,
    "metadata" JSONB,
    "weezeventClientId" TEXT,
    "weezeventClientSecret" TEXT,
    "weezeventOrganizationId" TEXT,
    "weezeventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "weezeventWebhookSecret" TEXT,
    "weezeventWebhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "avatar" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTenant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPinnedSpace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPinnedSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSpaceAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSpaceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tel" TEXT,
    "email" TEXT,
    "contactTel" TEXT,
    "contactEmail" TEXT,
    "mainContactPerson" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "department" INTEGER,
    "country" TEXT,
    "spaceType" TEXT,
    "spaceTypeOther" TEXT,
    "maxCapacity" INTEGER,
    "homeTeam" TEXT,
    "facebook" TEXT,
    "instagram" TEXT,
    "twitter" TEXT,
    "tiktok" TEXT,
    "avgEvent" DOUBLE PRECISION,
    "avgTransaction" DOUBLE PRECISION,
    "perCapita" DOUBLE PRECISION,
    "cachedMetrics" JSONB,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "capacity" INTEGER,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "cornerRadius" JSONB,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorElement" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ElementType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "height3d" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION DEFAULT 0,
    "image" TEXT,
    "notes" TEXT,
    "capacity" INTEGER,
    "cornerRadiusTL" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusTR" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusBL" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusBR" DOUBLE PRECISION DEFAULT 0,
    "shopTypes" TEXT[],
    "storageTypes" TEXT[],
    "hospitalityTypes" TEXT[],
    "accessTypes" TEXT[],
    "entertainmentTypes" TEXT[],
    "entranceTypes" TEXT[],
    "kitchenTypes" TEXT[],
    "attributes" JSONB,
    "tags" TEXT[],

    CONSTRAINT "FloorElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementPerformance" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION DEFAULT 0,
    "numberOfPOS" INTEGER DEFAULT 0,
    "numberOfTransactions" DOUBLE PRECISION DEFAULT 0,
    "transactionsPerMinute" DOUBLE PRECISION DEFAULT 0,
    "staffCost" DOUBLE PRECISION DEFAULT 0,
    "revenuePerEmployee" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementStaff" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "hourlyRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementInventory" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "minStock" DOUBLE PRECISION,
    "maxStock" DOUBLE PRECISION,
    "isCustom" BOOLEAN NOT NULL DEFAULT true,
    "menuItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Forecourt" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Forecourt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecourtElement" (
    "id" TEXT NOT NULL,
    "forecourtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ElementType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "height3d" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION DEFAULT 0,
    "image" TEXT,
    "notes" TEXT,
    "capacity" INTEGER,
    "cornerRadiusTL" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusTR" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusBL" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusBR" DOUBLE PRECISION DEFAULT 0,
    "entranceTypes" TEXT[],
    "accessTypes" TEXT[],
    "attributes" JSONB,
    "tags" TEXT[],

    CONSTRAINT "ForecourtElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecourtElementPerformance" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION DEFAULT 0,
    "numberOfPOS" INTEGER DEFAULT 0,
    "numberOfTransactions" DOUBLE PRECISION DEFAULT 0,
    "transactionsPerMinute" DOUBLE PRECISION DEFAULT 0,
    "staffCost" DOUBLE PRECISION DEFAULT 0,
    "revenuePerEmployee" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecourtElementPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecourtElementStaff" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "hourlyRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecourtElementStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecourtElementInventory" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "minStock" DOUBLE PRECISION,
    "maxStock" DOUBLE PRECISION,
    "isCustom" BOOLEAN NOT NULL DEFAULT true,
    "menuItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecourtElementInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "tel" TEXT,
    "city" TEXT,
    "address" TEXT,
    "postcode" TEXT,
    "picture" TEXT,
    "sites" TEXT[],
    "contactName" TEXT,
    "configurationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "image" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "goodType" "GoodType" NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" TEXT,
    "supplierItem" TEXT,
    "recipeUnit" TEXT,
    "purchaseUnitConversion" DOUBLE PRECISION,
    "supplier" TEXT,
    "supplierId" TEXT,
    "pricePerUnit" DECIMAL(10,4),
    "packedUnits" INTEGER,
    "numberOfUnits" INTEGER,
    "unitsPerPurchase" INTEGER,
    "packingWidth" DOUBLE PRECISION,
    "packingHeight" DOUBLE PRECISION,
    "packingLength" DOUBLE PRECISION,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventEvent" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "description" TEXT,
    "location" TEXT,
    "capacity" INTEGER,
    "status" TEXT,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventMerchant" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "description" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventLocation" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "capacity" INTEGER,
    "coordinates" JSONB,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventProduct" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "basePrice" DECIMAL(10,2),
    "vatRate" DECIMAL(5,2),
    "image" TEXT,
    "allergens" TEXT[],
    "isCompound" BOOLEAN NOT NULL DEFAULT false,
    "components" JSONB,
    "variants" JSONB,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventUser" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "birthdate" TIMESTAMP(3),
    "address" JSONB,
    "walletId" TEXT,
    "gdprConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventWallet" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "userId" TEXT,
    "walletGroupId" TEXT,
    "status" TEXT NOT NULL,
    "cardNumber" TEXT,
    "cardType" TEXT,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventTransaction" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT,
    "eventName" TEXT,
    "merchantId" TEXT,
    "merchantName" TEXT,
    "locationId" TEXT,
    "locationName" TEXT,
    "sellerId" TEXT,
    "sellerWalletId" TEXT,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventSyncState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastCursor" TEXT,
    "lastWeezeventId" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "totalSynced" INTEGER NOT NULL DEFAULT 0,
    "lastSyncCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncDuration" INTEGER,
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeezeventSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeezeventWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventTransactionItem" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "weezeventItemId" TEXT,
    "productId" TEXT,
    "productName" TEXT,
    "compoundId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "vat" DECIMAL(5,2) NOT NULL,
    "reduction" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventTransactionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventPayment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "weezeventPaymentId" TEXT,
    "walletId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "amountVat" DECIMAL(10,2) NOT NULL,
    "currencyId" TEXT,
    "quantity" INTEGER NOT NULL,
    "paymentMethodId" TEXT,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supplier" TEXT,
    "recipeUnit" TEXT NOT NULL,
    "storageType" "StorageType",
    "purchaseUnit" TEXT NOT NULL,
    "marketPriceId" TEXT,
    "costPerRecipeUnit" DECIMAL(10,4),
    "ingredientCategory" "IngredientCategory",
    "costPerPurchaseUnit" DECIMAL(10,4),
    "purchaseUnitsPerRecipeUnit" DOUBLE PRECISION,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Packaging" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supplier" TEXT,
    "recipeUnit" TEXT NOT NULL,
    "storageType" "StorageType",
    "purchaseUnit" TEXT NOT NULL,
    "marketPriceId" TEXT,
    "costPerRecipeUnit" DECIMAL(10,4),
    "ingredientCategory" TEXT,
    "costPerPurchaseUnit" DECIMAL(10,4),
    "purchaseUnitsPerRecipeUnit" DOUBLE PRECISION,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Packaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuComponent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unitCost" DECIMAL(10,4),
    "allergens" TEXT[],
    "description" TEXT,
    "storageType" "StorageType",
    "subComponents" JSONB,
    "componentCategory" TEXT,
    "numberOfUnitsRecipe" INTEGER,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MenuComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentIngredient" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "unitCost" DECIMAL(10,4),
    "cost" DECIMAL(10,4),

    CONSTRAINT "ComponentIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentComponent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "cost" DECIMAL(10,4),

    CONSTRAINT "ComponentComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "typeId" TEXT,
    "category" "MenuItemCategory" NOT NULL,
    "categoryId" TEXT,
    "diet" "Diet"[],
    "allergens" TEXT[],
    "picture" TEXT,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(12,4),
    "margin" DOUBLE PRECISION,
    "description" TEXT,
    "storageType" "StorageType"[],
    "readyForSale" TEXT,
    "comboItem" TEXT,
    "numberOfPiecesRecipe" INTEGER,
    "componentsData" JSONB,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemComponent" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "numberOfUnits" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,4),
    "totalCost" DECIMAL(12,4),
    "storageType" "StorageType",

    CONSTRAINT "MenuItemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemIngredient" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "numberOfUnits" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,4),
    "totalCost" DECIMAL(12,4),
    "storageType" "StorageType",

    CONSTRAINT "MenuItemIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemPackaging" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "packagingId" TEXT NOT NULL,
    "numberOfUnits" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,4),
    "totalCost" DECIMAL(12,4),
    "storageType" "StorageType",

    CONSTRAINT "MenuItemPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuAssignment" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceMenuConfig" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "menuItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceMenuConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsvMapping" (
    "id" TEXT NOT NULL,
    "mappingType" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsvMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSubcategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventCategoryId" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "spaceId" TEXT,
    "configurationId" TEXT,
    "eventTypeId" TEXT,
    "eventCategoryId" TEXT,
    "eventSubcategoryId" TEXT,
    "tenantId" TEXT,
    "location" TEXT,
    "spaceName" TEXT,
    "sessions" TEXT,
    "numberOfSessions" INTEGER,
    "hasOpeningAct" BOOLEAN,
    "hasIntermission" BOOLEAN,
    "revenue" DECIMAL(12,2),
    "transactionCount" INTEGER,
    "avgSpendPerTx" DECIMAL(10,2),
    "perCapita" DECIMAL(10,2),
    "status" TEXT,
    "calculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "spaceId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_invitationCode_key" ON "Tenant"("invitationCode");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE INDEX "Tenant_weezeventEnabled_idx" ON "Tenant"("weezeventEnabled");

-- CreateIndex
CREATE INDEX "Tenant_weezeventWebhookEnabled_idx" ON "Tenant"("weezeventWebhookEnabled");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_tenantId_key" ON "User"("email", "tenantId");

-- CreateIndex
CREATE INDEX "UserTenant_userId_idx" ON "UserTenant"("userId");

-- CreateIndex
CREATE INDEX "UserTenant_tenantId_idx" ON "UserTenant"("tenantId");

-- CreateIndex
CREATE INDEX "UserTenant_isOwner_idx" ON "UserTenant"("isOwner");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenant_userId_tenantId_key" ON "UserTenant"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "UserPinnedSpace_userId_idx" ON "UserPinnedSpace"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPinnedSpace_userId_spaceId_key" ON "UserPinnedSpace"("userId", "spaceId");

-- CreateIndex
CREATE INDEX "UserSpaceAccess_userId_idx" ON "UserSpaceAccess"("userId");

-- CreateIndex
CREATE INDEX "UserSpaceAccess_spaceId_idx" ON "UserSpaceAccess"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSpaceAccess_userId_spaceId_key" ON "UserSpaceAccess"("userId", "spaceId");

-- CreateIndex
CREATE INDEX "Space_tenantId_idx" ON "Space"("tenantId");

-- CreateIndex
CREATE INDEX "Space_name_idx" ON "Space"("name");

-- CreateIndex
CREATE INDEX "Space_spaceType_idx" ON "Space"("spaceType");

-- CreateIndex
CREATE INDEX "Space_city_idx" ON "Space"("city");

-- CreateIndex
CREATE INDEX "Config_spaceId_idx" ON "Config"("spaceId");

-- CreateIndex
CREATE INDEX "Floor_configId_idx" ON "Floor"("configId");

-- CreateIndex
CREATE INDEX "Floor_level_idx" ON "Floor"("level");

-- CreateIndex
CREATE INDEX "FloorElement_floorId_idx" ON "FloorElement"("floorId");

-- CreateIndex
CREATE INDEX "FloorElement_type_idx" ON "FloorElement"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ElementPerformance_elementId_key" ON "ElementPerformance"("elementId");

-- CreateIndex
CREATE INDEX "ElementStaff_elementId_idx" ON "ElementStaff"("elementId");

-- CreateIndex
CREATE INDEX "ElementInventory_elementId_idx" ON "ElementInventory"("elementId");

-- CreateIndex
CREATE INDEX "ElementInventory_name_idx" ON "ElementInventory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Forecourt_configId_key" ON "Forecourt"("configId");

-- CreateIndex
CREATE INDEX "ForecourtElement_forecourtId_idx" ON "ForecourtElement"("forecourtId");

-- CreateIndex
CREATE INDEX "ForecourtElement_type_idx" ON "ForecourtElement"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ForecourtElementPerformance_elementId_key" ON "ForecourtElementPerformance"("elementId");

-- CreateIndex
CREATE INDEX "ForecourtElementStaff_elementId_idx" ON "ForecourtElementStaff"("elementId");

-- CreateIndex
CREATE INDEX "ForecourtElementInventory_elementId_idx" ON "ForecourtElementInventory"("elementId");

-- CreateIndex
CREATE INDEX "ForecourtElementInventory_name_idx" ON "ForecourtElementInventory"("name");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "MarketPrice_tenantId_idx" ON "MarketPrice"("tenantId");

-- CreateIndex
CREATE INDEX "MarketPrice_supplierId_idx" ON "MarketPrice"("supplierId");

-- CreateIndex
CREATE INDEX "MarketPrice_goodType_idx" ON "MarketPrice"("goodType");

-- CreateIndex
CREATE INDEX "MarketPrice_itemName_idx" ON "MarketPrice"("itemName");

-- CreateIndex
CREATE INDEX "MarketPrice_category_idx" ON "MarketPrice"("category");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventEvent_weezeventId_key" ON "WeezeventEvent"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventEvent_tenantId_idx" ON "WeezeventEvent"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventEvent_weezeventId_idx" ON "WeezeventEvent"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventEvent_startDate_idx" ON "WeezeventEvent"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventMerchant_weezeventId_key" ON "WeezeventMerchant"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventMerchant_tenantId_idx" ON "WeezeventMerchant"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventMerchant_weezeventId_idx" ON "WeezeventMerchant"("weezeventId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventLocation_weezeventId_key" ON "WeezeventLocation"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventLocation_tenantId_idx" ON "WeezeventLocation"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventLocation_weezeventId_idx" ON "WeezeventLocation"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventLocation_eventId_idx" ON "WeezeventLocation"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventProduct_weezeventId_key" ON "WeezeventProduct"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventProduct_tenantId_idx" ON "WeezeventProduct"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventProduct_weezeventId_idx" ON "WeezeventProduct"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventProduct_category_idx" ON "WeezeventProduct"("category");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventUser_weezeventId_key" ON "WeezeventUser"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventUser_tenantId_idx" ON "WeezeventUser"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventUser_weezeventId_idx" ON "WeezeventUser"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventUser_email_idx" ON "WeezeventUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventWallet_weezeventId_key" ON "WeezeventWallet"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventWallet_tenantId_idx" ON "WeezeventWallet"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventWallet_weezeventId_idx" ON "WeezeventWallet"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventWallet_userId_idx" ON "WeezeventWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventTransaction_weezeventId_key" ON "WeezeventTransaction"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_tenantId_idx" ON "WeezeventTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_weezeventId_idx" ON "WeezeventTransaction"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_eventId_idx" ON "WeezeventTransaction"("eventId");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_merchantId_idx" ON "WeezeventTransaction"("merchantId");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_locationId_idx" ON "WeezeventTransaction"("locationId");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_status_idx" ON "WeezeventTransaction"("status");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_transactionDate_idx" ON "WeezeventTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_syncedAt_idx" ON "WeezeventTransaction"("syncedAt");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_sellerWalletId_idx" ON "WeezeventTransaction"("sellerWalletId");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_tenantId_status_transactionDate_idx" ON "WeezeventTransaction"("tenantId", "status", "transactionDate");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_tenantId_eventId_status_idx" ON "WeezeventTransaction"("tenantId", "eventId", "status");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_eventId_transactionDate_idx" ON "WeezeventTransaction"("eventId", "transactionDate");

-- CreateIndex
CREATE INDEX "WeezeventSyncState_tenantId_idx" ON "WeezeventSyncState"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventSyncState_syncType_idx" ON "WeezeventSyncState"("syncType");

-- CreateIndex
CREATE INDEX "WeezeventSyncState_lastSyncedAt_idx" ON "WeezeventSyncState"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventSyncState_tenantId_syncType_key" ON "WeezeventSyncState"("tenantId", "syncType");

-- CreateIndex
CREATE INDEX "WeezeventWebhookEvent_tenantId_idx" ON "WeezeventWebhookEvent"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventWebhookEvent_eventType_idx" ON "WeezeventWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "WeezeventWebhookEvent_processed_idx" ON "WeezeventWebhookEvent"("processed");

-- CreateIndex
CREATE INDEX "WeezeventWebhookEvent_createdAt_idx" ON "WeezeventWebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "WeezeventTransactionItem_transactionId_idx" ON "WeezeventTransactionItem"("transactionId");

-- CreateIndex
CREATE INDEX "WeezeventTransactionItem_productId_idx" ON "WeezeventTransactionItem"("productId");

-- CreateIndex
CREATE INDEX "WeezeventTransactionItem_weezeventItemId_idx" ON "WeezeventTransactionItem"("weezeventItemId");

-- CreateIndex
CREATE INDEX "WeezeventTransactionItem_productId_transactionId_idx" ON "WeezeventTransactionItem"("productId", "transactionId");

-- CreateIndex
CREATE INDEX "WeezeventPayment_itemId_idx" ON "WeezeventPayment"("itemId");

-- CreateIndex
CREATE INDEX "WeezeventPayment_walletId_idx" ON "WeezeventPayment"("walletId");

-- CreateIndex
CREATE INDEX "Ingredient_tenantId_idx" ON "Ingredient"("tenantId");

-- CreateIndex
CREATE INDEX "Ingredient_name_idx" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Ingredient_active_idx" ON "Ingredient"("active");

-- CreateIndex
CREATE INDEX "Ingredient_ingredientCategory_idx" ON "Ingredient"("ingredientCategory");

-- CreateIndex
CREATE INDEX "Packaging_tenantId_idx" ON "Packaging"("tenantId");

-- CreateIndex
CREATE INDEX "Packaging_name_idx" ON "Packaging"("name");

-- CreateIndex
CREATE INDEX "Packaging_active_idx" ON "Packaging"("active");

-- CreateIndex
CREATE INDEX "MenuComponent_tenantId_idx" ON "MenuComponent"("tenantId");

-- CreateIndex
CREATE INDEX "MenuComponent_name_idx" ON "MenuComponent"("name");

-- CreateIndex
CREATE INDEX "MenuComponent_category_idx" ON "MenuComponent"("category");

-- CreateIndex
CREATE INDEX "ComponentIngredient_componentId_idx" ON "ComponentIngredient"("componentId");

-- CreateIndex
CREATE INDEX "ComponentIngredient_ingredientId_idx" ON "ComponentIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentIngredient_componentId_ingredientId_key" ON "ComponentIngredient"("componentId", "ingredientId");

-- CreateIndex
CREATE INDEX "ComponentComponent_parentId_idx" ON "ComponentComponent"("parentId");

-- CreateIndex
CREATE INDEX "ComponentComponent_childId_idx" ON "ComponentComponent"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentComponent_parentId_childId_key" ON "ComponentComponent"("parentId", "childId");

-- CreateIndex
CREATE INDEX "ProductType_tenantId_idx" ON "ProductType"("tenantId");

-- CreateIndex
CREATE INDEX "ProductType_name_idx" ON "ProductType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_tenantId_name_key" ON "ProductType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ProductCategory_tenantId_idx" ON "ProductCategory"("tenantId");

-- CreateIndex
CREATE INDEX "ProductCategory_typeId_idx" ON "ProductCategory"("typeId");

-- CreateIndex
CREATE INDEX "ProductCategory_name_idx" ON "ProductCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_tenantId_typeId_name_key" ON "ProductCategory"("tenantId", "typeId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItem_name_idx" ON "MenuItem"("name");

-- CreateIndex
CREATE INDEX "MenuItem_category_idx" ON "MenuItem"("category");

-- CreateIndex
CREATE INDEX "MenuItem_typeId_idx" ON "MenuItem"("typeId");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "MenuItem_readyForSale_idx" ON "MenuItem"("readyForSale");

-- CreateIndex
CREATE INDEX "MenuItemComponent_menuItemId_idx" ON "MenuItemComponent"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemComponent_componentId_idx" ON "MenuItemComponent"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemComponent_menuItemId_componentId_key" ON "MenuItemComponent"("menuItemId", "componentId");

-- CreateIndex
CREATE INDEX "MenuItemIngredient_menuItemId_idx" ON "MenuItemIngredient"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemIngredient_ingredientId_idx" ON "MenuItemIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemIngredient_menuItemId_ingredientId_key" ON "MenuItemIngredient"("menuItemId", "ingredientId");

-- CreateIndex
CREATE INDEX "MenuItemPackaging_menuItemId_idx" ON "MenuItemPackaging"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemPackaging_packagingId_idx" ON "MenuItemPackaging"("packagingId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemPackaging_menuItemId_packagingId_key" ON "MenuItemPackaging"("menuItemId", "packagingId");

-- CreateIndex
CREATE INDEX "Station_configId_idx" ON "Station"("configId");

-- CreateIndex
CREATE INDEX "MenuAssignment_stationId_idx" ON "MenuAssignment"("stationId");

-- CreateIndex
CREATE INDEX "MenuAssignment_menuItemId_idx" ON "MenuAssignment"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuAssignment_stationId_menuItemId_key" ON "MenuAssignment"("stationId", "menuItemId");

-- CreateIndex
CREATE INDEX "SpaceMenuConfig_spaceId_idx" ON "SpaceMenuConfig"("spaceId");

-- CreateIndex
CREATE INDEX "SpaceMenuConfig_configId_idx" ON "SpaceMenuConfig"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceMenuConfig_spaceId_configId_key" ON "SpaceMenuConfig"("spaceId", "configId");

-- CreateIndex
CREATE INDEX "CsvMapping_tenantId_idx" ON "CsvMapping"("tenantId");

-- CreateIndex
CREATE INDEX "CsvMapping_mappingType_idx" ON "CsvMapping"("mappingType");

-- CreateIndex
CREATE INDEX "EventType_tenantId_idx" ON "EventType"("tenantId");

-- CreateIndex
CREATE INDEX "EventType_name_idx" ON "EventType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_tenantId_name_key" ON "EventType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EventCategory_tenantId_idx" ON "EventCategory"("tenantId");

-- CreateIndex
CREATE INDEX "EventCategory_eventTypeId_idx" ON "EventCategory"("eventTypeId");

-- CreateIndex
CREATE INDEX "EventCategory_name_idx" ON "EventCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_tenantId_eventTypeId_name_key" ON "EventCategory"("tenantId", "eventTypeId", "name");

-- CreateIndex
CREATE INDEX "EventSubcategory_tenantId_idx" ON "EventSubcategory"("tenantId");

-- CreateIndex
CREATE INDEX "EventSubcategory_eventCategoryId_idx" ON "EventSubcategory"("eventCategoryId");

-- CreateIndex
CREATE INDEX "EventSubcategory_name_idx" ON "EventSubcategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EventSubcategory_tenantId_eventCategoryId_name_key" ON "EventSubcategory"("tenantId", "eventCategoryId", "name");

-- CreateIndex
CREATE INDEX "Event_tenantId_idx" ON "Event"("tenantId");

-- CreateIndex
CREATE INDEX "Event_spaceId_idx" ON "Event"("spaceId");

-- CreateIndex
CREATE INDEX "Event_eventDate_idx" ON "Event"("eventDate");

-- CreateIndex
CREATE INDEX "Event_eventTypeId_idx" ON "Event"("eventTypeId");

-- CreateIndex
CREATE INDEX "Event_eventCategoryId_idx" ON "Event"("eventCategoryId");

-- CreateIndex
CREATE INDEX "Event_eventSubcategoryId_idx" ON "Event"("eventSubcategoryId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_createdAt_idx" ON "AuditLog"("tenantId", "entity", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityId_idx" ON "AuditLog"("tenantId", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "Menu_tenantId_idx" ON "Menu"("tenantId");

-- CreateIndex
CREATE INDEX "Menu_spaceId_idx" ON "Menu"("spaceId");

-- CreateIndex
CREATE INDEX "Menu_configId_idx" ON "Menu"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_spaceId_configId_name_key" ON "Menu"("spaceId", "configId", "name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedSpace" ADD CONSTRAINT "UserPinnedSpace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedSpace" ADD CONSTRAINT "UserPinnedSpace_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpaceAccess" ADD CONSTRAINT "UserSpaceAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpaceAccess" ADD CONSTRAINT "UserSpaceAccess_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Config" ADD CONSTRAINT "Config_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_configId_fkey" FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementPerformance" ADD CONSTRAINT "ElementPerformance_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "FloorElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementStaff" ADD CONSTRAINT "ElementStaff_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "FloorElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementInventory" ADD CONSTRAINT "ElementInventory_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "FloorElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forecourt" ADD CONSTRAINT "Forecourt_configId_fkey" FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecourtElement" ADD CONSTRAINT "ForecourtElement_forecourtId_fkey" FOREIGN KEY ("forecourtId") REFERENCES "Forecourt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecourtElementPerformance" ADD CONSTRAINT "ForecourtElementPerformance_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ForecourtElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecourtElementStaff" ADD CONSTRAINT "ForecourtElementStaff_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ForecourtElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecourtElementInventory" ADD CONSTRAINT "ForecourtElementInventory_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ForecourtElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventEvent" ADD CONSTRAINT "WeezeventEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventMerchant" ADD CONSTRAINT "WeezeventMerchant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventLocation" ADD CONSTRAINT "WeezeventLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventLocation" ADD CONSTRAINT "WeezeventLocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeezeventEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProduct" ADD CONSTRAINT "WeezeventProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventUser" ADD CONSTRAINT "WeezeventUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventUser" ADD CONSTRAINT "WeezeventUser_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WeezeventWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventWallet" ADD CONSTRAINT "WeezeventWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransaction" ADD CONSTRAINT "WeezeventTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransaction" ADD CONSTRAINT "WeezeventTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeezeventEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransaction" ADD CONSTRAINT "WeezeventTransaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "WeezeventMerchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransaction" ADD CONSTRAINT "WeezeventTransaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WeezeventLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransaction" ADD CONSTRAINT "WeezeventTransaction_sellerWalletId_fkey" FOREIGN KEY ("sellerWalletId") REFERENCES "WeezeventWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventWebhookEvent" ADD CONSTRAINT "WeezeventWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransactionItem" ADD CONSTRAINT "WeezeventTransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "WeezeventTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransactionItem" ADD CONSTRAINT "WeezeventTransactionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "WeezeventProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventPayment" ADD CONSTRAINT "WeezeventPayment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WeezeventTransactionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_marketPriceId_fkey" FOREIGN KEY ("marketPriceId") REFERENCES "MarketPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packaging" ADD CONSTRAINT "Packaging_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packaging" ADD CONSTRAINT "Packaging_marketPriceId_fkey" FOREIGN KEY ("marketPriceId") REFERENCES "MarketPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuComponent" ADD CONSTRAINT "MenuComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentIngredient" ADD CONSTRAINT "ComponentIngredient_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "MenuComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentIngredient" ADD CONSTRAINT "ComponentIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentComponent" ADD CONSTRAINT "ComponentComponent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentComponent" ADD CONSTRAINT "ComponentComponent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "MenuComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemComponent" ADD CONSTRAINT "MenuItemComponent_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemComponent" ADD CONSTRAINT "MenuItemComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "MenuComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPackaging" ADD CONSTRAINT "MenuItemPackaging_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPackaging" ADD CONSTRAINT "MenuItemPackaging_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "Packaging"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_configId_fkey" FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAssignment" ADD CONSTRAINT "MenuAssignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAssignment" ADD CONSTRAINT "MenuAssignment_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvMapping" ADD CONSTRAINT "CsvMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCategory" ADD CONSTRAINT "EventCategory_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSubcategory" ADD CONSTRAINT "EventSubcategory_eventCategoryId_fkey" FOREIGN KEY ("eventCategoryId") REFERENCES "EventCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventCategoryId_fkey" FOREIGN KEY ("eventCategoryId") REFERENCES "EventCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventSubcategoryId_fkey" FOREIGN KEY ("eventSubcategoryId") REFERENCES "EventSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

