# Database TLS certificate

Put Supabase's root certificate here as `supabase-prod-ca-2021.crt`.

Download it from Supabase: Project Settings → Database → SSL Configuration →
**Download certificate** (`prod-ca-2021.crt`), then rename it.

`app/db/session.py` loads it so production verifies the database's TLS
certificate instead of failing with `SSLCertVerificationError`. It is a public
CA certificate, not a secret, so it is safe to commit.
