import Link from 'next/link'
import { FileQuestion, ArrowLeft } from 'lucide-react'

export default function QuoteNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center">
            <FileQuestion className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">Orçamento não encontrado</h1>
          <p className="text-sm text-gray-500">
            Este link pode estar desatualizado. O orçamento pode ter sido excluído ou este link pode estar incorreto.
          </p>
        </div>
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-left space-y-1">
          <p className="text-sm font-medium text-brand-800">Como encontrar o cliente?</p>
          <p className="text-sm text-brand-700">
            Acesse <strong>Solicitações</strong>, localize o cliente pelo nome e abra a aba <strong>Orçamento</strong>.
          </p>
        </div>
        <Link
          href="/solicitacoes"
          className="inline-flex items-center gap-2 btn-primary"
        >
          <ArrowLeft className="w-4 h-4" />
          Ir para Solicitações
        </Link>
      </div>
    </div>
  )
}
