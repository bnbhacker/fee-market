import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Помогает быстро понять, если .env не подхватился
  console.error("Supabase env vars are missing. Check your .env file.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
