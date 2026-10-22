import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { supabase } from "./supabase";

const API_URL = `${SUPABASE_URL}/functions/v1/make-server-813cc0a8`;

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Não foi possível acessar o backend. Verifique a URL do Supabase e se a Edge Function foi publicada.",
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Falha na API (HTTP ${response.status}).`);
  }

  return payload as T;
}
