import { Fragment } from 'react'
import { parseWhatsApp, type Block, type Inline } from '@/lib/wa-format'

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text': return <Fragment key={i}>{n.v}</Fragment>
      case 'b': return <strong key={i} className="font-semibold">{renderInline(n.c)}</strong>
      case 'i': return <em key={i}>{renderInline(n.c)}</em>
      case 's': return <s key={i}>{renderInline(n.c)}</s>
      case 'code': return <code key={i} className="font-mono text-[0.85em] bg-black/5 rounded px-1">{n.v}</code>
      case 'link': return <a key={i} href={n.v} target="_blank" rel="noopener noreferrer" className="underline text-blue-700 break-all">{n.v}</a>
    }
  })
}

// Mostra o texto de uma mensagem com a formatação do WhatsApp (React escapa o HTML).
export function WaText({ text }: { text: string }) {
  const blocks: Block[] = parseWhatsApp(text)
  return (
    <div className="space-y-0.5 break-words">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p': return <p key={i} className="whitespace-pre-wrap min-h-[1em]">{renderInline(b.c)}</p>
          case 'mono': return <pre key={i} className="font-mono text-[0.85em] bg-black/5 rounded px-2 py-1 whitespace-pre-wrap">{b.v}</pre>
          case 'quote': return <blockquote key={i} className="border-l-4 border-black/20 pl-2 text-gray-600">{renderInline(b.c)}</blockquote>
          case 'li': return (
            <p key={i} className="flex gap-1.5 pl-1"><span className="shrink-0">{b.n === null ? '•' : `${b.n}.`}</span><span>{renderInline(b.c)}</span></p>
          )
        }
      })}
    </div>
  )
}
