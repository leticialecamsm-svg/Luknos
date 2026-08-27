'use client'

import { useState, useMemo, useRef } from 'react'
import { setMetropolitanoLancado, type MetropolitanoRow } from '@/lib/actions'
import { formatCurrency, cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { Award, Search, Loader2, CheckCircle2, AlertTriangle, Undo2 } from 'lucide-react'

const TIPO_LABEL: Record<string, string> = { architect: 'Arquiteto', engineer: 'Engenheiro' }

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, dd] = d.slice(0, 10).split('-')
  return `${dd}/${m}/${y}`
}

export function MetropolitanoPage({ initialRows }: { initialRows: MetropolitanoRow[] }) {
  const toast = useToast()
  const [rows, setRows] = useState<MetropolitanoRow[]>(initialRows)
  const [tab, setTab] = useState<'pendentes' | 'realizados'>('pendentes')
  const [busca, setBusca] = useState('')
  // Linhas com requisição em voo — trava o checkbox pra evitar clique duplo
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const savingRef = useRef<Set<string>>(new Set())

  const keyOf = (r: MetropolitanoRow) => `${r.quote_id}:${r.contact_id}`

  async function toggle(row: MetropolitanoRow, novoValor: boolean) {
    const key = keyOf(row)
    if (savingRef.current.has(key)) return // guarda síncrona contra duplo clique
    savingRef.current.add(key)
    setSaving(new Set(savingRef.current))

    // Atualiza na hora e desfaz se o servidor recusar
    const anterior = rows
    setRows(prev => prev.map(r => keyOf(r) === key ? { ...r, lancado: novoValor } : r))

    const res = await setMetropolitanoLancado(row.quote_id, row.contact_id, novoValor)

    savingRef.current.delete(key)
    setSaving(new Set(savingRef.current))

    if (res?.error) {
      setRows(anterior)
      toast.error('ERRO', res.error)
      return
    }
    toast.success(
      novoValor ? 'LANÇAMENTO REGISTRADO' : 'LANÇAMENTO DESFEITO',
      novoValor
        ? `${row.especificador} · ${row.cliente} saiu dos pendentes.`
        : `${row.especificador} · ${row.cliente} voltou para os pendentes.`
    )
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const doTab = rows.filter(r => (tab === 'pendentes' ? !r.lancado : r.lancado))
    if (!termo) return doTab
    return doTab.filter(r =>
      r.especificador.toLowerCase().includes(termo) ||
      r.cliente.toLowerCase().includes(termo) ||
      String(r.numero).includes(termo)
    )
  }, [rows, tab, busca])

  const pendentes = rows.filter(r => !r.lancado)
  const realizados = rows.filter(r => r.lancado)
  const valorPendente = pendentes.reduce((s, r) => s + r.valor, 0)
  const canceladasLancadas = realizados.filter(r => r.venda_cancelada)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Metropolitano: Lançamentos de Pontuação</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vendas com especificador (arquiteto ou engenheiro) para lançar pontuação no sistema do Metropolitano
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar especificador, cliente ou nº"
            className="pl-9 pr-3 py-2 w-72 bg-white border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:border-brand-400"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pendentes</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{pendentes.length}</p>
          <p className="text-xs text-gray-400 mt-1">aguardando lançamento</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor pendente</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">{formatCurrency(valorPendente)}</p>
          <p className="text-xs text-gray-400 mt-1">soma das vendas não lançadas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Já lançados</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{realizados.length}</p>
          <p className="text-xs text-gray-400 mt-1">registrados no Metropolitano</p>
        </div>
      </div>

      {canceladasLancadas.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>{canceladasLancadas.length} pontuação(ões) lançada(s) de venda que não está mais fechada.</strong>{' '}
            Verifique no Metropolitano se precisa estornar — as linhas estão marcadas na aba "Lançamentos realizados".
          </p>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['pendentes', 'Lançamentos Pendentes', pendentes.length],
          ['realizados', 'Lançamentos realizados', realizados.length],
        ] as const).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {label}
            <span className={cn(
              'text-xs font-bold px-1.5 py-0.5 rounded-full',
              tab === id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
            )}>{count}</span>
          </button>
        ))}
      </div>

      {/* Tabela */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          {tab === 'pendentes' ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">
                {busca ? 'Nenhum resultado para essa busca' : 'Nenhuma pontuação pendente 🎉'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {busca ? 'Tente outro termo.' : 'Todas as vendas com especificador já foram lançadas.'}
              </p>
            </>
          ) : (
            <>
              <Award className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">
                {busca ? 'Nenhum resultado para essa busca' : 'Nenhum lançamento realizado ainda'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {busca ? 'Tente outro termo.' : 'Marque as vendas na aba de pendentes conforme lançar no Metropolitano.'}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 w-16">
                    {tab === 'pendentes' ? 'Lançar' : 'Lançado'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Especificador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Valor da venda</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Data da venda</th>
                  {tab === 'realizados' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Lançado por</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r, idx) => {
                  const key = keyOf(r)
                  const emAndamento = saving.has(key)
                  return (
                    <tr
                      key={key}
                      className={cn(
                        'border-b border-surface-border transition-colors hover:bg-surface',
                        idx === filtradas.length - 1 && 'border-0',
                        r.venda_cancelada && 'bg-amber-50/50'
                      )}
                    >
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggle(r, !r.lancado)}
                          disabled={emAndamento}
                          title={r.lancado ? 'Desmarcar (volta para pendentes)' : 'Marcar como lançado no Metropolitano'}
                          aria-label={r.lancado ? 'Desmarcar lançamento' : 'Marcar como lançado'}
                          className={cn(
                            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all mx-auto',
                            emAndamento
                              ? 'border-gray-200 bg-gray-50 cursor-wait'
                              : r.lancado
                                ? 'bg-emerald-500 border-emerald-500 hover:bg-emerald-600'
                                : 'border-gray-300 bg-white hover:border-emerald-400 hover:scale-110'
                          )}
                        >
                          {emAndamento
                            ? <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                            : r.lancado && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{r.especificador}</p>
                        <p className="text-xs text-gray-400">{TIPO_LABEL[r.especificador_tipo] ?? r.especificador_tipo}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{r.cliente}</p>
                        <p className="text-xs text-gray-400">
                          Orçamento #{String(r.numero).padStart(3, '0')}
                          {r.venda_cancelada && (
                            <span className="ml-1.5 text-amber-700 font-semibold">· venda não está mais fechada</span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(r.valor)}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600 whitespace-nowrap">
                        {fmtDate(r.data_venda)}
                      </td>
                      {tab === 'realizados' && (
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-500">{r.lancado_por ?? '—'}</p>
                          <p className="text-[11px] text-gray-400">
                            {r.lancado_em ? new Date(r.lancado_em).toLocaleDateString('pt-BR') : ''}
                          </p>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {tab === 'realizados' && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center gap-1.5">
              <Undo2 className="w-3 h-3 text-gray-400" />
              <p className="text-[11px] text-gray-500">
                Desmarque o checkbox para devolver um lançamento à aba de pendentes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
