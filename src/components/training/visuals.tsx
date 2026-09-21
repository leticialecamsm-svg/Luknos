'use client'

import { useState } from 'react'
import {
  Sun, BookOpen, Frame, Lamp, Footprints, Plug, Cpu, Zap, Ruler, Home, Layers, Droplets, Eye, ShieldCheck, HelpCircle, ArrowRight,
  Gauge, Activity, Thermometer, Palette, ShieldAlert, CheckCircle2, AlertTriangle, Ban, ClipboardList, Users, Package, Truck, Heart, Wrench,
  Layout, CheckSquare, FileText, ScanSearch, TrendingUp, Inbox, Users2, GraduationCap, Cable, Lightbulb, Box,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Ilustrações desenhadas para as aulas. Cada uma ilustra UM conceito para quem
// nunca estudou iluminação. Ligadas à aula pelo título em LESSON_VISUALS.

const NAVY = '#0a1f3b'
const GOLD = '#cba455'
const GLOW = '#ffd98a'

function Figure({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <figure className="card p-4 sm:p-5">
      <p className="eyebrow mb-3">{title}</p>
      {children}
      {caption && <figcaption className="text-xs text-gray-500 mt-3 leading-5">{caption}</figcaption>}
    </figure>
  )
}

function Flow({ steps }: { steps: { icon: typeof Sun; title: string; text?: string }[] }) {
  return (
    <ol className="grid gap-2.5 sm:grid-flow-col sm:auto-cols-fr">
      {steps.map((s, i) => (
        <li key={i} className="relative rounded-xl border border-surface-border bg-surface-secondary p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-8 h-8 rounded-lg bg-navy text-white flex items-center justify-center shrink-0"><s.icon className="w-4 h-4" /></span>
            <span className="text-[11px] font-bold text-brand-700">{i + 1}</span>
          </div>
          <p className="text-sm font-semibold text-navy leading-tight">{s.title}</p>
          {s.text && <p className="text-xs text-gray-500 mt-1 leading-5">{s.text}</p>}
        </li>
      ))}
    </ol>
  )
}

function Tiles({ items, cols = 'sm:grid-cols-3' }: { items: { icon?: typeof Sun; big?: string; title: string; text: string; tone?: string }[]; cols?: string }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-2.5', cols)}>
      {items.map((it, i) => (
        <li key={i} className="rounded-xl border border-surface-border bg-white p-3.5">
          <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2 font-bold text-sm', it.tone ?? 'bg-brand-50 text-brand-700')}>
            {it.big ?? (it.icon && <it.icon className="w-5 h-5" />)}
          </span>
          <p className="text-sm font-semibold text-navy leading-tight">{it.title}</p>
          <p className="text-xs text-gray-500 mt-1 leading-5">{it.text}</p>
        </li>
      ))}
    </ul>
  )
}

// ─── 1. Camadas de luz ─────────────────────────────────────────────────────
function Layers5() {
  return (
    <Figure title="As 5 funções da luz numa sala" caption="Uma sala bem iluminada combina várias funções. Um único ponto no centro não faz tudo isso.">
      <svg viewBox="0 0 720 250" className="w-full h-auto rounded-xl bg-[#101d38]" role="img" aria-label="Sala com luz geral, de tarefa, de destaque, decorativa e de orientação">
        <defs>
          <radialGradient id="g1"><stop offset="0" stopColor={GLOW} stopOpacity=".85" /><stop offset="1" stopColor={GLOW} stopOpacity="0" /></radialGradient>
          <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GLOW} stopOpacity=".7" /><stop offset="1" stopColor={GLOW} stopOpacity="0" /></linearGradient>
        </defs>
        <rect x="0" y="200" width="720" height="50" fill="#1b2b4d" />
        <ellipse cx="360" cy="40" rx="230" ry="70" fill="url(#g1)" opacity=".55" />
        <rect x="330" y="26" width="60" height="9" rx="4" fill="#e8e8ee" />
        <rect x="70" y="60" width="90" height="70" fill="#233559" stroke={GOLD} strokeWidth="3" />
        <path d="M95 118 L115 86 L130 104 L142 92 L150 118 Z" fill="#5b7bb5" />
        <polygon points="100,18 130,18 175,150 55,150" fill="url(#cone)" transform="translate(-20 2)" />
        <rect x="105" y="10" width="20" height="10" rx="3" fill="#e8e8ee" transform="translate(-20 0)" />
        <rect x="260" y="150" width="200" height="50" rx="10" fill="#3a4d7a" />
        <rect x="250" y="135" width="30" height="65" rx="8" fill="#455a8c" />
        <rect x="440" y="135" width="30" height="65" rx="8" fill="#455a8c" />
        <rect x="560" y="60" width="4" height="140" fill="#c9c9d3" />
        <path d="M535 62 L590 62 L578 84 L547 84 Z" fill="#e8e8ee" />
        <polygon points="547,84 578,84 610,200 515,200" fill="url(#cone)" opacity=".8" />
        <circle cx="500" cy="196" r="7" fill={GLOW} />
        <circle cx="640" cy="196" r="7" fill={GLOW} />
        <rect x="205" y="196" width="18" height="4" rx="2" fill={GLOW} />
        <g fontSize="13" fontWeight="700" fill="#fff">
          <g transform="translate(360 108)"><circle r="12" fill={GOLD} /><text x="0" y="5" textAnchor="middle" fill={NAVY}>1</text></g>
          <g transform="translate(590 150)"><circle r="12" fill={GOLD} /><text x="0" y="5" textAnchor="middle" fill={NAVY}>2</text></g>
          <g transform="translate(120 160)"><circle r="12" fill={GOLD} /><text x="0" y="5" textAnchor="middle" fill={NAVY}>3</text></g>
          <g transform="translate(360 24)"><circle r="12" fill={GOLD} /><text x="0" y="5" textAnchor="middle" fill={NAVY}>4</text></g>
          <g transform="translate(214 176)"><circle r="12" fill={GOLD} /><text x="0" y="5" textAnchor="middle" fill={NAVY}>5</text></g>
        </g>
      </svg>
      <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
        {[
          { i: Sun, n: '1. Geral', t: 'Enxergar o ambiente' },
          { i: BookOpen, n: '2. Tarefa', t: 'Ler, cozinhar, trabalhar' },
          { i: Frame, n: '3. Destaque', t: 'Quadro, planta, textura' },
          { i: Lamp, n: '4. Decorativa', t: 'A peça faz parte do visual' },
          { i: Footprints, n: '5. Orientação', t: 'Escada e corredor à noite' },
        ].map(x => (
          <li key={x.n} className="rounded-xl bg-surface-secondary border border-surface-border p-2.5">
            <x.i className="w-4 h-4 text-brand-700 mb-1" />
            <p className="text-xs font-semibold text-navy">{x.n}</p>
            <p className="text-[11px] text-gray-500 leading-4 mt-0.5">{x.t}</p>
          </li>
        ))}
      </ul>
    </Figure>
  )
}

// ─── 2. Direta, indireta, difusa ───────────────────────────────────────────
function Paths3() {
  const panel = 'rounded-xl bg-[#101d38] w-full h-auto'
  return (
    <Figure title="Como a luz chega até você" caption="Direta: vai direto ao alvo. Indireta: bate no teto ou na parede e volta suave. Difusa: passa por um acrílico e se espalha.">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <svg viewBox="0 0 220 180" className={panel} role="img" aria-label="Luz direta">
            <rect x="0" y="0" width="220" height="14" fill="#1b2b4d" /><rect x="90" y="14" width="40" height="10" rx="4" fill="#e8e8ee" />
            <polygon points="100,24 120,24 160,140 60,140" fill={GLOW} opacity=".4" />
            <rect x="55" y="140" width="110" height="10" rx="3" fill="#8a6b3a" /><rect x="65" y="150" width="6" height="28" fill="#8a6b3a" /><rect x="149" y="150" width="6" height="28" fill="#8a6b3a" />
            <ellipse cx="110" cy="128" rx="14" ry="7" fill="#000" opacity=".35" />
            <circle cx="110" cy="118" r="10" fill="#c9c9d3" />
          </svg>
          <p className="text-sm font-semibold text-navy mt-2">Direta</p>
          <p className="text-xs text-gray-500 leading-5">Destaque e sombra marcada. Bom para mesa, bancada e quadro.</p>
        </div>
        <div>
          <svg viewBox="0 0 220 180" className={panel} role="img" aria-label="Luz indireta">
            <rect x="0" y="0" width="220" height="14" fill="#1b2b4d" />
            <rect x="60" y="30" width="100" height="6" rx="3" fill="#e8e8ee" />
            <path d="M85 30 Q110 6 135 30" stroke={GLOW} strokeWidth="3" fill="none" strokeDasharray="5 4" />
            <path d="M75 30 Q60 60 50 110" stroke={GLOW} strokeWidth="2.5" fill="none" opacity=".7" />
            <path d="M145 30 Q160 60 170 110" stroke={GLOW} strokeWidth="2.5" fill="none" opacity=".7" />
            <ellipse cx="110" cy="8" rx="80" ry="20" fill={GLOW} opacity=".25" />
            <rect x="55" y="140" width="110" height="10" rx="3" fill="#8a6b3a" /><rect x="65" y="150" width="6" height="28" fill="#8a6b3a" /><rect x="149" y="150" width="6" height="28" fill="#8a6b3a" />
            <ellipse cx="110" cy="132" rx="34" ry="5" fill="#000" opacity=".12" />
            <circle cx="110" cy="122" r="10" fill="#c9c9d3" />
          </svg>
          <p className="text-sm font-semibold text-navy mt-2">Indireta</p>
          <p className="text-xs text-gray-500 leading-5">Reflete em outra superfície. Suave e acolhedora (sancas, cortineiros).</p>
        </div>
        <div>
          <svg viewBox="0 0 220 180" className={panel} role="img" aria-label="Luz difusa">
            <rect x="0" y="0" width="220" height="14" fill="#1b2b4d" />
            <path d="M80 30 Q110 4 140 30 Z" fill="#f3f3f8" opacity=".9" />
            {[[70, 60], [90, 80], [110, 90], [130, 80], [150, 60], [60, 100], [160, 100]].map(([x, y], i) => (
              <line key={i} x1="110" y1="30" x2={x + (x - 110) * 0.5} y2={y + 50} stroke={GLOW} strokeWidth="2" opacity=".55" />
            ))}
            <ellipse cx="110" cy="110" rx="80" ry="60" fill={GLOW} opacity=".12" />
            <rect x="55" y="140" width="110" height="10" rx="3" fill="#8a6b3a" /><rect x="65" y="150" width="6" height="28" fill="#8a6b3a" /><rect x="149" y="150" width="6" height="28" fill="#8a6b3a" />
            <ellipse cx="110" cy="132" rx="30" ry="4" fill="#000" opacity=".1" />
            <circle cx="110" cy="122" r="10" fill="#c9c9d3" />
          </svg>
          <p className="text-sm font-semibold text-navy mt-2">Difusa</p>
          <p className="text-xs text-gray-500 leading-5">O difusor espalha e suaviza sombras, mas retém parte da luz.</p>
        </div>
      </div>
    </Figure>
  )
}

// ─── 3. Descobrir a necessidade ────────────────────────────────────────────
function Discovery() {
  return (
    <Figure title="A conversa antes do produto" caption="Só depois dessas 7 respostas faz sentido falar de modelo e preço.">
      <Flow steps={[
        { icon: Home, title: 'Ambiente e uso', text: 'O que acontece ali?' },
        { icon: Users, title: 'Quem usa', text: 'E em que horários?' },
        { icon: Ruler, title: 'Medidas', text: 'Área e pé-direito' },
        { icon: Layers, title: 'Teto', text: 'Laje, gesso, madeira' },
        { icon: Zap, title: 'Tensão', text: '127 V, 220 V ou bivolt' },
        { icon: Droplets, title: 'Umidade', text: 'Área externa ou molhada?' },
        { icon: Heart, title: 'Sensação', text: 'Aconchego, foco, cena' },
      ]} />
    </Figure>
  )
}

// ─── 4. Lúmen, lux, watt ───────────────────────────────────────────────────
function LmLuxW() {
  return (
    <Figure title="Três medidas, três perguntas diferentes" caption="Comparar lâmpadas só pelo watt é como escolher um carro só pelo tamanho do tanque.">
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { i: Plug, big: 'W', n: 'Watt', q: 'Quanta energia gasta?', t: 'Consumo elétrico. Não diz quanta luz sai.', c: 'bg-slate-100 text-slate-700' },
          { i: Lightbulb, big: 'lm', n: 'Lúmen', q: 'Quanta luz a lâmpada emite?', t: 'A luz total que sai da fonte, para todos os lados.', c: 'bg-amber-100 text-amber-700' },
          { i: Layout, big: 'lx', n: 'Lux', q: 'Quanta luz chega na superfície?', t: 'Lúmens por m². Depende de distância, facho e cores.', c: 'bg-brand-100 text-brand-700' },
        ].map(x => (
          <div key={x.n} className="rounded-xl border border-surface-border bg-white p-4">
            <span className={cn('w-11 h-11 rounded-xl flex items-center justify-center font-bold', x.c)}>{x.big}</span>
            <p className="font-semibold text-navy mt-2">{x.n}</p>
            <p className="text-sm text-brand-700 font-medium leading-tight">{x.q}</p>
            <p className="text-xs text-gray-500 mt-1 leading-5">{x.t}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-navy text-white text-center text-sm py-2.5 font-medium tracking-wide">lux = lúmens ÷ metros quadrados</p>
    </Figure>
  )
}

// ─── 5. Quanta luz precisa ─────────────────────────────────────────────────
function HowMuch() {
  return (
    <Figure title="Exemplo de conta (só para entender a lógica)" caption="Valores de exemplo, não são valores de norma. Para o lux recomendado de cada atividade, consulte a NBR ISO 8995-1 e o projetista.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg bg-surface-secondary border border-surface-border px-3 py-2"><b className="text-navy">10 m²</b><br /><span className="text-xs text-gray-500">área do ambiente</span></span>
        <span className="font-bold text-gray-400">×</span>
        <span className="rounded-lg bg-surface-secondary border border-surface-border px-3 py-2"><b className="text-navy">100 lux</b><br /><span className="text-xs text-gray-500">meta de exemplo</span></span>
        <span className="font-bold text-gray-400">=</span>
        <span className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2"><b className="text-brand-700">1.000 lm</b><br /><span className="text-xs text-gray-500">que precisam chegar no plano</span></span>
      </div>
      <p className="text-xs text-gray-500 mt-3 leading-5">Na prática, parte da luz se perde (difusor, cor das paredes, altura, sujeira). Por isso o projetista soma uma margem e olha o facho.</p>
    </Figure>
  )
}

// ─── 6. Escala Kelvin ──────────────────────────────────────────────────────
function Kelvin() {
  const stops = [
    { k: '2700 K', x: 0 }, { k: '3000 K', x: 12 }, { k: '4000 K', x: 40 }, { k: '5000 K', x: 64 }, { k: '6500 K', x: 100 },
  ]
  return (
    <Figure title="Escala de temperatura de cor" caption="Kelvin descreve a aparência da luz branca, não a intensidade. Quente e fria não dizem nada sobre luz “forte” ou “fraca”.">
      <div className="relative pt-1 pb-8">
        <div className="h-10 rounded-xl" style={{ background: 'linear-gradient(90deg,#ffb15c 0%,#ffcf8f 22%,#fff0d6 45%,#ffffff 65%,#d6e6ff 85%,#b9d4ff 100%)', border: '1px solid rgba(10,31,59,.1)' }} />
        {stops.map(s => (
          <span key={s.k} className="absolute top-12 text-[11px] font-semibold text-navy -translate-x-1/2" style={{ left: `${Math.min(94, Math.max(6, s.x))}%` }}>{s.k}</span>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Quente · 2700–3000 K</p><p className="text-xs text-amber-900/70 mt-1 leading-5">Acolhe e relaxa. Sala, quarto, jantar, decoração.</p></div>
        <div className="rounded-xl border border-surface-border bg-surface-secondary p-3"><p className="text-sm font-semibold text-navy">Neutra · 4000 K</p><p className="text-xs text-gray-600 mt-1 leading-5">Natural e confortável. Cozinha, escritório, circulação.</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-semibold text-blue-900">Fria · acima de ~5300 K</p><p className="text-xs text-blue-900/70 mt-1 leading-5">Atenção e limpeza. Use com intenção, cansa em longa permanência.</p></div>
      </div>
    </Figure>
  )
}

// ─── 7. Facho e IRC ────────────────────────────────────────────────────────
function BeamCri() {
  return (
    <Figure title="Facho e IRC" caption="A mesma luminária a 2,5 m de altura: facho de 15° ilumina cerca de 0,7 m de diâmetro; facho de 60°, cerca de 2,9 m. Já o IRC mostra se as cores parecem vivas ou apagadas.">
      <div className="grid sm:grid-cols-2 gap-3">
        <svg viewBox="0 0 360 200" className="w-full h-auto rounded-xl bg-[#101d38]" role="img" aria-label="Facho estreito e aberto">
          <rect x="0" y="176" width="360" height="24" fill="#1b2b4d" />
          {[{ x: 95, h: 26, label: '15°' }, { x: 265, h: 84, label: '60°' }].map(b => (
            <g key={b.label}>
              <rect x={b.x - 14} y="8" width="28" height="8" rx="3" fill="#e8e8ee" />
              <polygon points={`${b.x - 6},16 ${b.x + 6},16 ${b.x + b.h},176 ${b.x - b.h},176`} fill={GLOW} opacity=".35" />
              <ellipse cx={b.x} cy="176" rx={b.h} ry="5" fill={GLOW} opacity=".8" />
              <text x={b.x} y="60" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">{b.label}</text>
            </g>
          ))}
          <text x="95" y="194" textAnchor="middle" fill="#fff" fontSize="10">concentra (destaque)</text>
          <text x="265" y="194" textAnchor="middle" fill="#fff" fontSize="10">espalha (área)</text>
        </svg>
        <div className="grid grid-cols-2 gap-2">
          {[
            { n: 'IRC baixo', f: ['#b9a37a', '#a08f86', '#8f9a86', '#96a0a8'], t: 'Cores acinzentadas' },
            { n: 'IRC alto', f: ['#e2453c', '#f4a01f', '#4aa544', '#3b82f6'], t: 'Cores fiéis e vivas' },
          ].map(x => (
            <div key={x.n} className="rounded-xl border border-surface-border bg-white p-3">
              <div className="flex gap-1.5 mb-2">{x.f.map(c => <span key={c} className="w-7 h-7 rounded-full" style={{ background: c }} />)}</div>
              <p className="text-sm font-semibold text-navy">{x.n}</p>
              <p className="text-xs text-gray-500">{x.t}</p>
            </div>
          ))}
          <p className="col-span-2 text-xs text-gray-500 leading-5">Importa em roupas, alimentos, maquiagem, arte e marcenaria: onde o cliente decide pela aparência.</p>
        </div>
      </div>
    </Figure>
  )
}

// ─── 8. Famílias de produtos ───────────────────────────────────────────────
function Glyph({ kind }: { kind: string }) {
  const c = { fill: 'none', stroke: NAVY, strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 64 64" className="w-14 h-14" aria-hidden>
      {kind === 'bulbo' && <g {...c}><circle cx="32" cy="26" r="14" /><path d="M26 42h12v8H26z" /><path d="M28 54h8" /></g>}
      {kind === 'mr16' && <g {...c}><path d="M14 24h36l-6 22H20z" /><path d="M22 46v6h20v-6" /></g>}
      {kind === 'plafon' && <g {...c}><rect x="8" y="22" width="48" height="16" rx="8" /><path d="M14 46l-4 8M32 46v8M50 46l4 8" stroke={GOLD} /></g>}
      {kind === 'spot' && <g {...c}><rect x="6" y="16" width="52" height="8" rx="2" /><circle cx="32" cy="24" r="8" fill={GLOW} /><path d="M22 34l-6 14M32 34v16M42 34l6 14" stroke={GOLD} /></g>}
      {kind === 'pendente' && <g {...c}><path d="M32 6v20" /><path d="M14 46c0-14 8-20 18-20s18 6 18 20z" /><circle cx="32" cy="46" r="3" fill={GLOW} /></g>}
      {kind === 'arandela' && <g {...c}><path d="M10 8v48" /><path d="M10 22h10a14 14 0 0 1 0 20H10z" /><path d="M34 32h14" stroke={GOLD} /></g>}
      {kind === 'balizador' && <g {...c}><rect x="24" y="10" width="16" height="38" rx="3" /><path d="M28 20h8M28 26h8M28 32h8" stroke={GOLD} /><path d="M14 54h36" /></g>}
      {kind === 'perfil' && <g {...c}><rect x="6" y="26" width="52" height="12" rx="3" /><path d="M10 32h44" stroke={GOLD} strokeWidth="4" /></g>}
    </svg>
  )
}
function Families() {
  const items = [
    { k: 'bulbo', n: 'Lâmpada bulbo', t: 'Luz geral ou decorativa' },
    { k: 'mr16', n: 'MR16 / PAR / AR', t: 'Destaque, luz direcionada' },
    { k: 'plafon', n: 'Plafon / painel', t: 'Luz geral' },
    { k: 'spot', n: 'Spot / trilho', t: 'Direcionar a luz' },
    { k: 'pendente', n: 'Pendente', t: 'Luz próxima do plano e visual' },
    { k: 'arandela', n: 'Arandela', t: 'Parede e circulação' },
    { k: 'balizador', n: 'Balizador', t: 'Orientar percursos' },
    { k: 'perfil', n: 'Perfil linear + fita', t: 'Luz contínua e acabamento' },
  ]
  return (
    <Figure title="Quem faz o quê" caption="Antes de escolher pela aparência, pergunte: qual função da luz esse produto cumpre?">
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {items.map(x => (
          <li key={x.k} className="rounded-xl border border-surface-border bg-white p-3 flex flex-col items-center text-center">
            <Glyph kind={x.k} />
            <p className="text-sm font-semibold text-navy mt-1 leading-tight">{x.n}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-4">{x.t}</p>
          </li>
        ))}
      </ul>
    </Figure>
  )
}

// ─── 9. Sistema de fita LED ────────────────────────────────────────────────
function LedSystem() {
  return (
    <Figure title="Fita de LED é um sistema" caption="A fita nunca liga direto na tomada. A fonte transforma a energia da rede (CA) na tensão que a fita usa (CC).">
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        {[
          { i: Plug, t: 'Tomada / rede', s: '127 V ou 220 V (CA)', c: 'bg-slate-100 text-slate-700' },
          { i: Cpu, t: 'Fonte / driver', s: 'Converte CA em CC', c: 'bg-brand-100 text-brand-700' },
          { i: Zap, t: 'Saída 12 V ou 24 V', s: 'Tem que bater com a fita', c: 'bg-blue-100 text-blue-700' },
          { i: Lightbulb, t: 'Fita no perfil', s: 'Com difusor', c: 'bg-amber-100 text-amber-700' },
        ].map((s, i, a) => (
          <div key={s.t} className="flex sm:flex-1 items-center gap-2">
            <div className="flex-1 rounded-xl border border-surface-border bg-white p-3">
              <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-1.5', s.c)}><s.i className="w-4 h-4" /></span>
              <p className="text-sm font-semibold text-navy leading-tight">{s.t}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-4">{s.s}</p>
            </div>
            {i < a.length - 1 && <ArrowRight className="w-4 h-4 text-brand-600 shrink-0 hidden sm:block" />}
          </div>
        ))}
      </div>
      <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex gap-2 items-start"><Ban className="w-4 h-4 text-red-600 mt-0.5 shrink-0" /><p className="text-xs text-red-900 leading-5"><b>Nunca:</b> ligar fita de 12/24 V direto na tomada.</p></div>
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 flex gap-2 items-start"><CheckCircle2 className="w-4 h-4 text-green-700 mt-0.5 shrink-0" /><p className="text-xs text-green-900 leading-5"><b>Kit completo:</b> fita, fonte, perfil, difusor, conectores, cabo e acesso à fonte.</p></div>
      </div>
    </Figure>
  )
}

// ─── 10. IP ────────────────────────────────────────────────────────────────
function IpScale() {
  return (
    <Figure title="Como ler o código IP" caption="O IP é só um ponto de partida. Confirme na ficha do fabricante e com o instalador antes de indicar para banheiro, box, piso ou área externa.">
      <div className="flex items-center gap-2 mb-3">
        <span className="rounded-lg bg-navy text-white px-3 py-2 font-bold tracking-wider text-lg">IP <span className="text-brand-500">6</span> <span className="text-blue-300">5</span></span>
        <p className="text-xs text-gray-500 leading-5"><b className="text-brand-700">1º número</b>: proteção contra poeira e objetos · <b className="text-blue-600">2º número</b>: proteção contra água</p>
      </div>
      <Tiles cols="sm:grid-cols-4" items={[
        { big: 'IP20', title: 'Interno e seco', text: 'Sala, quarto. Sem proteção contra água.', tone: 'bg-slate-100 text-slate-700' },
        { big: 'IP44', title: 'Respingos', text: 'Áreas com respingo eventual, conforme ficha.', tone: 'bg-blue-50 text-blue-700' },
        { big: 'IP65', title: 'Poeira e jatos', text: 'Externo abrigado, conforme ficha.', tone: 'bg-blue-100 text-blue-800' },
        { big: 'IP67', title: 'Imersão temporária', text: 'Só se a ficha e o projeto permitirem.', tone: 'bg-blue-200 text-blue-900' },
      ]} />
    </Figure>
  )
}

// ─── 11. Unidades ──────────────────────────────────────────────────────────
function Units() {
  const u = [
    ['V', 'Tensão', 'A “pressão” elétrica', 'bg-yellow-100 text-yellow-800'], ['A', 'Corrente', 'O fluxo de cargas', 'bg-yellow-100 text-yellow-800'],
    ['W', 'Potência', 'Energia gasta agora', 'bg-yellow-100 text-yellow-800'], ['kWh', 'Consumo', 'Energia ao longo do tempo', 'bg-yellow-100 text-yellow-800'],
    ['lm', 'Lúmen', 'Luz que sai da fonte', 'bg-amber-100 text-amber-800'], ['lx', 'Lux', 'Luz que chega na superfície', 'bg-amber-100 text-amber-800'],
    ['K', 'Kelvin', 'Aparência da luz branca', 'bg-sky-100 text-sky-800'], ['IRC', 'IRC', 'Fidelidade das cores', 'bg-pink-100 text-pink-800'],
    ['IP', 'Grau IP', 'Proteção do produto', 'bg-blue-100 text-blue-800'],
  ]
  return (
    <Figure title="Cola de bolso: o que cada sigla mede" caption="Amarelo: eletricidade. Laranja: luz. Azul e rosa: aparência e proteção.">
      <ul className="grid grid-cols-3 gap-2">
        {u.map(([s, n, t, c]) => (
          <li key={s} className="rounded-xl border border-surface-border bg-white p-2.5">
            <span className={cn('inline-block rounded-lg px-2 py-1 text-sm font-bold mb-1', c)}>{s}</span>
            <p className="text-xs font-semibold text-navy leading-tight">{n}</p>
            <p className="text-[11px] text-gray-500 leading-4">{t}</p>
          </li>
        ))}
      </ul>
    </Figure>
  )
}

// ─── 12. Cenas interativas ─────────────────────────────────────────────────
function Scenes() {
  const [on, setOn] = useState({ a: true, b: false, c: false })
  const presets: { n: string; v: typeof on }[] = [
    { n: 'Receber visitas', v: { a: true, b: true, c: true } }, { n: 'Ver TV', v: { a: false, b: false, c: true } },
    { n: 'Jantar', v: { a: false, b: true, c: true } }, { n: 'Tudo apagado', v: { a: false, b: false, c: false } },
  ]
  const dark = !on.a && !on.b && !on.c
  return (
    <Figure title="Experimente: cenas com três comandos" caption="Toque nos botões. Separar a luz em grupos (A, B e C) permite criar climas diferentes no mesmo ambiente. O que precisa de infraestrutura é validado com o eletricista.">
      <svg viewBox="0 0 400 190" className="w-full h-auto rounded-xl" style={{ background: dark ? '#0b1428' : '#182a50', transition: 'background .3s' }} role="img" aria-label="Sala com três grupos de luz">
        <rect y="150" width="400" height="40" fill="#101d38" />
        <ellipse cx="200" cy="26" rx="190" ry="60" fill={GLOW} opacity={on.a ? 0.35 : 0} style={{ transition: 'opacity .3s' }} />
        <rect x="170" y="14" width="60" height="8" rx="4" fill={on.a ? '#fff3cf' : '#4b5a7d'} />
        <rect x="40" y="40" width="70" height="90" fill="#1e2f57" stroke="#31447a" /><rect x="40" y="82" width="70" height="3" fill="#31447a" />
        <rect x="42" y="84" width="66" height="3" fill={GLOW} opacity={on.b ? 1 : 0.15} style={{ transition: 'opacity .3s' }} />
        <ellipse cx="75" cy="120" rx="55" ry="30" fill={GLOW} opacity={on.b ? 0.35 : 0} style={{ transition: 'opacity .3s' }} />
        <rect x="150" y="105" width="130" height="45" rx="10" fill="#3a4d7a" />
        <rect x="140" y="92" width="24" height="58" rx="8" fill="#455a8c" /><rect x="266" y="92" width="24" height="58" rx="8" fill="#455a8c" />
        <rect x="300" y="30" width="80" height="6" rx="3" fill={on.c ? GLOW : '#4b5a7d'} style={{ transition: 'fill .3s' }} />
        <polygon points="300,36 380,36 400,150 290,150" fill={GLOW} opacity={on.c ? 0.22 : 0} style={{ transition: 'opacity .3s' }} />
        <rect x="316" y="70" width="52" height="34" rx="3" fill="#0a1f3b" stroke="#31447a" />
        <text x="12" y="20" fill="#fff" fontSize="10" opacity=".6">A geral · B estante · C indireta</text>
      </svg>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {(['a', 'b', 'c'] as const).map(k => (
          <button key={k} type="button" onClick={() => setOn(p => ({ ...p, [k]: !p[k] }))}
            className={cn('rounded-xl border py-2.5 text-sm font-semibold transition-colors', on[k] ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-surface-border text-navy hover:bg-surface-secondary')}>
            {k.toUpperCase()} {on[k] ? 'ligado' : 'desligado'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {presets.map(p => <button key={p.n} type="button" onClick={() => setOn(p.v)} className="btn-ghost text-xs">{p.n}</button>)}
      </div>
    </Figure>
  )
}

// ─── 13. Semáforo de atuação ───────────────────────────────────────────────
function Traffic() {
  return (
    <Figure title="Você orienta, confirma ou encaminha?" caption="Na dúvida, o passo seguro é confirmar ou encaminhar. Prometer sem confirmar é o erro mais caro.">
      <div className="grid sm:grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-green-200 bg-green-50 p-3.5"><CheckCircle2 className="w-5 h-5 text-green-700 mb-1.5" /><p className="text-sm font-semibold text-green-900">Posso orientar</p><p className="text-xs text-green-900/80 leading-5 mt-1">Cor da luz, facho, escolha por função, ficha técnica, compatibilidade que está escrita.</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5"><HelpCircle className="w-5 h-5 text-amber-700 mb-1.5" /><p className="text-sm font-semibold text-amber-900">Preciso confirmar</p><p className="text-xs text-amber-900/80 leading-5 mt-1">Uso em área úmida, dimerização, tensão, recorte no forro, prazo e estoque.</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5"><ShieldAlert className="w-5 h-5 text-red-700 mb-1.5" /><p className="text-sm font-semibold text-red-900">Encaminho</p><p className="text-xs text-red-900/80 leading-5 mt-1">Disjuntor, cabo, aterramento, quadro elétrico, fio exposto, cheiro de queimado, box e piso.</p></div>
      </div>
    </Figure>
  )
}

// ─── 14. Planta: símbolo não é produto ─────────────────────────────────────
function PlanLegend() {
  return (
    <Figure title="Símbolo não é produto" caption="Na planta, o círculo é só um ponto. O produto é definido pelo código e pela legenda (e pode depender do memorial).">
      <div className="grid sm:grid-cols-2 gap-3">
        <svg viewBox="0 0 260 170" className="w-full h-auto rounded-xl bg-white border border-surface-border" role="img" aria-label="Planta simples com pontos de luz">
          <rect x="16" y="16" width="228" height="138" fill="none" stroke={NAVY} strokeWidth="3" />
          <rect x="120" y="8" width="40" height="10" fill="#fff" /><text x="140" y="50" fontSize="9" fill="#6b7280" textAnchor="middle">SALA</text>
          {[[60, 70, 'L1'], [130, 70, 'L1'], [200, 70, 'L1'], [95, 122, 'L2'], [180, 122, 'L3']].map(([x, y, l], i) => (
            <g key={i}><circle cx={x as number} cy={y as number} r="11" fill="#fff" stroke={l === 'L1' ? NAVY : l === 'L2' ? GOLD : '#3b82f6'} strokeWidth="2.5" /><text x={x as number} y={(y as number) + 4} fontSize="10" fontWeight="700" textAnchor="middle" fill={NAVY}>{l as string}</text></g>
          ))}
          <path d="M60 81 L60 100 L95 100 L95 111" stroke="#9ca3af" strokeDasharray="4 3" fill="none" />
        </svg>
        <table className="w-full text-xs border border-surface-border rounded-xl overflow-hidden">
          <thead className="bg-surface-secondary text-gray-500"><tr><th className="text-left p-2">Código</th><th className="text-left p-2">O que é</th><th className="p-2">Qtd</th></tr></thead>
          <tbody className="divide-y divide-surface-border">
            <tr><td className="p-2 font-bold text-navy">L1</td><td className="p-2 text-gray-600">Spot embutir 12 W · 3000 K · 36°</td><td className="p-2 text-center">3</td></tr>
            <tr><td className="p-2 font-bold text-brand-700">L2</td><td className="p-2 text-gray-600">Pendente decorativo</td><td className="p-2 text-center">1</td></tr>
            <tr><td className="p-2 font-bold text-blue-600">L3</td><td className="p-2 text-gray-600">Arandela de parede</td><td className="p-2 text-center">1</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">Exemplo fictício, só para ilustrar a leitura.</p>
    </Figure>
  )
}

// ─── Fluxos genéricos ──────────────────────────────────────────────────────
const readingOrder = () => (
  <Figure title="Ordem de leitura de uma planta" caption="Seguir sempre a mesma ordem evita contar produto que nem estava no escopo.">
    <Flow steps={[
      { icon: FileText, title: 'Carimbo', text: 'Nome, data e revisão' }, { icon: Home, title: 'Escopo', text: 'Quais ambientes?' },
      { icon: ClipboardList, title: 'Legenda', text: 'Antes de contar' }, { icon: Eye, title: 'Símbolos', text: 'Códigos e comandos' },
      { icon: CheckSquare, title: 'Contagem', text: 'Por ambiente e por código' }, { icon: ShieldCheck, title: 'Confronto', text: 'Memorial e fichas' },
    ]} />
  </Figure>
)
const quantitative = () => (
  <Figure title="Dupla conferência do quantitativo" caption="Se as duas contagens não fecharem, volte à planta. Nunca faça média nem arredonde.">
    <Flow steps={[
      { icon: Home, title: '1ª contagem', text: 'Por ambiente, marcando cada ponto' }, { icon: Layers, title: '2ª contagem', text: 'Por código de produto' },
      { icon: Activity, title: 'Compare', text: 'Totais iguais?' }, { icon: ScanSearch, title: 'Divergiu?', text: 'Volte ao ponto da planta' },
      { icon: FileText, title: 'Registre', text: 'Revisão e data da planta' },
    ]} />
  </Figure>
)

const consultative = () => (
  <Figure title="Do atendimento à proposta" caption="Fale do benefício antes da especificação, e do preço por último.">
    <Flow steps={[
      { icon: Users, title: 'Entender', text: 'Uso, medidas, instalação' }, { icon: ShieldCheck, title: 'Conferir', text: 'Ficha e compatibilidade' },
      { icon: Layers, title: '3 opções', text: 'Boa, melhor, superior' }, { icon: Heart, title: 'Explicar', text: 'Benefício → produto' },
      { icon: ClipboardList, title: 'Premissas', text: 'O que inclui e exclui' }, { icon: CheckSquare, title: 'Dupla checagem', text: 'Técnica e comercial' },
    ]} />
  </Figure>
)

const saleToDelivery = () => (
  <Figure title="Da venda ao pós-venda" caption="Cada etapa deixa registro no sistema. Se algo falhar, avise o cliente com o próximo passo e o prazo real.">
    <Flow steps={[
      { icon: TrendingUp, title: 'Fechar venda', text: 'Valor, data real, pagamento' }, { icon: CheckSquare, title: 'Confirmar pedido', text: 'Itens, quantidades, prazo' },
      { icon: Package, title: 'Expedição', text: 'Separar com prioridade' }, { icon: Eye, title: 'Conferência', text: 'Código, tensão, acessórios' },
      { icon: Truck, title: 'Entrega / retirada', text: 'Avisar o cliente' }, { icon: Heart, title: 'Pós-venda', text: 'Ficou como esperava?' },
    ]} />
  </Figure>
)

const menuMap = () => (
  <Figure title="Mapa do sistema" caption="O que aparece no seu menu depende do seu perfil. Precisa de outra tela? Peça a liberação.">
    <Tiles cols="sm:grid-cols-5" items={[
      { icon: Gauge, title: 'Dashboard', text: 'Visão geral' }, { icon: CheckSquare, title: 'Tarefas e Agenda', text: 'Seus prazos' },
      { icon: Layout, title: 'Projetos', text: 'Obras e arquitetos' }, { icon: FileText, title: 'Orçamentos', text: 'Do pedido à proposta' },
      { icon: ScanSearch, title: 'Leitura de Projeto', text: 'Medir e contar' }, { icon: TrendingUp, title: 'Negociações', text: 'Funil de vendas' },
      { icon: Inbox, title: 'Contatos do Site', text: 'Quem chegou pelo site' }, { icon: Package, title: 'Expedição', text: 'Separar e entregar' },
      { icon: Users2, title: 'Parceiros', text: 'Arquitetos e afins' }, { icon: GraduationCap, title: 'Treinamento', text: 'Esta trilha' },
    ]} />
  </Figure>
)

function Kanban() {
  const cols = [
    ['Na fila', 'bg-blue-500'], ['Em andamento', 'bg-amber-500'], ['Revisão', 'bg-purple-500'],
    ['Elaborando nova versão', 'bg-pink-500'], ['Pausado', 'bg-gray-400'], ['Concluído', 'bg-green-500'],
  ]
  return (
    <Figure title="As etapas de um orçamento" caption="Arraste o cartão para a coluna certa assim que a fase mudar. Assim a equipe inteira enxerga o andamento.">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {cols.map(([n, c]) => (
          <div key={n} className="rounded-xl border border-surface-border bg-surface-secondary p-2">
            <div className="flex items-center gap-1.5 mb-2"><span className={cn('w-2 h-2 rounded-full', c)} /><span className="text-[10px] font-bold uppercase tracking-wide text-gray-600 leading-tight">{n}</span></div>
            <div className="h-9 rounded-lg bg-white border border-surface-border" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {[['Baixa', 'bg-gray-100 text-gray-600'], ['Média', 'bg-blue-50 text-blue-700'], ['Alta', 'bg-amber-50 text-amber-700'], ['Urgente', 'bg-red-50 text-red-700']].map(([n, c]) => (
          <span key={n} className={cn('badge', c)}>Prioridade {n}</span>
        ))}
      </div>
    </Figure>
  )
}

function Temps() {
  const t = [
    ['Sem previsão', 'Ainda sem sinal claro', 'bg-slate-100 text-slate-600'], ['Frio', 'Pouco interesse ou sem retorno', 'bg-blue-50 text-blue-700'],
    ['Morno', 'Interesse real, faltam decisões', 'bg-amber-50 text-amber-700'], ['Quente', 'Perto de fechar', 'bg-red-50 text-red-700'],
    ['Venda fechada', 'Informe valor final e data real', 'bg-green-50 text-green-700'], ['Perdida', 'Registre o motivo', 'bg-gray-100 text-gray-600'],
  ]
  return (
    <Figure title="Temperatura de uma negociação" caption="Seja honesto ao classificar. Marcar tudo como quente atrapalha a previsão de vendas de toda a equipe.">
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {t.map(([n, d, c]) => (
          <li key={n} className="rounded-xl border border-surface-border bg-white p-3">
            <span className={cn('badge mb-1.5', c)}>{n}</span>
            <p className="text-xs text-gray-500 leading-5">{d}</p>
          </li>
        ))}
      </ul>
    </Figure>
  )
}

const projectReading = () => (
  <Figure title="Fluxo da Leitura de Projeto" caption="A ferramenta agiliza a contagem, mas a conferência técnica continua sendo sua.">
    <Flow steps={[
      { icon: FileText, title: 'Abrir a planta', text: 'Confira a revisão' }, { icon: Ruler, title: 'Conferir a escala', text: 'Escala errada = medida errada' },
      { icon: Home, title: 'Nomear ambientes', text: 'Como na planta' }, { icon: ScanSearch, title: 'Carimbar produtos', text: 'Depois de ler a legenda' },
      { icon: CheckSquare, title: 'Conferir', text: 'Por ambiente e por código' }, { icon: FileText, title: 'Exportar PDF', text: 'Anexar ao orçamento' },
    ]} />
  </Figure>
)

const areasMap = () => (
  <Figure title="Como as áreas se conectam ao orçamento" caption="Cada área deixa um registro. Quem vem depois de você precisa encontrar tudo no sistema.">
    <Tiles cols="sm:grid-cols-5" items={[
      { icon: CheckSquare, title: 'Tarefas e Agenda', text: 'Prazo, prioridade e checklist' }, { icon: Layout, title: 'Projetos', text: 'Consulte antes de pedir a planta' },
      { icon: Package, title: 'Expedição', text: 'Na fila → entregue ou retirada' }, { icon: Users2, title: 'Parceiros', text: 'Cadastre com o tipo certo' },
      { icon: Inbox, title: 'Contatos do site', text: 'Responda rápido e registre' },
    ]} />
  </Figure>
)

const objections = () => (
  <Figure title="Diante de “está caro”" caption="Objeção não é recusa: é o cliente pedindo para entender o valor.">
    <Flow steps={[
      { icon: HelpCircle, title: 'Pergunte', text: 'Caro em relação a quê?' }, { icon: Layers, title: 'Compare iguais', text: 'Mesmos itens e especificação' },
      { icon: Heart, title: 'Mostre o valor', text: 'Benefício e garantia' }, { icon: Users, title: 'Desconto?', text: 'Só com aprovação da liderança' },
      { icon: ClipboardList, title: 'Registre', text: 'Na negociação' },
    ]} />
  </Figure>
)

const whoInWork = () => (
  <Figure title="Quem decide o quê na obra" caption="Trate cada profissional como parceiro e mande as informações organizadas.">
    <Tiles cols="sm:grid-cols-4" items={[
      { icon: Palette, title: 'Arquiteto ou designer', text: 'Conceito e especificação. Não troque produto sem falar com ele.' },
      { icon: Zap, title: 'Eletricista', text: 'Valida a instalação. Peça a confirmação por escrito.' },
      { icon: Layers, title: 'Gesso', text: 'Recorte, profundidade e espaço no forro.' },
      { icon: Wrench, title: 'Marcenaria', text: 'Espaços, perfis e acesso à fonte.' },
    ]} />
  </Figure>
)

const automation = () => (
  <Figure title="Cinco perguntas para começar" caption="Obra pronta limita as opções; obra em andamento permite planejar a infraestrutura.">
    <Flow steps={[
      { icon: Lightbulb, title: 'O que controlar?', text: 'Só luz ou mais?' }, { icon: Home, title: 'Obra pronta?', text: 'Ou ainda em planejamento' },
      { icon: Activity, title: 'Como acionar?', text: 'Tecla, app, voz, cena' }, { icon: Cable, title: 'Internet e central', text: 'Onde ficará?' },
      { icon: Wrench, title: 'Quem instala?', text: 'E quem programa?' },
    ]} />
  </Figure>
)

const doubleCheck = () => (
  <Figure title="Duas conferências, sempre" caption="O sistema achar o produto não dispensa nenhuma delas.">
    <div className="grid sm:grid-cols-2 gap-2.5">
      <div className="rounded-xl border border-surface-border bg-white p-4"><span className="badge bg-navy text-white mb-2">Técnica</span><p className="text-sm text-gray-600 leading-6">Produto, descrição, quantidade, tensão, CCT, acabamento, fonte/driver e acessórios.</p></div>
      <div className="rounded-xl border border-surface-border bg-white p-4"><span className="badge bg-brand-500 text-white mb-2">Comercial</span><p className="text-sm text-gray-600 leading-6">Cliente, preço, desconto aprovado, prazo, estoque, frete, pagamento, validade e observações.</p></div>
    </div>
  </Figure>
)

const VISUALS: Record<string, () => JSX.Element> = {
  'A luz não serve apenas para clarear': Layers5,
  'Direta, indireta e difusa: o caminho da luz': Paths3,
  'Como descobrir o que o cliente realmente precisa': Discovery,
  'Lúmen, lux e watt sem complicação': LmLuxW,
  'Quanta luz o ambiente precisa: lux, norma e fator de potência': HowMuch,
  'Temperatura de cor: quente, neutra e fria': Kelvin,
  'IRC, facho e conforto visual': BeamCri,
  'Famílias de lâmpadas e luminárias': Families,
  'Fitas de LED: vender o sistema, não só o rolo': LedSystem,
  'IP, dimerização e compatibilidade': IpScale,
  'A linguagem básica da eletricidade': Units,
  'Circuitos, comandos e cenas': Scenes,
  'Situações em que você deve parar e encaminhar': Traffic,
  'Como ler uma planta luminotécnica': () => <><PlanLegend />{readingOrder()}</>,
  'Quantitativo: a ponte entre planta e pedido': () => quantitative(),
  'Atendimento consultivo e orçamento técnico': () => consultative(),
  'Primeiro acesso, menu e boas práticas': () => menuMap(),
  'Leitura de Projeto: da planta ao quantitativo': () => projectReading(),
  'Tarefas, Agenda, Projetos, Expedição e Parceiros': () => areasMap(),
  'Objeções: preço, concorrência e prazo': () => objections(),
  'Trabalhando com arquitetos, eletricistas e outros profissionais': () => whoInWork(),
  'Automação: o básico para atender sem prometer demais': () => automation(),
  'Como estudar o Masterlojista': () => doubleCheck(),
  'Orçamentos: lista, prioridade e kanban': Kanban,
  'Negociações: temperatura, fechamento e perda': Temps,
  'Da venda à entrega: expedição, troca e garantia': () => saleToDelivery(),
}

export function LessonVisual({ title }: { title: string }) {
  const V = VISUALS[title]
  return V ? <div className="space-y-4"><V /></div> : null
}
