/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse'],
  experimental: {
    // Uploads de arquivo pras abas da Solicitação (Visita/Projeto/Separação
    // e entrega) passam direto por server action (uploadStageFileForSolicitation),
    // bem diferente do fluxo de anexos de orçamento (signed URL direto pro
    // Storage) — o default de 1 MB das server actions é baixo demais pra
    // fotos/PDFs, então sobe pra 20 MB só pra esses envios.
    serverActions: { bodySizeLimit: '20mb' },
  },
}
module.exports = nextConfig
