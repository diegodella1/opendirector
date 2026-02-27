import { createClient } from '@supabase/supabase-js';

// Server-side client with service_role key (full access, no RLS)
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
