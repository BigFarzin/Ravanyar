-- Run once for databases created before Bale payment support.
CREATE TABLE IF NOT EXISTS bale_accounts (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bale_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS bale_payload TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bale_charge_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payments_bale_charge_id_unique
  ON payments(bale_charge_id) WHERE bale_charge_id IS NOT NULL;
