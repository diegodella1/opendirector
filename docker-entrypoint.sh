#!/bin/sh
set -e

# --- Wait for PostgreSQL ---
echo "Waiting for PostgreSQL..."
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q; do
  sleep 1
done
echo "PostgreSQL is ready."

# --- Create PostgREST roles if they don't exist ---
echo "Ensuring database roles..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=0 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;
SQL

# --- Apply migrations in order ---
echo "Applying migrations..."
for f in /app/migrations/*.sql; do
  echo "  -> $(basename "$f")"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$f"
done
echo "Migrations applied."

# --- Grant permissions to service_role (PostgREST uses this for authenticated admin access) ---
echo "Granting permissions to service_role..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=0 <<'SQL'
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
SQL

# --- Generate SERVICE_ROLE_KEY JWT if not set ---
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Generating service_role JWT..."
  SUPABASE_SERVICE_ROLE_KEY=$(node -e "
    const crypto = require('crypto');
    const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({role:'service_role',iss:'opendirector',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+10*365*24*3600})).toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(header+'.'+payload).digest('base64url');
    console.log(header+'.'+payload+'.'+sig);
  ")
  export SUPABASE_SERVICE_ROLE_KEY
  echo "JWT generated."
fi

# --- Start the application ---
echo "Starting OpenDirector..."
exec node server.js
