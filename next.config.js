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
// O glue WebAssembly do leitor de DWG (libredwg) cita módulos do Node que não
// existem no navegador — sem isso o bundle do cliente não compila.
nextConfig.webpack = (config, { isServer }) => {
  if (!isServer) config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, module: false, crypto: false }
  return config
}
module.exports = nextConfig
