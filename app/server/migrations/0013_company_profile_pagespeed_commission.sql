CREATE TABLE IF NOT EXISTS company_profile (
  company_profile_id TEXT PRIMARY KEY,
  business_id TEXT,
  prospect_id TEXT,
  website_url TEXT,
  legal_contact_email TEXT,
  headcount_range TEXT,
  naf_code TEXT,
  sector_label TEXT,
  annual_revenue_eur INTEGER,
  website_created_at TEXT,
  website_redesign_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (business_id IS NULL AND prospect_id IS NOT NULL) OR
    (business_id IS NOT NULL AND prospect_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_profile_business_id ON company_profile(business_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_profile_prospect_id ON company_profile(prospect_id);

CREATE TABLE IF NOT EXISTS company_pagespeed_run (
  run_id TEXT PRIMARY KEY,
  business_id TEXT,
  prospect_id TEXT,
  strategy TEXT NOT NULL,
  performance_score INTEGER,
  accessibility_score INTEGER,
  seo_score INTEGER,
  best_practices_score INTEGER,
  raw_json TEXT,
  fetched_at TEXT NOT NULL,
  CHECK (
    (business_id IS NULL AND prospect_id IS NOT NULL) OR
    (business_id IS NOT NULL AND prospect_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pagespeed_business_id_fetched_at ON company_pagespeed_run(business_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_pagespeed_prospect_id_fetched_at ON company_pagespeed_run(prospect_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_pagespeed_strategy_accessibility ON company_pagespeed_run(strategy, accessibility_score);

CREATE TABLE IF NOT EXISTS commission_entry (
  entry_id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  business_id TEXT,
  prospect_id TEXT,
  ca_eur INTEGER NOT NULL,
  rate_pct REAL NOT NULL,
  charges_pct REAL NOT NULL,
  commission_gross_eur INTEGER NOT NULL,
  charges_amount_eur INTEGER NOT NULL,
  commission_net_eur INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_month ON commission_entry(month);
CREATE INDEX IF NOT EXISTS idx_commission_business_month ON commission_entry(business_id, month);
CREATE INDEX IF NOT EXISTS idx_commission_prospect_month ON commission_entry(prospect_id, month);
