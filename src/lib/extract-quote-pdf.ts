'use client'

// Extração client-side do "Total do Orçamento" de PDFs gerados pelo
// Master Lojista. Usa pdfjs-dist para ler o texto sem passar pelo servidor.

export async function extractQuoteValueFromPdf(file: File): Promise<number | null> {
  const pdfjsLib = await import('pdfjs-dist')

  // Worker via CDN — evita bundling pesado no cliente
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map((item: any) => item.str).join(' ') + '\n'
  }

  return parseQuoteTotal(fullText)
}

function toNumber(raw: string): number | null {
  const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(n) || n <= 0 ? null : n
}

// Procura o total do PDF. Vale o ÚLTIMO "Total do Orçamento" (o de cada ambiente
// vem antes); depois tenta variações comuns de rótulo.
export function parseQuoteTotal(text: string): number | null {
  const flat = text.replace(/\s+/g, ' ')
  const patterns = [
    /Total\s+do\s+Or[cç]amento\s*[:\-]?\s*R\$\s*([\d.]+,\d{2})/gi,
    /Total\s+Geral\s*[:\-]?\s*R\$\s*([\d.]+,\d{2})/gi,
    /Valor\s+Total\s*[:\-]?\s*R\$\s*([\d.]+,\d{2})/gi,
  ]
  for (const re of patterns) {
    const all = Array.from(flat.matchAll(re))
    if (all.length) {
      const v = toNumber(all[all.length - 1][1])
      if (v != null) return v
    }
  }
  return null
}
