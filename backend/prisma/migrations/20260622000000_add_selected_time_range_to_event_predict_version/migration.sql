ALTER TABLE public."EventPredictVersion"
  ADD COLUMN IF NOT EXISTS "selectedTimeRange" jsonb;
