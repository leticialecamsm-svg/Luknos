import { NextRequest, NextResponse } from 'next/server'

async function parsePdf(buf: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
  const result = await pdfParse(buf)
  return result.text
}

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
  if (!s) return 0
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

// The PDF text has columns merged — name appears BEFORE "Empr.:", values BEFORE their labels
function parseExtrato(raw: string): PayrollEmployee[] {
  const employees: PayrollEmployee[] = []

  // Each employee block ends right before the next employee or at "Totais por Departamento"
  // Split by the pattern: newline + (digits) + (UPPERCASE NAME) + "Empr.:"
  const empPattern = /\n(\d+)\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇDA-Z][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇA-Z\s]+?)Empr\./g

  const matches: { index: number; code: string; name: string }[] = []
  let m
  while ((m = empPattern.exec(raw)) !== null) {
    const name = m[2].trim()
    // Skip if looks like a department or total line (very short or all digits)
    if (name.length < 4) continue
    matches.push({ index: m.index, code: m[1].trim(), name })
  }

  for (let i = 0; i < matches.length; i++) {
    const { code, name } = matches[i]
    const start = matches[i].index
    const end = matches[i + 1]?.index ?? raw.indexOf('Totais por Departamento')
    const block = end > start ? raw.slice(start, end) : raw.slice(start, start + 1200)

    // Salary: pattern is "VALUE Salário:" (value comes before the label)
    const salaryMatch = block.match(/([\d.,]+)Sal[aá]rio:/)
    const salaryBase = salaryMatch ? parseBR(salaryMatch[1]) : 0

    // Totals: "Proventos:VALUE Líquido:Descontos:VALUE"
    const provMatch = block.match(/Proventos:([\d.,]+)/)
    const descMatch = block.match(/Descontos:([\d.,]+)/)
    const totalProventos = provMatch ? parseBR(provMatch[1]) : 0
    const totalDescontos = descMatch ? parseBR(descMatch[1]) : 0

    // Líquido: "Informativa Dedutora:\n0VALUE" — appears after "Informativa Dedutora:"
    // Pattern: "0" + currency value on same or next line
    let liquido = totalProventos > 0 ? totalProventos - totalDescontos : 0
    const liqMatch = block.match(/Informativa Dedutora:[\s\n]*0([\d.,]+)/)
      ?? block.match(/L[íi]quido:[\s\S]{0,60}?([\d]{1,3}(?:\.\d{3})*,\d{2})/)
    if (liqMatch) {
      const v = parseBR(liqMatch[1])
      if (v > 0) liquido = v
    }

    // FGTS: "Valor FGTS:VALUE"
    const fgtsMatch = block.match(/Valor FGTS:([\d.,]+)/)
    const fgts = fgtsMatch ? parseBR(fgtsMatch[1]) : 0

    // Line items — rubrics appear like: CODE DESCRIPTION [REF] VALUE P/D
    // In the extracted text, columns are merged but we can still find patterns
    const lineItems: PayrollEmployee['lineItems'] = []

    const rubrics: [RegExp, string, 'P' | 'D'][] = [
      [/HORAS NORMAIS[\s\S]{0,30}?([\d.,]+)\s*P/i, 'Horas Normais', 'P'],
      [/FERIADO TRABALHADO[\s\S]{0,20}?([\d.,]+)\s*P/i, 'Feriado Trabalhado', 'P'],
      [/AJUDA DE CUSTO[\s\S]{0,20}?([\d.,]+)\s*P/i, 'Ajuda de Custo', 'P'],
      [/VALE ALIMENTA[CÇ][\w]*[\s\S]{0,20}?([\d.,]+)\s*P/i, 'Vale Alimentação', 'P'],
      [/HORA EXTRA[\s\S]{0,30}?([\d.,]+)\s*P/i, 'Hora Extra', 'P'],
      [/I\.N\.S\.S\.[\s\S]{0,20}?([\d.,]+)\s*D/i, 'INSS', 'D'],
      [/\bINSS\b[\s\S]{0,20}?([\d.,]+)\s*D/i, 'INSS', 'D'],
      [/VALE TRANSPORTE[\s\S]{0,20}?([\d.,]+)\s*D/i, 'Vale Transporte', 'D'],
      [/DESC\. EMP\.[\s\S]{0,30}?([\d.,]+)\s*D/i, 'Desc. Emp. Crédito Trab.', 'D'],
      [/IRRF[\s\S]{0,20}?([\d.,]+)\s*D/i, 'IRRF', 'D'],
      [/PLANO DE SA[UÚ]DE[\s\S]{0,20}?([\d.,]+)\s*D/i, 'Plano de Saúde', 'D'],
    ]

    const addedLabels = new Set<string>()
    for (const [re, label, type] of rubrics) {
      if (addedLabels.has(label)) continue
      const rm = block.match(re)
      if (rm) {
        const val = parseBR(rm[1])
        if (val > 0) {
          lineItems.push({ type, description: label, value: val })
          addedLabels.add(label)
        }
      }
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

    const text = await parsePdf(buffer)
    const employees = parseExtrato(text)

    if (employees.length === 0) {
      return NextResponse.json({
        error: 'Nenhum colaborador encontrado. Verifique se é o Extrato Mensal correto.',
        debug: text.slice(0, 600),
      }, { status: 422 })
    }

    return NextResponse.json({ employees })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao processar PDF' }, { status: 500 })
  }
}
