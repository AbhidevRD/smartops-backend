# Supabase OTP Table Setup

The Prisma migration requires direct DB access (port 5432) which is blocked from localhost.
Run this SQL in Supabase Dashboard → SQL Editor to create the OTP table:

```sql
-- Create otp_codes table for password-reset OTP
CREATE TABLE IF NOT EXISTS otp_codes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by email
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);

-- Auto-cleanup: delete expired/used OTPs older than 1 hour
-- (Optional but keeps the table clean)
```

## Steps:
1. Go to https://supabase.com/dashboard
2. Open your project: icjhbzdyjojidyjpyhaf
3. Click "SQL Editor" in the left sidebar
4. Paste the SQL above
5. Click "Run"

That's it! The table will be created and password reset OTPs will work immediately.
