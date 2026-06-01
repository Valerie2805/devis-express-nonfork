ALTER TABLE prospect_task ADD COLUMN business_id TEXT;
ALTER TABLE prospect_task ADD COLUMN sequence_id TEXT;
ALTER TABLE prospect_task ADD COLUMN step_id TEXT;
ALTER TABLE prospect_task ADD COLUMN approved_channel TEXT;
ALTER TABLE prospect_task ADD COLUMN approved_at TEXT;
ALTER TABLE prospect_task ADD COLUMN sent_at TEXT;
ALTER TABLE prospect_task ADD COLUMN canceled_at TEXT;

ALTER TABLE prospect_sequence ADD COLUMN business_id TEXT;

ALTER TABLE prospect_message ADD COLUMN business_id TEXT;
ALTER TABLE prospect_message ADD COLUMN channel TEXT;
ALTER TABLE prospect_message ADD COLUMN to_phone TEXT;
ALTER TABLE prospect_message ADD COLUMN task_id TEXT;

UPDATE prospect_task
SET business_id = (
  SELECT bp.business_id
  FROM business_prospect bp
  WHERE bp.prospect_id = prospect_task.prospect_id
  LIMIT 1
)
WHERE business_id IS NULL;

UPDATE prospect_message
SET business_id = (
  SELECT bp.business_id
  FROM business_prospect bp
  WHERE bp.prospect_id = prospect_message.prospect_id
  LIMIT 1
)
WHERE business_id IS NULL;

UPDATE prospect_sequence
SET business_id = (
  SELECT business_id
  FROM business
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE business_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pmsg_business_prospect_created ON prospect_message(business_id, prospect_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pseq_business_updated ON prospect_sequence(business_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_ptask_business_status_run ON prospect_task(business_id, status, run_at);
CREATE INDEX IF NOT EXISTS idx_ptask_business_prospect_run ON prospect_task(business_id, prospect_id, run_at);
CREATE INDEX IF NOT EXISTS idx_ptask_business_sequence_run ON prospect_task(business_id, sequence_id, run_at);
