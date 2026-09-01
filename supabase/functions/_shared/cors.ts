// CORS mínimo. As funções internas (engine, submit, workers) não são chamadas
// pelo browser; a única com acesso do painel é generate-attachment-signed-url.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-evolution-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
