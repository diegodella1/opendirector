import { PostgrestClient } from '@supabase/postgrest-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'build-placeholder-key';

// POSTGREST_URL: direct PostgREST URL (Docker compose with PostgREST)
// Falls back to SUPABASE_URL + /rest/v1 (Supabase gateway with Kong)
const restUrl = process.env.POSTGREST_URL
  || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/rest/v1` : 'http://127.0.0.1:3000/rest/v1');

export const supabase = new PostgrestClient(restUrl, {
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  },
  schema: 'public',
});
