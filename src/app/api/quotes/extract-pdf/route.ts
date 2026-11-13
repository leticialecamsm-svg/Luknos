import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// POST /api/quotes/extract-pdf
// Recebe um PDF via multipart/form-data, extrai o "Total do Orçamento" do
// formato Master Lojista e devolve o valor numérico.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_form' }, { status: 400 })

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file_required' }, { status: 400 })
  }

  const bytes = await (file as File).arrayBuffer()
  const buffer = Buffer.from(bytes)

  // pdf-parse extrai o texto de cada página
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  let text: string
  try {
    const result = await pdfParse(buffer)
    text = result.text as string
  } catch {
    return NextResponse.json({ error: 'pdf_parse_failed' }, { status: 422 })
  }

  // Padrão Master Lojista: "Total do Orçamento: R$5.293,84"
  // Também aceita variações com espaço após R$
  const match = text.match(/Total\s+do\s+Or[cç]amento[:\s]+R\$\s*([\d.,]+)/i)
  if (!match) {
    return NextResponse.json({ error: 'value_not_found', text: text.slice(0, 500) }, { status: 422 })
  }

  // Converte "5.293,84" → 5293.84
  const raw = match[1].trim()
  const numeric = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
  if (isNaN(numeric) || numeric <= 0) {
    return NextResponse.json({ error: 'value_invalid', raw }, { status: 422 })
  }

  return NextResponse.json({ value: numeric, raw })
}
