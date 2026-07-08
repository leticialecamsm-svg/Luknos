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
    { label: 'Showroom', href: '#showroom' },
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
  media: {
    type: 'image',
    src: '/site/projetos/apdavid06.jpg',
  } as null | { type: 'video' | 'image'; src: string },
}

/** Seção do vídeo institucional (showroom + laboratório de iluminação). */
export const showroom = {
  kicker: 'Showroom & Laboratório',
  title: 'Venha ver a luz antes de escolher',
  description:
    'Nosso showroom e laboratório de iluminação permitem testar temperatura, ' +
    'intensidade e efeito de cada peça no ambiente real — você decide vendo, ' +
    'não imaginando.', // TODO: ajuste o texto se quiser
  video: '/site/showroom/apresentacao.mp4',
  poster: '/site/showroom/poster.jpg',
  cta: { label: 'Agendar uma visita', href: '#contato' },
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

// Galeria de projetos. Para adicionar, jogue o arquivo em /public/site/projetos/
// e acrescente um item aqui. `wide: true` faz o card ocupar destaque maior.
export const projects = [
  {
    title: 'Living com pendente escultural',
    tag: 'Residencial',
    src: '/site/projetos/apdavid06.jpg',
    wide: true,
  },
  {
    title: 'Suíte com nichos iluminados',
    tag: 'Residencial',
    src: '/site/projetos/apdavid02.jpg',
  },
  {
    title: 'Lavabo com espelho orgânico',
    tag: 'Residencial',
    src: '/site/projetos/apdavid04.jpg',
  },
  {
    title: 'Hall de entrada',
    tag: 'Residencial',
    src: '/site/projetos/apdavid05.jpg',
  },
  {
    title: 'Sala de estar e jantar integradas',
    tag: 'Residencial',
    src: '/site/projetos/apdavid07.jpg',
  },
  {
    title: 'Quarto infantil',
    tag: 'Residencial',
    src: '/site/projetos/apdavid03.jpg',
  },
  {
    title: 'Banheiro social',
    tag: 'Residencial',
    src: '/site/projetos/apdavid01.jpg',
  },
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

/**
 * Seção de Instagram.
 *
 * Como preencher: abra o reel no Instagram → botão de compartilhar → "Copiar link"
 * → cole a URL no array `reels` abaixo. Eles viram embeds oficiais do Instagram.
 *
 * (Puxar os posts mais recentes automaticamente exigiria a Instagram Graph API,
 *  com conta business + token de acesso. Veja a nota no final deste arquivo.)
 */
export const instagram = {
  kicker: 'Instagram',
  title: 'O que estamos iluminando agora',
  handle: '@luknosiluminacao',
  url: 'https://instagram.com/luknosiluminacao',
  // Cole aqui os links dos reels (3 a 6 ficam ótimos). Ex:
  // 'https://www.instagram.com/reel/CxxxxxxxxxX/'
  reels: [] as string[],
}

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
  instagram: {
    handle: '@luknosiluminacao',
    url: 'https://instagram.com/luknosiluminacao',
  },
  address: 'Endereço da loja — cidade/UF',       // TODO
  hours: 'Seg a Sex, 9h às 18h · Sáb, 9h às 13h',// TODO
}
