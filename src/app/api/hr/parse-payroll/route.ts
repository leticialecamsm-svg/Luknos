import { NextRequest, NextResponse } from 'next/server'

// pdf-parse reads test files on require() which crashes in Next.js — use inner lib directly
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer, options?: object) => Promise<{ text: string }>

export interface PayrollEmployee {
  code: string
  name: string
  salaryBase: number
  totalProventos: number
  totalDescontos: number
  liquido: number
  fgts: number
  lineItems: { type: 'P' | 'D'; description: string; value: number }[]
}

function parseBR(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

function parseExtrato(text: string): PayrollEmployee[] {
  const employees: PayrollEmployee[] = []

  // Split by employee blocks — each starts with "Empr.:"
  const blocks = text.split(/(?=Empr\.:)/).filter(b => b.trim().startsWith('Empr.:'))

  for (const block of blocks) {
    // Extract employee code and name
    const empMatch = block.match(/Empr\.\:\s+(\d+)\s+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇA-Z\s]+?)(?:\s+Situação:|\s+CPF:)/)
    if (!empMatch) continue

    const code = empMatch[1].trim()
    const name = empMatch[2].trim()

    // Extract salary
    const salaryMatch = block.match(/Salário:\s*([\d.,]+)/)
    const salaryBase = salaryMatch ? parseBR(salaryMatch[1]) : 0

    // Extract totals line: "Proventos: X Descontos: Y Líquido: ... Z"
    const totalsMatch = block.match(/Proventos:\s*([\d.,]+)\s+Descontos:\s*([\d.,]+)[\s\S]*?(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/)
    let totalProventos = 0, totalDescontos = 0, liquido = 0
    if (totalsMatch) {
      totalProventos = parseBR(totalsMatch[1])
      totalDescontos = parseBR(totalsMatch[2])
      liquido = parseBR(totalsMatch[3])
    }

    // Extract FGTS
    const fgtsMatch = block.match(/Valor FGTS:\s*([\d.,]+)/)
    const fgts = fgtsMatch ? parseBR(fgtsMatch[1]) : 0

    // Extract line items
    const lineItems: PayrollEmployee['lineItems'] = []

    const proventosPattern = /\b(HORAS NORMAIS|VALE ALIMENTA[CÇ]AO|AJUDA DE CUSTO|FERIADO TRABALHADO|(?:HE|HORA EXTRA)[^D\n]*)\s+([\d.,]+)\s+P/gi
    const descontosPattern = /\b(I\.N\.S\.S\.|VALE TRANSPORTE|DESC\. EMP\. CRED\. TRAB[^\n]*?|INSS|IRRF)[^\d]*([\d.,]+)\s+D/gi

    let m
    while ((m = proventosPattern.exec(block)) !== null) {
      const val = parseBR(m[2])
      if (val > 0) lineItems.push({ type: 'P', description: m[1].trim(), value: val })
    }
    while ((m = descontosPattern.exec(block)) !== null) {
      const val = parseBR(m[2])
      if (val > 0) lineItems.push({ type: 'D', description: m[1].trim(), value: val })
    }

    if (lineItems.length === 0 && salaryBase > 0) {
      lineItems.push({ type: 'P', description: 'Salário Base', value: salaryBase })
    }

    employees.push({ code, name, salaryBase, totalProventos, totalDescontos, liquido, fgts, lineItems })
  }

  return employees
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const pdf = await pdfParse(buffer)
    const employees = parseExtrato(pdf.text)

    if (employees.length === 0) {
      return NextResponse.json({ error: 'Nenhum colaborador encontrado. Verifique se é o Extrato Mensal correto.' }, { status: 422 })
    }

    return NextResponse.json({ employees })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao processar PDF' }, { status: 500 })
  }
}
