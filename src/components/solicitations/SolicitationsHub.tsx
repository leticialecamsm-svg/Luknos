'use client'

// Hub do módulo Solicitações — fiel ao wireframe:
// 1) hero azul-marinho com 4 números grandes
// 2) 3 tiles claros com métricas-chave
// 3) grade de "Etapas" (estilo Ferramentas/Métricas): ícone, nome,
//    descrição curta, contador. Cada card leva à listagem filtrada.

import Link from 'next/link'
import { Plus, ArrowUpRight, MapPin, Ruler, FileText, HandCoins, CheckCircle2, ShoppingCart, Package, Wrench, HeartPulse, List } from 'lucide-react'
import { NewSolicitationButton } from './NewSolicitationButton'

export type HubData = {
  hero: { opened: number; closedThisMonth: number; overdue: number; simultaneous: number }
  tiles: { newThisWeek: number; conversionPct: number | null; avgCycleDays: number | null }
  counters: {
    visita: number; projeto: number; orcamento: number; negociacao: number
    desfecho: number; compra: number; expedicao: number; instalacao: number; posVenda: number
  }
}

type StageCard = {
  key: keyof HubData['counters']
  label: string
  description: string
  icon: any
  iconBg: string
  iconColor: string
  count: number
  countLabel: string
  href: string
}

export function SolicitationsHub({ data }: { data: HubData }) {
  const { hero, tiles, counters } = data

  const cards: StageCard[] = [
    { key: 'visita',     label: 'Visita',               description: 'Primeiro contato presencial, antes de qualquer orçamento.', icon: MapPin,       iconBg: 'bg-indigo-50', iconColor: 'text-indigo-700', count: counters.visita,     countLabel: 'abertas',       href: '/solicitacoes/lista?etapa=visita' },
    { key: 'projeto',    label: 'Projeto',              description: 'Elaboração (pré-venda) ou alocação de pontos (pós-venda).',  icon: Ruler,        iconBg: 'bg-indigo-50', iconColor: 'text-indigo-700', count: counters.projeto,    countLabel: 'abertos',       href: '/solicitacoes/lista?etapa=projeto' },
    { key: 'orcamento',  label: 'Orçamento',            description: 'Orçamentos ativos — ligados a uma Solicitação.',             icon: FileText,     iconBg: 'bg-amber-50',  iconColor: 'text-amber-800',  count: counters.orcamento,  countLabel: 'ativos',        href: '/solicitacoes/lista?etapa=orcamento' },
    { key: 'negociacao', label: 'Negociação',           description: 'Funil por temperatura, igual ao de hoje.',                   icon: HandCoins,    iconBg: 'bg-amber-50',  iconColor: 'text-amber-800',  count: counters.negociacao, countLabel: 'abertas',       href: '/solicitacoes/lista?etapa=negociacao' },
    { key: 'desfecho',   label: 'Venda fechada / perdida', description: 'Desfecho da negociação — dispara Compra e Expedição.',    icon: CheckCircle2, iconBg: 'bg-green-50',  iconColor: 'text-green-700',  count: counters.desfecho,   countLabel: 'este mês',      href: '/solicitacoes/lista' },
    { key: 'compra',     label: 'Compra de material',   description: 'Checklist de itens a comprar, por Solicitação.',             icon: ShoppingCart, iconBg: 'bg-yellow-50', iconColor: 'text-yellow-800', count: counters.compra,     countLabel: 'pendentes',     href: '/solicitacoes/lista?etapa=compra' },
    { key: 'expedicao',  label: 'Separação e entrega',  description: 'A mesma Expedição de hoje — entrega é só um status a mais.', icon: Package,      iconBg: 'bg-yellow-50', iconColor: 'text-yellow-800', count: counters.expedicao,  countLabel: 'em andamento',  href: '/solicitacoes/lista?etapa=expedicao' },
    { key: 'instalacao', label: 'Instalação',           description: 'Agenda, equipe e fotos da instalação em obra.',              icon: Wrench,       iconBg: 'bg-blue-50',   iconColor: 'text-blue-700',   count: counters.instalacao, countLabel: 'em andamento',  href: '/solicitacoes/lista?etapa=instalacao' },
    { key: 'posVenda',   label: 'Pós-venda',            description: 'Contato de satisfação depois da instalação.',                icon: HeartPulse,   iconBg: 'bg-blue-50',   iconColor: 'text-blue-700',   count: counters.posVenda,   countLabel: 'pendentes',     href: '/solicitacoes/lista?etapa=posVenda' },
  ]

  return (
    <div className="space-y-4">
      {/* Hero navy */}
      <div
        className="rounded-2xl px-7 py-6 text-white"
        style={{
          background: 'linear-gradient(180deg,#0d2445 0%,#0a1f3b 55%,#02162a 100%)',
          boxShadow: 'rgba(2,22,42,.55) 0 16px 40px -16px, rgba(255,255,255,.09) 0 1px 0 0 inset',
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/10 border border-white/20">time comercial</span>
            <h1 className="text-[22px] font-bold mt-2 mb-1">Como estão suas Solicitações hoje.</h1>
            <p className="text-[12.5px] text-white/60 max-w-lg">
              {hero.opened} {hero.opened === 1 ? 'Solicitação' : 'Solicitações'} em andamento, passando por 9 etapas — algumas em mais de uma ao mesmo tempo.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/solicitacoes/lista"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-white/10 border border-white/25 hover:bg-white/15 transition-colors"
            >
              <List className="w-3.5 h-3.5" /> Ver todas
            </Link>
            <NewSolicitationButton />
          </div>
        </div>
        <div className="flex gap-7 flex-wrap mt-5">
          <HeroNum value={hero.opened} label="abertas" />
          <HeroNum value={hero.closedThisMonth} label="fechadas este mês" />
          <HeroNum value={hero.overdue} label="atrasada" accent={hero.overdue > 0 ? '#f87171' : undefined} />
          <HeroNum value={hero.simultaneous} label="em etapas simultâneas" />
        </div>
      </div>

      {/* Tiles de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <Tile label="Novas esta semana"      value={String(tiles.newThisWeek)} />
        <Tile label="Orçamento → Venda"       value={tiles.conversionPct != null ? `${tiles.conversionPct}%` : '—'} />
        <Tile label="Ciclo médio até a venda" value={tiles.avgCycleDays != null ? `${tiles.avgCycleDays} dias` : '—'} />
      </div>

      {/* Grade de etapas */}
      <div>
        <h2 className="text-base font-semibold text-navy mb-0.5">Etapas</h2>
        <p className="text-[11.5px] text-gray-400 mb-2.5">9 etapas · clique para administrar cada uma</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {cards.map(c => <StageTool key={c.key} card={c} />)}
        </div>
      </div>
    </div>
  )
}

function HeroNum({ value, label, accent }: { value: number; label: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[26px] font-bold leading-none" style={{ color: accent ?? '#fff' }}>{value}</span>
      <span className="text-[11px] text-white/55">{label}</span>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-surface-border px-4 py-3">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-[19px] font-bold text-navy mt-1">{value}</p>
    </div>
  )
}

function StageTool({ card }: { card: StageCard }) {
  const Icon = card.icon
  return (
    <Link
      href={card.href}
      className="relative bg-white border border-surface-border rounded-2xl p-4 flex flex-col gap-2 hover:border-brand-400 transition-colors"
    >
      <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 absolute top-4 right-4" />
      <span className={`w-[34px] h-[34px] rounded-xl flex items-center justify-center ${card.iconBg} ${card.iconColor}`}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="text-[14px] font-semibold text-navy">{card.label}</p>
      <p className="text-[11.5px] text-gray-400 leading-relaxed">{card.description}</p>
      <span className="inline-flex items-center text-[11px] font-medium text-gray-600 bg-surface-secondary rounded-full px-2 py-0.5 w-fit">
        {card.count} {card.countLabel}
      </span>
    </Link>
  )
}
