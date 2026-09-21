import {
  Target, Lightbulb, Eye, Sun, ShieldAlert, Zap, HelpCircle, ClipboardCheck, Quote, Ruler, Palette, Thermometer,
  Layers, Droplets, Sparkles, Wrench, ListChecks, AlertTriangle, Hand, Compass, MessageCircle, Gauge, Plug, Home, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// As aulas de texto são guardadas como texto simples (títulos em CAIXA ALTA,
// listas com "-", passos com "1.", checklist com "☐"). Este componente lê essa
// convenção e desenha a aula com hierarquia: seções em cartões com ícone,
// cartões de objetivo/prática/alerta, passos numerados e listas em grade.

type Block =
  | { t: 'p'; text: string }
  | { t: 'quote'; text: string }
  | { t: 'bullets'; items: string[] }
  | { t: 'steps'; items: string[] }
  | { t: 'check'; items: string[] }
type Section = { title: string | null; blocks: Block[] }

const ACRONYMS = new Set(['IRC', 'LED', 'CCT', 'IP', 'CA', 'CC', 'UGR', 'FP', 'NBR', 'ISO', 'K', 'V', 'W', 'A', 'DR', 'TV', 'SKU', 'NCM', 'PDF', 'ABNT'])

function isHeading(line: string) {
  const base = line.replace(/\s*\(.*\)\s*$/, '').trim()
  return base.length >= 2 && base.length <= 64 && !/[.:;!?]$/.test(base) && /^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 ,.\-–\/°+×ºª&~]*$/.test(base)
}

const PROPER: Record<string, string> = { INMETRO: 'Inmetro', MASTERLOJISTA: 'Masterlojista', LUKNOS: 'Luknos', GOOGLE: 'Google', DRIVE: 'Drive', WHATSAPP: 'WhatsApp' }

function pretty(title: string) {
  return title.split(' ').map((w, i) => {
    if (/[a-z]/.test(w)) return w // já misto (ex.: "(kWh)", "(lm/W)")
    const m = w.match(/^(\(?)([^()]*)(\)?)$/)
    if (!m) return w
    const [, open, core, close] = m
    const wrapped = !!(open || close)
    if (PROPER[core]) return open + PROPER[core] + close
    if (/^\d/.test(core) || /^~/.test(core) || /^[A-Z]{1,4}-?\d+$/.test(core)) return w
    if (core === 'A' && i > 0 && !wrapped) return 'a'
    if (ACRONYMS.has(core) && (core !== 'A' || wrapped || i === 0)) return w
    if (wrapped && core.length <= 4) return w
    const lower = core.toLowerCase()
    return open + (i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower) + close
  }).join(' ')
}

function parse(body: string): Section[] {
  const lines = body.replace(/\r/g, '').split('\n')
  const sections: Section[] = [{ title: null, blocks: [] }]
  let para: string[] = []
  let list: { t: 'bullets' | 'steps' | 'check'; items: string[] } | null = null
  const cur = () => sections[sections.length - 1]
  const flushPara = () => {
    if (!para.length) return
    const text = para.join(' ').trim()
    cur().blocks.push(/^[“"].+[”"]$/.test(text) ? { t: 'quote', text: text.replace(/^[“"]|[”"]$/g, '') } : { t: 'p', text })
    para = []
  }
  const flushList = () => { if (list) { cur().blocks.push(list); list = null } }
  const flush = () => { flushPara(); flushList() }

  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) { flush(); return }
    const prevBlank = i === 0 || !lines[i - 1].trim()
    if (prevBlank && isHeading(line)) { flush(); sections.push({ title: line, blocks: [] }); return }
    if (/^PARE E ENCAMINHE /.test(line) && prevBlank) { flush(); sections.push({ title: 'PARE E ENCAMINHE', blocks: [] }); para.push(line.replace(/^PARE E ENCAMINHE\s*/, '')); return }
    const bullet = line.match(/^[-•]\s+(.*)/)
    const step = line.match(/^\d+[.)]\s+(.*)/)
    const check = line.match(/^☐\s*(.*)/)
    const kind = bullet ? 'bullets' : step ? 'steps' : check ? 'check' : null
    if (kind) {
      flushPara()
      if (list && list.t !== kind) flushList()
      if (!list) list = { t: kind, items: [] }
      list.items.push((bullet ?? step ?? check)![1])
      return
    }
    flushList()
    para.push(line)
  })
  flush()
  // O cartão de objetivo leva só o 1º parágrafo; a introdução que vem depois
  // (sem título) vira uma seção própria.
  const out: Section[] = []
  for (const s of sections) {
    if (s.title && toneOf(s.title) === 'goal' && s.blocks.length > 1) {
      out.push({ title: s.title, blocks: s.blocks.slice(0, 1) }, { title: null, blocks: s.blocks.slice(1) })
    } else out.push(s)
  }
  return out.filter(s => s.title || s.blocks.length)
}

type Tone = 'plain' | 'goal' | 'practice' | 'warn' | 'rule' | 'say'
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

function toneOf(title: string | null): Tone {
  if (!title) return 'plain'
  const t = norm(title)
  if (t.startsWith('OBJETIVO')) return 'goal'
  if (t.startsWith('NA PRATICA')) return 'practice'
  if (/^(NUNCA PROMETA|O QUE NAO DIZER|ATENCAO|SEU LIMITE|PARE E ENCAMINHE|EM UMA DEMONSTRACAO|SIMBOLO NAO E PRODUTO)/.test(t)) return 'warn'
  if (t.startsWith('REGRA DE OURO')) return 'rule'
  if (/^(FRASE QUE AJUDA|O QUE DIZER|COMO EXPLICAR)/.test(t)) return 'say'
  return 'plain'
}

const ICONS: [RegExp, typeof Sun][] = [
  [/LUZ (QUENTE|FRIA)|TEMPERATURA|KELVIN|^\d{4} K|ACIMA DE/, Thermometer],
  [/IRC|COR/, Palette],
  [/FACHO|DISTANCIA|LUX|LUMEN/, Ruler],
  [/WATT|POTENCIA|TENSAO|CORRENTE|ENERGIA|ELETRIC|CA E CC|FATOR/, Zap],
  [/^IP|AGUA|UMID|EXTERN/, Droplets],
  [/PERGUNTAS|DUVIDA/, HelpCircle],
  [/CHECKLIST|CONFERENCIA|METODO|ORDEM DE LEITURA/, ListChecks],
  [/OFUSC|CONFORTO|LUZ (DIRETA|INDIRETA|DIFUSA)|CINCO FUNCOES/, Eye],
  [/DIMER|COMANDO|CIRCUITO|CENA|INTERRUPTOR/, Lightbulb],
  [/PERFIL|DIFUSOR|LAMPADAS|LUMINARIAS|EMBUTIR|INTEGRADA|FITA/, Layers],
  [/NR-10|SEGURANCA|RISCO/, ShieldAlert],
  [/ORCAMENTO|PREMISSAS|QUANTITATIVO/, ClipboardCheck],
  [/VERSAO|PLANTA|LEGENDA/, Compass],
  [/PRATICA/, Hand],
  [/EXPLICAR|DIZER|FRASE/, MessageCircle],
  [/EFICIENCIA|SELO|INMETRO|NORMA/, Gauge],
  [/INSTALA|CONEX/, Plug],
  [/SALA|AMBIENTE|CASA/, Home],
  [/BUSCA|PESQUISA/, Search],
]
function iconFor(title: string): typeof Sun {
  const t = norm(title)
  return ICONS.find(([re]) => re.test(t))?.[1] ?? Sparkles
}

function Blocks({ blocks, invert }: { blocks: Block[]; invert?: boolean }) {
  const text = invert ? 'text-white/85' : 'text-gray-700'
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i} className={cn('text-[15px] leading-7', text)}>{b.text}</p>
        if (b.t === 'quote') return (
          <blockquote key={i} className="flex gap-3 rounded-xl bg-white/70 border border-surface-border p-4">
            <Quote className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
            <p className="text-[15px] leading-7 italic text-navy">“{b.text}”</p>
          </blockquote>
        )
        if (b.t === 'steps') return (
          <ol key={i} className="space-y-2">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-3 items-start">
                <span className={cn('w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5', invert ? 'bg-brand-500 text-navy' : 'bg-navy text-white')}>{j + 1}</span>
                <span className={cn('text-[15px] leading-7', text)}>{it}</span>
              </li>
            ))}
          </ol>
        )
        if (b.t === 'check') return (
          <ul key={i} className="grid sm:grid-cols-2 gap-2">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5 items-start rounded-xl border border-surface-border bg-white p-3">
                <span className="w-5 h-5 rounded-md border-2 border-brand-500 shrink-0 mt-0.5" />
                <span className="text-sm leading-6 text-gray-700">{it}</span>
              </li>
            ))}
          </ul>
        )
        // bullets: "Rótulo: texto" vira cartão com destaque; o resto vira lista simples
        const labeled = b.items.every(it => /^[^:]{2,42}:\s+\S/.test(it))
        return labeled ? (
          <ul key={i} className="grid sm:grid-cols-2 gap-2.5">
            {b.items.map((it, j) => {
              const [label, ...rest] = it.split(/:\s+/)
              return (
                <li key={j} className={cn('rounded-xl border p-3.5', invert ? 'border-white/15 bg-white/5' : 'border-surface-border bg-surface-secondary')}>
                  <p className={cn('text-sm font-semibold', invert ? 'text-brand-200' : 'text-navy')}>{label}</p>
                  <p className={cn('text-sm leading-6 mt-0.5', invert ? 'text-white/80' : 'text-gray-600')}>{(() => { const t = rest.join(': '); return t.charAt(0).toUpperCase() + t.slice(1) })()}</p>
                </li>
              )
            })}
          </ul>
        ) : (
          <ul key={i} className="space-y-1.5">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5 items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-2.5" />
                <span className={cn('text-[15px] leading-7', text)}>{it}</span>
              </li>
            ))}
          </ul>
        )
      })}
    </div>
  )
}

const TONE_STYLE: Record<Tone, { box: string; badge: string; title: string; icon?: typeof Sun; label?: string }> = {
  plain:    { box: 'bg-white border-surface-border', badge: 'bg-brand-50 text-brand-700', title: 'text-navy' },
  goal:     { box: 'bg-gradient-to-br from-brand-50 to-white border-brand-200', badge: 'bg-brand-500 text-white', title: 'text-brand-700', icon: Target, label: 'Objetivo da aula' },
  practice: { box: 'bg-gradient-navy border-transparent', badge: 'bg-brand-500 text-navy', title: 'text-white', icon: Hand, label: 'Na prática hoje' },
  warn:     { box: 'bg-amber-50 border-amber-200', badge: 'bg-amber-500 text-white', title: 'text-amber-900', icon: AlertTriangle },
  rule:     { box: 'bg-brand-50 border-brand-500', badge: 'bg-brand-500 text-white', title: 'text-brand-700', icon: Sparkles, label: 'Regra de ouro' },
  say:      { box: 'bg-blue-50 border-blue-200', badge: 'bg-blue-600 text-white', title: 'text-blue-900', icon: MessageCircle },
}

export function RichBody({ body }: { body: string }) {
  const sections = parse(body)
  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        const tone = toneOf(s.title)
        const st = TONE_STYLE[tone]
        const Icon = st.icon ?? (s.title ? iconFor(s.title) : null)
        const title = st.label ?? (s.title ? pretty(s.title) : null)
        const invert = tone === 'practice'
        return (
          <section key={i} className={cn('rounded-card border p-5 sm:p-6', st.box)}>
            {title && Icon && (
              <div className="flex items-center gap-3 mb-3">
                <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', st.badge)}><Icon className="w-[18px] h-[18px]" /></span>
                <h2 className={cn('text-base sm:text-lg font-semibold leading-tight', st.title)}>{title}</h2>
              </div>
            )}
            <Blocks blocks={s.blocks} invert={invert} />
          </section>
        )
      })}
    </div>
  )
}
