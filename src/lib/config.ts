const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase não configurado. Copie .env.example para .env.local e preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
  );
}

export const SUPABASE_URL = (supabaseUrl ?? "https://invalid-project.supabase.co").replace(/\/$/, "");
export const SUPABASE_ANON_KEY = supabaseAnonKey ?? "missing-anon-key";
