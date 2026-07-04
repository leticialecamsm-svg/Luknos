import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer, opts?: object) => Promise<{ text: string; numpages: number }>

export interface ReceiptEmployee {
  pageIndex: number     // 0-based page in the original PDF
  code: string
  name: string
  liquido: number
  receiptUrl: string    // public URL after upload
}

function parseBR(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

async function extractPageInfo(pageText: string): Promise<{ code: string; name: string; liquido: number } | null> {
  // Name and code: "CC: <code> Código <NAME> Nome do Funcionário"
  const meta = pageText.match(/CC:\s*(\d+)\s*C[oó]digo\s+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇA-Z\s]+?)\s+Nome do Funcion/i)
  if (!meta) return null

  const code = meta[1].trim()
  const name = meta[2].trim()

  // Liquido: appears at start of page text before "Código Descrição"
  // Pattern: "... <descontos_total> <liquido> Código Descrição"
  const beforeTable = pageText.split(/C[oó]digo\s+Descri/)[0] ?? ''
  const currencyValues = beforeTable.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) ?? []
  // The last two values before the table are: Total Descontos, Valor Líquido
  const liquido = currencyValues.length >= 2
    ? parseBR(currencyValues[currencyValues.length - 1])
    : 0

  return { code, name, liquido }
}

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await admin.storage.listBuckets()
  const exists = buckets?.some(b => b.name === 'receipts')
  if (!exists) {
    await admin.storage.createBucket('receipts', { public: true, fileSizeLimit: 10485760 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const yearStr = formData.get('year') as string
    const monthStr = formData.get('month') as string
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const year = parseInt(yearStr) || new Date().getFullYear()
    const month = parseInt(monthStr) || new Date().getMonth() + 1

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract per-page text
    const pageTexts: string[] = []
    await pdfParse(buffer, {
      pagerender(pageData: any) {
        return pageData.getTextContent().then((tc: any) => {
          const text = tc.items.map((i: any) => i.str).join(' ')
          pageTexts.push(text)
          return text
        })
      },
    })

    if (pageTexts.length === 0) {
      return NextResponse.json({ error: 'PDF sem páginas legíveis' }, { status: 422 })
    }

    // Parse each page
    const pageInfos = await Promise.all(pageTexts.map(extractPageInfo))

    // Split PDF with pdf-lib
    const srcDoc = await PDFDocument.load(arrayBuffer)
    const admin = createAdminClient()
    await ensureBucket(admin)

    const results: ReceiptEmployee[] = []

    for (let i = 0; i < pageTexts.length; i++) {
      const info = pageInfos[i]
      if (!info) continue

      // Create a new PDF with just this employee's page
      const newDoc = await PDFDocument.create()
      const [copiedPage] = await newDoc.copyPages(srcDoc, [i])
      newDoc.addPage(copiedPage)
      const pdfBytes = await newDoc.save()

      // Upload to Supabase Storage
      const path = `${year}/${month}/${info.code}_${info.name.replace(/\s+/g, '_').slice(0, 40)}.pdf`
      const { error: uploadError } = await admin.storage
        .from('receipts')
        .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })

      if (uploadError) {
        console.error('Upload error for', info.name, uploadError.message)
        continue
      }

      const { data: { publicUrl } } = admin.storage.from('receipts').getPublicUrl(path)

      results.push({ pageIndex: i, ...info, receiptUrl: publicUrl })
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'Nenhum colaborador identificado no PDF.' }, { status: 422 })
    }

    return NextResponse.json({ employees: results })
  } catch (err: any) {
    console.error('split-receipts error:', err)
    return NextResponse.json({ error: err.message ?? 'Erro ao processar PDF' }, { status: 500 })
  }
}
