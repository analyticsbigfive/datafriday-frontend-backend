-- Remove the fixed GoodType enum: goodType becomes a free-form string,
-- since "Good Type" is now driven by the dynamic MarketPriceType referential.
ALTER TABLE "MarketPrice" ALTER COLUMN "goodType" TYPE TEXT USING "goodType"::TEXT;
DROP TYPE "GoodType";
