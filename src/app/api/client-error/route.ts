import { NextResponse } from 'next/server'

// Erros que derrubaram uma tela no navegador (ErrorScreen). Só registra no log do Vercel
// (procurar por "[client-error]") para dar para achar a causa depois.
export async function POST(req: Request) {
  const text = (await req.text().catch(() => '')).slice(0, 4000)
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* texto puro */ }
  console.error('[client-error]', JSON.stringify(body))
  return NextResponse.json({ ok: true })
}
