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

  const match = fullText.match(/Total\s+do\s+Or[cç]amento[:\s]+R\$\s*([\d.,]+)/i)
  if (!match) return null

  const numeric = parseFloat(match[1].replace(/\./g, '').replace(',', '.'))
  return isNaN(numeric) || numeric <= 0 ? null : numeric
}
