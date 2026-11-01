/**
 * trafego-crm-api — funil de tráfego pago do CRM para o app Luknos Tráfego.
 *
 * Somente leitura e agregado (sem telefone/nome). Autenticação por chave
 * (x-api-key) cujo hash fica em public.trafego_api_keys. Chamada servidor a
 * servidor pela função crm-proxy do projeto "Luknos Tráfego".
 *
 * Body: { from: ISO, to: ISO }
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const key = req.headers.get("x-api-key") ?? "";
  if (!key) return json({ error: "Não autorizado." }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row } = await db
    .from("trafego_api_keys")
    .select("key_hash")
    .eq("key_hash", await sha256Hex(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!row) return json({ error: "Não autorizado." }, 401);

  const { from, to } = await req.json().catch(() => ({}));
  const f = new Date(from), t = new Date(to);
  if (isNaN(f.getTime()) || isNaN(t.getTime()) || t <= f) return json({ error: "Período inválido." }, 400);
  if (t.getTime() - f.getTime() > 400 * 86400000) return json({ error: "Período máximo: 400 dias." }, 400);

  const { data, error } = await db.rpc("trafego_crm_funnel", { p_from: f.toISOString(), p_to: t.toISOString() });
  if (error) return json({ error: "Falha ao consultar o CRM." }, 500);
  return json(data);
});
