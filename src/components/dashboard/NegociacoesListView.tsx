'use client'

import { formatCurrency } from '@/lib/utils'
import { useState } from 'react'

interface Negotiation {
  id: string
  clientName: string
  location: string
  currentStage: 'visita_marcar' | 'visitado' | 'orcamento' | 'negociando' | 'fechado'
  projectista: string
  orcamentista: string
  status: 'aguardando' | 'em_andamento' | 'quente' | 'fechado'
  nextAction: string
  expectedDate: string
  lastMessage: string
  value?: number
}

// DADOS MOCK — depois vem do banco
const mockData: Negotiation[] = [
  {
    id: '1',
    clientName: 'Cliente',
    location: 'Edf. Blend',
    currentStage: 'visita_marcar',
    projectista: 'Isabelle',
    orcamentista: '-',
    status: 'aguardando',
    nextAction: 'Agendar visita',
    expectedDate: '10/07',
    lastMessage: '09/07',
  },
  {
    id: '2',
    clientName: 'Ronald',
    location: 'Ótica Carajás',
    currentStage: 'visitado',
    projectista: 'Isabelle',
    orcamentista: 'João',
    status: 'em_andamento',
    nextAction: 'Fazer orçamento',
    expectedDate: '10/07',
    lastMessage: '03/07',
    value: 15000,
  },
  {
    id: '3',
    clientName: 'Helisson Antonio',
    location: 'Cond. Santé',
    currentStage: 'orcamento',
    projectista: 'Cinthya',
    orcamentista: 'Dalisson',
    status: 'em_andamento',
    nextAction: 'Apresentar p/ cliente',
    expectedDate: '09/07',
    lastMessage: '04/07',
    value: 22500,
  },
  {
    id: '4',
    clientName: 'Igor & Hugo',
    location: 'Edf. Blend',
    currentStage: 'negociando',
    projectista: 'Isabelle',
    orcamentista: 'Jennifer',
    status: 'quente',
    nextAction: 'Falta finalizar projeto',
    expectedDate: '03/07',
    lastMessage: '03/07',
    value: 8500,
  },
  {
    id: '5',
    clientName: 'Thamila & Demetrius',
    location: 'Messias',
    currentStage: 'fechado',
    projectista: 'Isabelle',
    orcamentista: 'Jennifer',
    status: 'fechado',
    nextAction: '-',
    expectedDate: '08/07',
    lastMessage: '08/07',
    value: 35000,
  },
]

const stageLabels = {
  visita_marcar: 'Visita a marcar',
  visitado: 'Visitado',
  orcamento: 'Orçamento',
  negociando: 'Negociando',
  fechado: 'Fechado',
}

const statusColors = {
  aguardando: 'bg-amber-50 text-amber-700 border-amber-200',
  em_andamento: 'bg-blue-50 text-blue-700 border-blue-200',
  quente: 'bg-red-50 text-red-700 border-red-200',
  fechado: 'bg-green-50 text-green-700 border-green-200',
}

export function NegociacoesListView() {
  const [data] = useState<Negotiation[]>(mockData)

  const stats = {
    total: data.length,
    byStage: {
      visita_marcar: data.filter(d => d.currentStage === 'visita_marcar').length,
      visitado: data.filter(d => d.currentStage === 'visitado').length,
      orcamento: data.filter(d => d.currentStage === 'orcamento').length,
      negociando: data.filter(d => d.currentStage === 'negociando').length,
      fechado: data.filter(d => d.currentStage === 'fechado').length,
    },
    value: data.reduce((sum, n) => sum + (n.value || 0), 0),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Pipeline de Negociações</h2>
          <p className="text-sm text-gray-500 mt-1">
            {stats.total} negociações • {formatCurrency(stats.value)} em pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Filtros
          </button>
          <button className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Este mês
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(stageLabels).map(([stage, label]) => (
          <div key={stage} className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
            <p className="text-xs text-gray-500 font-semibold uppercase">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {stats.byStage[stage as keyof typeof stats.byStage]}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-900">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900">Local</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900">Etapa</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900">Responsáveis</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-900">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900">Próxima Ação</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-900">Prazo</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-900">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.map((neg) => (
                <tr
                  key={neg.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                    neg.status === 'fechado' ? 'bg-green-50 hover:bg-green-100' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-brand-600 underline hover:text-brand-700">
                    {neg.clientName}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">{neg.location}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium">
                      {stageLabels[neg.currentStage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    <div>{neg.projectista}</div>
                    <div className="text-gray-400">{neg.orcamentista}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-1 rounded border ${statusColors[neg.status]}`}>
                      {neg.status === 'fechado' ? '✓ Fechado' : neg.status === 'quente' ? '🔥 Quente' : neg.status.charAt(0).toUpperCase() + neg.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">{neg.nextAction}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs font-medium">{neg.expectedDate}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                    {neg.value ? formatCurrency(neg.value) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Footer */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <p className="text-blue-700">
          <span className="font-semibold">💡 Dica:</span> Clique em qualquer cliente para ver detalhes completos, observações e histórico de negociação.
        </p>
      </div>
    </div>
  )
}
