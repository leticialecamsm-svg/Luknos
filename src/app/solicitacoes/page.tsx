// Índice completo de Solicitações (lista, filtros, criação) é Lote 2.
// Por ora isso só garante que o link do menu funciona; abrir uma
// Solicitação específica é feito por /solicitacoes/[id].

export default function SolicitacoesIndexPage() {
  return (
    <div className="max-w-xl mx-auto py-16 text-center">
      <h1 className="text-xl font-semibold mb-2">Solicitações</h1>
      <p className="text-sm text-gray-500">
        A lista de solicitações chega no próximo lote. Por enquanto, abra uma
        solicitação existente pelo link direto (/solicitacoes/[id]).
      </p>
    </div>
  )
}
