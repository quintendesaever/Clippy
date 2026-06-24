import { createClient, SupabaseClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL in environment");
}

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
if (!supabaseKey) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in environment"
  );
}

export const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL,
  supabaseKey,
  process.env.SUPABASE_SERVICE_ROLE_KEY
    ? { auth: { persistSession: false } }
    : undefined
);
