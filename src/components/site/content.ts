/**
 * Conteúdo da landing page pública da Luknos Iluminação.
 *
 * ► Tudo aqui é PLACEHOLDER editável. Troque os textos por baixo e a página
 *   se atualiza sozinha. Onde estiver "TODO" é um dado que você vai me passar.
 *
 * Mídia (fotos/vídeos): coloque os arquivos em /public/site/... e referencie
 *   pelo caminho começando em /site/... (ex: '/site/projetos/sala-01.jpg').
 */

export const brand = {
  name: 'Luknos Iluminação',
  tagline: 'A luz certa transforma qualquer ambiente.', // TODO: sua tagline oficial
  about:
    'A Luknos une curadoria de iluminação de alto padrão e projeto luminotécnico ' +
    'sob medida. Da peça certa ao ponto de luz no lugar exato — cuidamos de cada ' +
    'detalhe para que o ambiente ganhe presença, conforto e sofisticação.', // TODO
}

export const nav = {
  links: [
    { label: 'Loja', href: '#loja' },
    { label: 'Projeto Luminotécnico', href: '#projeto' },
    { label: 'Projetos', href: '#portfolio' },
    { label: 'A Luknos', href: '#sobre' },
    { label: 'Contato', href: '#contato' },
  ],
}

export const hero = {
  eyebrow: 'Iluminação de alto padrão',
  headline: 'Luz que revela o melhor de cada espaço', // TODO: sua headline
  subtitle:
    'Loja de iluminação premium e projeto luminotécnico para quem projeta ' +
    'com intenção. Do residencial ao corporativo.', // TODO
  ctaPrimary: { label: 'Falar com um especialista', href: '#contato' },
  ctaSecondary: { label: 'Ver projetos', href: '#portfolio' },
  // Mídia de fundo: deixe media = null para usar o fundo estilizado.
  // Para vídeo: { type: 'video', src: '/site/hero/hero.mp4' }
  // Para foto:  { type: 'image', src: '/site/hero/hero.jpg' }
  media: null as null | { type: 'video' | 'image'; src: string },
}

export const paths = [
  {
    id: 'loja',
    kicker: 'Nossa loja',
    title: 'Curadoria de iluminação premium',
    description:
      'Luminárias, pendentes, trilhos e soluções técnicas das melhores marcas, ' +
      'selecionadas com olhar de projeto. Atendimento consultivo para você ' +
      'escolher com segurança.', // TODO
    bullets: ['Marcas de referência', 'Atendimento consultivo', 'Peças de destaque'],
    cta: { label: 'Conhecer a loja', href: '#contato' },
  },
  {
    id: 'projeto',
    kicker: 'Projeto luminotécnico',
    title: 'A luz desenhada para o seu espaço',
    description:
      'Projetamos a iluminação de cada ambiente no detalhe — temperatura, ' +
      'intensidade, pontos e cenas — integrando estética e técnica ao seu ' +
      'projeto de arquitetura.', // TODO
    bullets: ['Projeto sob medida', 'Cálculo luminotécnico', 'Acompanhamento de obra'],
    cta: { label: 'Solicitar projeto', href: '#contato' },
  },
]

// Faixa de autoridade — troque pelos números reais (deixe '' para ocultar)
export const stats = [
  { value: '12', suffix: '+', label: 'anos de mercado' },          // TODO
  { value: '850', suffix: '+', label: 'projetos entregues' },      // TODO
  { value: '40', suffix: '+', label: 'marcas representadas' },     // TODO
  { value: '100', suffix: '%', label: 'projetos sob medida' },     // TODO
]

export const differentials = [
  {
    title: 'Curadoria com olhar de projeto',
    text: 'Cada peça é escolhida pensando no resultado final do ambiente, não só no catálogo.',
  },
  {
    title: 'Técnica a serviço da estética',
    text: 'Cálculo luminotécnico preciso para conforto visual, valorização e eficiência.',
  },
  {
    title: 'Do conceito à instalação',
    text: 'Acompanhamos da concepção à execução, garantindo que o projeto saia como imaginado.',
  },
]

// Galeria — enquanto não houver fotos, usa placeholders premium.
// Quando enviar as imagens, troque `src: null` por `src: '/site/projetos/arquivo.jpg'`.
export const projects = [
  { title: 'Residência contemporânea', tag: 'Residencial', src: null as string | null },
  { title: 'Loja conceito', tag: 'Corporativo', src: null as string | null },
  { title: 'Living integrado', tag: 'Residencial', src: null as string | null },
  { title: 'Fachada e paisagismo', tag: 'Externo', src: null as string | null },
  { title: 'Escritório executivo', tag: 'Corporativo', src: null as string | null },
  { title: 'Suíte master', tag: 'Residencial', src: null as string | null },
]

// Depoimentos — opcional. Deixe o array vazio [] para ocultar a seção.
export const testimonials = [
  {
    quote:
      'A iluminação mudou completamente a percepção dos ambientes. Técnica e bom gosto na medida certa.',
    author: 'Cliente Luknos',      // TODO
    role: 'Projeto residencial',   // TODO
  },
  {
    quote:
      'Atendimento de quem entende de projeto. Indicaram exatamente o que o espaço pedia.',
    author: 'Cliente Luknos',      // TODO
    role: 'Projeto corporativo',   // TODO
  },
]

export const contact = {
  headline: 'Vamos iluminar o seu próximo projeto?',
  subtitle: 'Fale com a nossa equipe e receba uma consultoria sob medida.',
  whatsapp: {
    display: '(00) 00000-0000',                  // TODO
    // Número no formato internacional, só dígitos (ex: 5511999999999)
    number: '5500000000000',                     // TODO
    message: 'Olá! Vim pelo site e gostaria de saber mais sobre a Luknos.',
  },
  email: 'contato@luknos.com.br',                // TODO
  instagram: { handle: '@luknos', url: 'https://instagram.com/luknos' }, // TODO
  address: 'Endereço da loja — cidade/UF',       // TODO
  hours: 'Seg a Sex, 9h às 18h · Sáb, 9h às 13h',// TODO
}
