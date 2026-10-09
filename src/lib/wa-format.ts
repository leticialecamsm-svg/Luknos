// Formatação de texto do WhatsApp: *negrito*, _itálico_, ~riscado~, `código`,
// ```monoespaçado```, listas ("- " e "1. ") e citação ("> ").
// Duas partes puras (sem React): applyFormat (botões do editor) e parseWhatsApp (exibição).

export type FormatKind = 'bold' | 'italic' | 'strike' | 'code' | 'mono' | 'bullet' | 'numbered' | 'quote'

export interface Edit { value: string; start: number; end: number }

const WRAP: Record<'bold' | 'italic' | 'strike' | 'code' | 'mono', string> = {
  bold: '*', italic: '_', strike: '~', code: '`', mono: '```',
}

// Aplica (ou remove) a formatação na seleção. Sem seleção, insere os marcadores
// e deixa o cursor no meio.
export function applyFormat(value: string, start: number, end: number, kind: FormatKind): Edit {
  if (kind === 'bullet' || kind === 'numbered' || kind === 'quote') return applyLinePrefix(value, start, end, kind)

  const m = WRAP[kind]
  let a = Math.min(start, end)
  let b = Math.max(start, end)

  // espaços nas pontas ficam FORA dos marcadores (o WhatsApp não formata "* texto *")
  while (a < b && /\s/.test(value[a])) a++
  while (b > a && /\s/.test(value[b - 1])) b--

  const before = value.slice(0, a)
  const sel = value.slice(a, b)
  const after = value.slice(b)

  if (sel === '') {
    const ins = m + m
    return { value: before + ins + after, start: a + m.length, end: a + m.length }
  }
  // já formatado por fora da seleção → remove (alternar)
  if (before.endsWith(m) && after.startsWith(m)) {
    return { value: before.slice(0, -m.length) + sel + after.slice(m.length), start: a - m.length, end: b - m.length }
  }
  // já formatado por dentro da seleção → remove
  if (sel.length > m.length * 2 && sel.startsWith(m) && sel.endsWith(m)) {
    const inner = sel.slice(m.length, -m.length)
    return { value: before + inner + after, start: a, end: a + inner.length }
  }
  return { value: before + m + sel + m + after, start: a + m.length, end: b + m.length }
}

function applyLinePrefix(value: string, start: number, end: number, kind: 'bullet' | 'numbered' | 'quote'): Edit {
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  const lineStart = value.lastIndexOf('\n', lo - 1) + 1
  const nl = value.indexOf('\n', hi)
  const lineEnd = nl === -1 ? value.length : nl
  const lines = value.slice(lineStart, lineEnd).split('\n')

  const re = kind === 'bullet' ? /^- / : kind === 'quote' ? /^> / : /^\d+\. /
  const all = lines.every((l) => re.test(l))
  const out = lines.map((l, i) => {
    if (all) return l.replace(re, '')
    const clean = l.replace(/^(- |> |\d+\. )/, '')
    return (kind === 'bullet' ? '- ' : kind === 'quote' ? '> ' : `${i + 1}. `) + clean
  })
  const block = out.join('\n')
  return { value: value.slice(0, lineStart) + block + value.slice(lineEnd), start: lineStart, end: lineStart + block.length }
}

// ─── Exibição ────────────────────────────────────────────────────────────────

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i' | 's'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string }

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'mono'; v: string }
  | { t: 'quote'; c: Inline[] }
  | { t: 'li'; n: number | null; c: Inline[] }

const URL_AT = /^https?:\/\/[^\s<>"')\]]+/i

// Marcador de abertura válido: no começo ou depois de espaço/pontuação, e seguido de não-espaço.
function findClose(s: string, from: number, m: string): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === m && i > from && !/\s/.test(s[i - 1]) && s[i - 1] !== m) return i
  }
  return -1
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = '' } }
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    const rest = s.slice(i)
    const link = URL_AT.exec(rest)
    if (link && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      const url = link[0].replace(/[.,;:!?]+$/, '')
      flush(); out.push({ t: 'link', v: url }); i += url.length; continue
    }
    if ('*_~`'.includes(ch)) {
      const prevOk = i === 0 || /[\s([{>*_~]/.test(s[i - 1])
      const nextOk = i + 1 < s.length && !/\s/.test(s[i + 1]) && s[i + 1] !== ch
      if (prevOk && nextOk) {
        const close = findClose(s, i + 1, ch)
        if (close !== -1) {
          const inner = s.slice(i + 1, close)
          flush()
          if (ch === '`') out.push({ t: 'code', v: inner })
          else out.push({ t: ch === '*' ? 'b' : ch === '_' ? 'i' : 's', c: parseInline(inner) })
          i = close + 1
          continue
        }
      }
    }
    buf += ch
    i++
  }
  flush()
  return out
}

export function parseWhatsApp(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.split('\n')
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (line.trimStart().startsWith('```')) {
      // bloco monoespaçado ```...``` (pode abrir e fechar na mesma linha ou em linhas diferentes)
      const first = line.trimStart().slice(3)
      const sameLine = first.indexOf('```')
      if (sameLine !== -1) { blocks.push({ t: 'mono', v: first.slice(0, sameLine) }); continue }
      const body = [first]
      let j = idx + 1
      let closed = false
      for (; j < lines.length; j++) {
        const k = lines[j].indexOf('```')
        if (k !== -1) { body.push(lines[j].slice(0, k)); closed = true; break }
        body.push(lines[j])
      }
      if (closed) { blocks.push({ t: 'mono', v: body.join('\n').replace(/^\n/, '') }); idx = j; continue }
    }
    const q = /^> ?(.*)$/.exec(line)
    if (q) { blocks.push({ t: 'quote', c: parseInline(q[1]) }); continue }
    const b = /^[-*] (.*)$/.exec(line)
    if (b && !/^\*[^\s]/.test(line)) { blocks.push({ t: 'li', n: null, c: parseInline(b[1]) }); continue }
    const n = /^(\d+)\. (.*)$/.exec(line)
    if (n) { blocks.push({ t: 'li', n: Number(n[1]), c: parseInline(n[2]) }); continue }
    blocks.push({ t: 'p', c: parseInline(line) })
  }
  return blocks
}

function flatten(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === 'text' || n.t === 'code' || n.t === 'link' ? n.v : flatten(n.c))).join('')
}

// Texto sem marcadores de formatação, para prévias de uma linha (ex.: lista de conversas).
export function stripFormatting(text: string | null | undefined): string {
  if (!text) return ''
  return parseWhatsApp(text)
    .map((b) => (b.t === 'mono' ? b.v : b.t === 'li' ? flatten(b.c) : flatten(b.c)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
