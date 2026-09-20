export type QuizQuestion = {
  prompt: string
  options: string[]
  answer: number
  explanation: string
}

export type CourseLesson = {
  title: string
  kind: 'text' | 'quiz'
  body: string
  duration_min: number
  xp: number
  quiz_data?: { passing_score: number; questions: QuizQuestion[] }
}

export type CourseModule = { title: string; description: string; lessons: CourseLesson[] }

// Conteúdo que o colaborador vê dentro do player de treinamento. Evite trocar
// o texto por um resumo: as aulas foram escritas para leitura autônoma.
export const LIGHTING_COURSE: { title: string; description: string; emoji: string; target_days: number; modules: CourseModule[] } = {
  title: 'Iluminação na prática',
  description: 'Trilha de 2 semanas: iluminação, sistema Luknos, vendas e primeiros atendimentos com segurança.',
  emoji: '💡',
  target_days: 14,
  modules: [
    {
      title: '1. Entender a luz antes de vender o produto',
      description: 'Base para descobrir a necessidade do cliente e propor uma solução coerente.',
      lessons: [
        {
          title: 'A luz não serve apenas para clarear', kind: 'text', duration_min: 12, xp: 15,
          body: `OBJETIVO DA AULA
Ao terminar, você será capaz de explicar por que uma mesma luminária pode funcionar muito bem em um ambiente e muito mal em outro.

Luz não é só claridade. Em um projeto, ela pode ajudar uma pessoa a enxergar, trabalhar, cozinhar, circular, descansar, perceber cores, valorizar uma parede ou criar uma cena especial. Por isso, não começamos um atendimento perguntando “qual modelo você quer?”. Começamos entendendo o que o cliente quer viver naquele espaço.

Pense em uma sala. A luz geral permite que todos se localizem. Uma luz de leitura ajuda quem está no sofá com um livro. Um spot pode valorizar um quadro. Uma fita atrás de um painel cria conforto visual. Essas são camadas de luz. Quando usamos apenas um ponto central para tudo, o espaço costuma ficar plano, com sombras e pouca flexibilidade.

AS CINCO FUNÇÕES PRINCIPAIS
- Luz geral: dá leitura segura do ambiente.
- Luz de tarefa: apoia uma atividade específica, como cozinhar, maquiar ou ler.
- Luz de destaque: chama atenção para objeto, textura, planta ou obra de arte.
- Luz decorativa: a própria luminária participa do visual.
- Luz de orientação: ajuda a circular, por exemplo em escadas, corredores e quartos à noite.

REGRA DE OURO
Venda a função antes de vender a peça. O mesmo pendente pode ser decorativo sobre uma mesa, mas não substitui necessariamente a luz de tarefa de uma bancada. O mesmo spot pode destacar uma parede, mas pode ofuscar alguém deitado se ficar mal posicionado.

NA PRÁTICA HOJE
Escolha um ambiente da loja ou da sua casa. Liste três atividades que acontecem ali e identifique uma camada de luz que atenderia cada atividade. Depois responda: qual delas não pode ficar na mesma tecla de interruptor?`,
        },
        {
          title: 'Direta, indireta e difusa: o caminho da luz', kind: 'text', duration_min: 12, xp: 15,
          body: `OBJETIVO DA AULA
Você vai reconhecer como a luz chega ao ambiente e explicar os efeitos mais comuns ao cliente.

LUZ DIRETA
A fonte envia a maior parte da luz diretamente para a superfície. Ela cria destaque, contraste e sombras mais marcadas. É útil sobre mesa, bancada, obra de arte ou ponto de leitura. O cuidado é não deixar a fonte no campo de visão, pois ela pode causar ofuscamento.

LUZ INDIRETA
A luz bate primeiro em teto, parede ou outra superfície e depois chega ao usuário. O resultado tende a ser mais suave e acolhedor. Sancas, cortineiros e alguns perfis lineares são exemplos comuns. Luz indireta depende da cor e do acabamento da superfície: uma parede escura reflete menos luz que uma parede clara.

LUZ DIFUSA
Um difusor, como acrílico ou vidro, espalha a luz e suaviza sombras. É muito útil quando queremos conforto visual ou iluminação mais uniforme. O difusor não cria luz extra; ele muda a distribuição e normalmente reduz parte do fluxo que sai da luminária.

OFUSCAMENTO
Ofuscamento é quando uma fonte muito brilhante incomoda ou atrapalha a visão. Pergunte sempre: de onde a pessoa olha? Há TV, espelho, tela de computador ou cama no caminho? Uma luminária tecnicamente boa pode dar resultado ruim se estiver na direção errada.

NA PRÁTICA HOJE
Olhe para três luminárias acesas na loja. Classifique cada uma como predominantemente direta, indireta ou difusa. Em seguida, diga onde você evitaria instalá-la e por quê.`,
        },
        {
          title: 'Como descobrir o que o cliente realmente precisa', kind: 'text', duration_min: 15, xp: 20,
          body: `OBJETIVO DA AULA
Aprender a conduzir uma conversa curta que evita erro, devolução e orçamento incompleto.

Quando um cliente diz “quero uma luz mais forte”, isso ainda não é uma especificação. Pode significar que falta luz na bancada, que o teto é alto, que existe sombra no espelho ou apenas que a luz atual está amarelada demais para a preferência dele. Sua função é transformar essa frase em informação útil.

PERGUNTAS QUE VOCÊ DEVE FAZER
1. Qual é o ambiente e o que acontece nele?
2. Quem usa o espaço e em quais horários?
3. Quais são as medidas e o pé-direito?
4. Como é o teto: laje, gesso, madeira ou outro material?
5. Existe planta, foto ou medida atualizada?
6. A instalação é 127 V, 220 V ou bivolt? Se não souber, quem confirma?
7. Há umidade, área externa, calor, poeira ou proximidade de água?
8. Quer luz aconchegante, neutra, foco de trabalho, dimerização ou automação?
9. Quem fará a instalação e qual é o prazo?

FRASE QUE AJUDA
“Antes de indicar, quero entender como você usa esse espaço para não te vender uma peça que fique bonita, mas não resolva sua necessidade.”

NUNCA PROMETA SEM CONFIRMAR
Não diga que uma peça “cabe”, “é compatível”, “não dá sombra” ou “funciona em qualquer tensão” sem ficha técnica, medidas e informação da instalação. Quando faltar dado, use: “Para eu te indicar com segurança, preciso confirmar isso com a planta, o eletricista ou o fabricante.”

NA PRÁTICA HOJE
Faça uma simulação com um colega: ele quer “iluminar melhor a cozinha”. Faça pelo menos seis perguntas antes de citar qualquer produto.`,
        },
        {
          title: 'Teste 1: fundamentos da iluminação', kind: 'quiz', duration_min: 10, xp: 25,
          body: 'Responda sem consultar. Você precisa acertar pelo menos 70% para concluir este módulo.',
          quiz_data: { passing_score: 70, questions: [
            { prompt: 'Qual camada de luz atende diretamente uma atividade como cozinhar ou ler?', options: ['Luz de tarefa', 'Luz de orientação', 'Luz decorativa', 'Luz de destaque'], answer: 0, explanation: 'A luz de tarefa é planejada para o plano onde a atividade acontece.' },
            { prompt: 'Uma fonte muito brilhante no campo de visão pode causar:', options: ['Ofuscamento', 'Maior IRC', 'Menor tensão', 'Dimerização'], answer: 0, explanation: 'Ofuscamento causa desconforto e pode reduzir a visibilidade.' },
            { prompt: 'A luz indireta chega ao usuário principalmente:', options: ['Depois de refletir em uma superfície', 'Somente por lâmpadas de 3000 K', 'Diretamente da rede elétrica', 'Sem criar nenhuma sombra'], answer: 0, explanation: 'Na indireta, teto, parede ou outra superfície participa do caminho da luz.' },
            { prompt: 'Antes de indicar um produto, qual dado é essencial confirmar?', options: ['Ambiente e condição de uso', 'A cor favorita do vendedor', 'O produto mais caro da loja', 'A marca da tinta sem relação com o projeto'], answer: 0, explanation: 'A função e as condições do ambiente orientam a especificação.' },
            { prompt: 'Um pendente sobre a mesa pode substituir automaticamente toda a luz de uma cozinha?', options: ['Não; cada função deve ser analisada', 'Sim, sempre', 'Sim, se for 6500 K', 'Somente se for dourado'], answer: 0, explanation: 'Uma peça decorativa pode não atender luz geral e de tarefa.' },
          ] },
        },
      ],
    },
    {
      title: '2. Medir e escolher a qualidade da luz',
      description: 'Lúmens, lux, Kelvin, IRC, facho e critérios para comparar produtos.',
      lessons: [
        {
          title: 'Lúmen, lux e watt sem complicação', kind: 'text', duration_min: 14, xp: 20,
          body: `OBJETIVO DA AULA
Comparar produtos sem cair na armadilha de usar watt como sinônimo de iluminação.

LÚMEN (lm)
É a quantidade total de luz emitida por uma fonte. Quanto mais lúmens, maior tende a ser a quantidade de luz disponível, mas ainda precisamos saber para onde ela vai.

LUX (lx)
É a quantidade de luz que chega a uma superfície. Um lúmen espalhado em uma área enorme produz poucos lux. Por isso, a distância, o facho, a altura da luminária e as cores do ambiente mudam o resultado.

WATT (W)
É potência elétrica consumida. Watt não mede diretamente “força da luz”. Duas lâmpadas de 9 W podem entregar fluxos, fachos e eficiência diferentes. Ao comparar, veja lúmens, distribuição, garantia e aplicação.

EFICIÊNCIA (lm/W)
É uma relação entre fluxo e potência. Ajuda a comparar produtos semelhantes, mas não substitui todos os outros critérios. Uma luminária muito eficiente pode ter facho inadequado, cor ruim ou não caber no projeto.

COMO EXPLICAR AO CLIENTE
Em vez de dizer “essa é mais forte porque tem mais watts”, diga: “Ela consome X W e entrega Y lúmens. Para esta altura e esta área, vamos avaliar se essa distribuição atende a bancada sem criar sombra.”

NA PRÁTICA HOJE
Pegue duas embalagens com potência parecida. Compare lúmens, CCT, IRC, tensão, facho e garantia. Escreva uma frase de venda correta para cada uma.`,
        },
        {
          title: 'Temperatura de cor: quente, neutra e fria', kind: 'text', duration_min: 14, xp: 20,
          body: `OBJETIVO DA AULA
Usar Kelvin para conversar sobre aparência e sensação, não sobre quantidade de luz.

A temperatura de cor é medida em Kelvin (K). Ela descreve como percebemos a cor da luz branca. Em geral, valores menores parecem mais amarelados; valores maiores parecem mais azulados.

2700 K A 3000 K
Normalmente é percebida como luz quente. Costuma criar sensação acolhedora e valorizar materiais quentes, madeira e espaços de descanso. Pode funcionar muito bem em sala, quarto, restaurante e áreas decorativas, dependendo da proposta.

4000 K
É uma faixa neutra para muitas pessoas. Pode ser útil quando se quer boa leitura visual sem aparência muito amarela ou muito azulada. É comum em cozinhas, áreas de trabalho e circulação, mas não é uma regra obrigatória.

ACIMA DE ~5300 K (5000 K A 6500 K)
É percebida como luz fria. Pode transmitir sensação de atenção e limpeza. Use com intenção, pois em ambientes de longa permanência pode parecer desconfortável para algumas pessoas ou conflitar com acabamentos quentes.

DUAS TEMPERATURAS NO MESMO AMBIENTE
Nunca misture luz fria com luz quente no mesmo ambiente; combine quente com neutra. Uma solução pouco usada e muito boa: um perfil com duas fitas (por exemplo 3000 K e 4000 K) em comandos separados, quente à noite e neutra de dia. Isso exige duas teclas de interruptor.

O QUE NÃO DIZER
Não diga que luz fria é “mais forte” ou que luz quente “cansa os olhos”. Kelvin não mede intensidade. Clientes podem preferir outra aparência; a escolha final deve considerar uso, materiais, horário e gosto.

NA PRÁTICA HOJE
Ilumine o mesmo objeto colorido com três temperaturas de cor. Observe pele, madeira, branco e cor forte. Anote o que mudou e qual pergunta você faria ao cliente antes de recomendar uma delas.`,
        },
        {
          title: 'IRC, facho e conforto visual', kind: 'text', duration_min: 15, xp: 20,
          body: `OBJETIVO DA AULA
Saber quando cor, direção e abertura da luz mudam uma venda.

IRC
O Índice de Reprodução de Cor indica, em uma escala de 0 a 100, o quanto uma fonte tende a mostrar cores de modo fiel. Quanto maior, melhor tende a ser a reprodução geral. Isso importa muito em roupas, alimentos, maquiagem, arte, marcenaria e locais onde o cliente decide pela aparência do material.

FACHO
O facho é o ângulo de saída da luz. Facho estreito concentra; facho aberto espalha. Um facho de 15° pode destacar um objeto de longe, enquanto 60° cobre área maior com menos concentração. A mesma luminária, em alturas diferentes, produz resultados diferentes.

DISTÂNCIA IMPORTA
Uma estimativa simples para o diâmetro do facho é: 2 × distância × tangente da metade do ângulo. Isso é apenas orientação. Fotometria, refletâncias e obstáculos podem mudar o resultado. Em projeto importante, use a especificação do fabricante e valide com projetista.

CONFORTO VISUAL
Evite fonte pontual exposta em ângulo de visão, reflexo em TV e sombra no rosto. Em bancada, a luz deve vir de posição que não seja bloqueada pelo corpo de quem trabalha. Em espelho, luz frontal ou lateral difusa costuma favorecer mais que um ponto isolado acima.

NA PRÁTICA HOJE
Mostre a um colega dois fachos diferentes sobre o mesmo objeto. Sem citar graus ou produto, peça que ele descreva o efeito. Depois explique tecnicamente a diferença.`,
        },
        {
          title: 'Quanta luz o ambiente precisa: lux, norma e fator de potência', kind: 'text', duration_min: 14, xp: 20,
          body: `OBJETIVO DA AULA
Entender de onde vem a quantidade de luz de um projeto e ler duas informações que aparecem na ficha técnica: fator de potência e selo Inmetro.

LUX = LÚMENS POR METRO QUADRADO
Lux é o fluxo luminoso (lúmens) que chega a cada metro quadrado. Para saber se um ambiente está bem iluminado, comparamos o lux desejado para a atividade com o que as luminárias entregam naquela área, considerando facho, altura e cores do ambiente.

O QUE DIZ A NORMA
A norma brasileira em vigor é a ABNT NBR ISO 8995-1:2013, que substituiu a antiga NBR 5413. A norma nova define níveis de iluminância por tipo de tarefa ou atividade, e não lista todos os ambientes residenciais. A tabela da NBR 5413 ainda circula como referência para residências, mas está descontinuada e não tem validade normativa. Use-a só como orientação e diga isso quando citar valores.

MAIS LUMINÁRIAS NÃO É MAIS LUZ
Quantidade de luminárias não garante boa iluminação. O que importa é o lúmen entregue, o ângulo de distribuição e o lux que chega ao plano de trabalho.

FATOR DE POTÊNCIA (FP)
Aparece na ficha técnica, numa escala de 0 a 1. Quanto maior, melhor o aproveitamento da energia. Entre uma lâmpada com FP 0,5 e outra com FP 0,8, a segunda é melhor nesse critério. Potência em watts não mede quanto a lâmpada ilumina; olhe os lúmens.

SELO INMETRO
Alguns produtos precisam do registro do Inmetro. Ao comparar fornecedores, confira se o produto exigido tem a etiqueta.

OFUSCAMENTO (UGR)
O UGR é o índice que mede o ofuscamento; a norma define um limite para cada tipo de ambiente ou atividade. Existem o ofuscamento direto (fonte no campo de visão), o indireto e o por reflexão (por exemplo, em vidro ou laca alto brilho). Você percebe o problema quando sente desconforto ao olhar.

NA PRÁTICA HOJE
Escolha uma sala de 12 m². Sem inventar valores, liste o que você precisaria confirmar (atividade, lux desejado, lúmens da luminária, altura, facho) antes de dizer que ela está bem iluminada.`,
        },
        {
          title: 'Teste 2: quantidade e qualidade da luz', kind: 'quiz', duration_min: 10, xp: 25,
          body: 'Aproveite o teste para confirmar que você compara produtos por critérios completos.',
          quiz_data: { passing_score: 70, questions: [
            { prompt: 'O que o watt mede?', options: ['Potência elétrica consumida', 'Aparência de cor', 'Fidelidade de cor', 'Quantidade de lux em qualquer ponto'], answer: 0, explanation: 'Watt é potência, não uma medida direta de luz entregue.' },
            { prompt: 'O que descreve melhor o lux?', options: ['Luz que chega a uma superfície', 'Cor da lâmpada', 'Tipo de soquete', 'Tempo de garantia'], answer: 0, explanation: 'Lux considera a luz incidente por área.' },
            { prompt: 'Kelvin é usado para falar principalmente sobre:', options: ['Aparência da luz branca', 'Consumo de energia', 'Tamanho do recorte', 'Proteção contra água'], answer: 0, explanation: 'Kelvin indica a temperatura de cor correlata.' },
            { prompt: 'Em qual situação o IRC merece atenção especial?', options: ['Maquiagem e roupas', 'Uma caixa fechada sem uso visual', 'Escolha de disjuntor', 'Medida de cabo'], answer: 0, explanation: 'Nesses usos, a fidelidade das cores é muito relevante.' },
            { prompt: 'Sobre a tabela da antiga NBR 5413, o que é correto dizer?', options: ['Serve só como referência, pois foi substituída pela NBR ISO 8995-1', 'É a norma em vigor para residências', 'Define o IRC de cada lâmpada', 'Substitui a ficha técnica do fabricante'], answer: 0, explanation: 'A NBR 5413 está descontinuada; a norma em vigor é a NBR ISO 8995-1:2013.' },
            { prompt: 'Um facho mais estreito tende a:', options: ['Concentrar luz em área menor', 'Aumentar automaticamente o IRC', 'Eliminar toda sombra', 'Consumir zero energia'], answer: 0, explanation: 'Abertura menor concentra a distribuição.' },
          ] },
        },
      ],
    },
    {
      title: '3. Conhecer produtos e montar soluções completas',
      description: 'Lâmpadas, luminárias, fitas, perfis, fontes e compatibilidades.',
      lessons: [
        {
          title: 'Famílias de lâmpadas e luminárias', kind: 'text', duration_min: 16, xp: 20,
          body: `OBJETIVO DA AULA
Reconhecer a função de cada família e evitar escolher apenas pela aparência.

LÂMPADAS SUBSTITUÍVEIS
Bulbos e filamentos costumam atender iluminação geral ou decorativa. Famílias MR, PAR e AR têm aplicações variadas de destaque e iluminação direcionada. A sigla não fecha a venda sozinha: confira base, diâmetro, altura, tensão, facho, fluxo, CCT e dimerização.

LUMINÁRIAS
Plafons e painéis são comuns para luz geral. Spots e trilhos permitem direcionamento. Pendentes aproximam a luz do plano e têm papel visual. Arandelas iluminam paredes e circulação. Balizadores orientam percursos. Perfis lineares organizam fitas e acabamento.

EMBUTIR OU SOBREPOR
Embutir exige recorte, profundidade e espaço no forro. Sobrepor evita recorte, mas precisa de superfície e fixação adequadas. Nunca afirme que “serve em qualquer gesso” sem verificar medida do recorte, altura da peça, driver e interferências.

INTEGRADA OU SUBSTITUÍVEL
Na luminária integrada, LED e muitas vezes driver fazem parte do conjunto. Em luminária com lâmpada, a fonte de luz pode ser trocada. Nenhuma é sempre melhor: compare estética, manutenção, disponibilidade de reposição, desempenho e garantia.

NA PRÁTICA HOJE
Escolha cinco produtos do estoque. Para cada um, responda: qual função ele atende, onde pode ser instalado, quais dados precisam ser confirmados e qual acessório pode faltar no orçamento.`,
        },
        {
          title: 'Fitas de LED: vender o sistema, não só o rolo', kind: 'text', duration_min: 16, xp: 20,
          body: `OBJETIVO DA AULA
Aprender a montar um kit de fita LED sem deixar itens essenciais de fora.

Fita de LED é um sistema. A fita sozinha raramente resolve o projeto. Ela pode precisar de fonte/driver, perfil, difusor, cabo, conectores, controle, fixação, terminações, ponto de alimentação e acesso para manutenção.

TENSÃO DE SAÍDA
Fitas comuns trabalham em corrente contínua, frequentemente 12 V ou 24 V. Isso não significa que podem ligar diretamente na tomada. A fonte recebe a rede e entrega a saída compatível. Confira sempre tensão de entrada da fonte e tensão de saída exigida pela fita.

POTÊNCIA E COMPRIMENTO
Veja a potência por metro na ficha. Multiplique pelo comprimento para conhecer a carga nominal. A seleção da fonte deve seguir a margem e os limites indicados pelo fabricante. Em trechos longos, pode haver queda de tensão e brilho menor no fim. A solução de alimentação deve ser definida segundo o manual e, quando necessário, pelo profissional técnico.

PERFIL E DIFUSOR
O perfil organiza acabamento, ajuda na dissipação e protege a fita. O difusor suaviza os pontos de LED, mas altera a quantidade e a distribuição da luz. Verifique se a fita, o perfil e o difusor foram pensados para trabalhar juntos.

NA PRÁTICA HOJE
Faça uma lista para 3 metros de iluminação em marcenaria. Inclua tudo que será necessário, desde a fita até o acesso futuro à fonte. Peça a um colega para tentar encontrar um item faltante.`,
        },
        {
          title: 'IP, dimerização e compatibilidade', kind: 'text', duration_min: 15, xp: 20,
          body: `OBJETIVO DA AULA
Reconhecer limites de uso e evitar promessas técnicas indevidas.

GRAU IP
IP é um código de proteção do invólucro. O primeiro algarismo trata de sólidos; o segundo, de água. O código deve ser lido junto da ficha, local de uso, forma de instalação e orientação do fabricante. IP alto não significa automaticamente que o produto pode ficar submerso, receber jato forte, sol ou produto químico.

ÁREAS ÚMIDAS E EXTERNAS
Pergunte se há chuva direta, vapor, respingo, lavagem, maresia, calor ou exposição ao sol. Em banheiro, box, piso, área externa ou proximidade de água, a indicação deve ser confirmada pelo projeto e pelo instalador responsável. Não improvise proteção com fita isolante ou silicone.

DIMERIZAÇÃO
“Dimerizável” quer dizer que o produto pode aceitar controle de intensidade com sistema compatível. Lâmpada, driver/fonte, dimmer e método de comando precisam conversar entre si. Não prometa que qualquer dimmer funciona. Confirme marca, protocolo e faixa de carga.

CHECKLIST FINAL DE PRODUTO
Função; fluxo; potência; CCT; IRC; facho; tensão; base/conexão; dimensão/recorte; IP; driver/fonte; dimerização; acabamento; garantia; acessórios; disponibilidade.

NA PRÁTICA HOJE
Escolha uma luminária externa e uma fita dimerizável. Liste tudo que ainda precisa ser perguntado antes de colocá-las em um orçamento definitivo.`,
        },
        {
          title: 'Teste 3: produtos e compatibilidade', kind: 'quiz', duration_min: 10, xp: 25,
          body: 'Este teste verifica se você sabe detectar itens faltantes e riscos de incompatibilidade.',
          quiz_data: { passing_score: 70, questions: [
            { prompt: 'Uma fita LED 24 V deve ser ligada:', options: ['Em fonte com saída compatível de 24 V', 'Diretamente em 220 V', 'Em qualquer dimmer', 'Sem considerar potência'], answer: 0, explanation: 'A saída da fonte deve coincidir com a tensão requerida pela fita.' },
            { prompt: 'Qual item pode faltar em um orçamento de fita LED?', options: ['Fonte/driver e acessórios de instalação', 'Somente a cor da parede', 'A data de nascimento do cliente', 'Um cabo aleatório sem especificação'], answer: 0, explanation: 'Uma solução linear exige componentes além da fita.' },
            { prompt: 'O código IP sozinho garante qualquer uso externo?', options: ['Não; é preciso considerar ficha e condições do local', 'Sim, sempre', 'Somente se o produto for dourado', 'Somente em 127 V'], answer: 0, explanation: 'Ambiente e instruções do fabricante definem a adequação.' },
            { prompt: 'Uma luminária dimerizável funciona com qualquer dimmer?', options: ['Não; todos os componentes devem ser compatíveis', 'Sim', 'Apenas se tiver alto IRC', 'Somente em 3000 K'], answer: 0, explanation: 'A compatibilidade inclui fonte, lâmpada, dimmer e método de controle.' },
            { prompt: 'Antes de indicar um embutido, o que é indispensável conferir?', options: ['Recorte, profundidade e espaço no forro', 'Somente a cor do aro', 'Somente o preço', 'Somente a foto do catálogo'], answer: 0, explanation: 'A compatibilidade física evita erro de instalação.' },
          ] },
        },
      ],
    },
    {
      title: '4. Segurança, eletricidade e instalação',
      description: 'Noções para orientar com responsabilidade e saber quando encaminhar.',
      lessons: [
        {
          title: 'A linguagem básica da eletricidade', kind: 'text', duration_min: 16, xp: 20,
          body: `OBJETIVO DA AULA
Entender os termos que aparecem na ficha técnica sem assumir trabalho de eletricista.

TENSÃO (V)
É a diferença de potencial elétrico. Na linguagem cotidiana, muitas pessoas chamam de voltagem. Produtos podem ser 127 V, 220 V ou bivolt na entrada. Ligar produto em tensão incompatível pode danificá-lo e criar risco.

CORRENTE (A)
É o fluxo de cargas elétricas. Em produtos LED de baixa tensão, a corrente de saída da fonte é um dado importante. Não escolha fonte apenas pela aparência ou pelo plugue.

POTÊNCIA (W) E ENERGIA (kWh)
Potência é a taxa de uso de energia; consumo ao longo do tempo é medido em kWh. Um produto de menor potência não é automaticamente a melhor escolha se não entregar a luz necessária. Eficiência, horas de uso e manutenção também contam.

CA E CC
A rede elétrica trabalha em corrente alternada (CA). LEDs precisam de corrente contínua (CC). Drivers ou fontes fazem essa conversão quando ela não está integrada ao produto. Fita 12/24 V precisa de sistema adequado; não a ligue na rede.

SEU LIMITE DE ATUAÇÃO
Você pode conferir ficha, explicar compatibilidade, reunir informações e encaminhar dúvidas. Você não deve abrir quadro, mexer em parte energizada, trocar fiação, dimensionar disjuntor/condutor ou orientar instalação fora do manual. Diante de risco, pare e chame profissional autorizado.

NA PRÁTICA HOJE
Classifique estas unidades: V, A, W, kWh, lm, lx, K, IRC e IP. Depois explique em voz alta a diferença entre 24 V da fita e 220 V da rede.`,
        },
        {
          title: 'Circuitos, comandos e cenas', kind: 'text', duration_min: 14, xp: 20,
          body: `OBJETIVO DA AULA
Distinguir circuito elétrico de comando de iluminação e conversar sobre cenas sem prometer instalação.

Circuito é o caminho elétrico que alimenta equipamentos e possui proteção definida no projeto. Em geral, circuitos de iluminação são separados dos de tomadas, para que uma sobrecarga em tomadas não apague as luzes da casa. Comando é a forma como o usuário liga, desliga ou controla grupos de luz. Um ambiente pode ter vários comandos para criar cenas, mesmo quando a infraestrutura foi planejada de outro modo.

EXEMPLO DE CENA
Em uma sala, o cliente pode ter: comando A para luz geral, B para destaque de estante e C para luz indireta. Para receber visitas, acende A+B+C. Para ver TV, pode usar B ou C em intensidade menor. O valor está na flexibilidade.

INTERRUPTORES E CONTROLE
Interruptor simples comanda de um ponto. Sistemas paralelos/intermediários permitem comandar de mais de um local. Sensores, dimmers e automação acrescentam funções. A escolha e a instalação dependem da compatibilidade e do projeto elétrico.

COMO VENDER COM SEGURANÇA
Explique o efeito desejado, registre os grupos e diga o que precisa ser validado com o eletricista: infraestrutura, retorno, carga, compatibilidade, local de instalação e protocolo de automação. Não diga “é só puxar um fio”.

NA PRÁTICA HOJE
Desenhe uma sala com três cenas. Dê nome a cada grupo de luz e escreva o benefício para o morador.`,
        },
        {
          title: 'Situações em que você deve parar e encaminhar', kind: 'text', duration_min: 12, xp: 20,
          body: `OBJETIVO DA AULA
Reconhecer risco antes que ele vire acidente, prejuízo ou promessa errada.

PARE E ENCAMINHE quando houver quadro elétrico, fio exposto, cheiro de queimado, disjuntor desarmando, choque, parte energizada, necessidade de alterar circuito, definição de cabo/disjuntor/DR/aterramento, instalação em box/piso/área molhada crítica, produto fora do manual ou dúvida sobre tensão.

O QUE DIZER AO CLIENTE
“Para sua segurança e para preservar a garantia, essa etapa precisa ser validada pelo eletricista ou responsável técnico. Eu já deixo a especificação do produto organizada para ele conferir.”

NR-10
A NR-10 trata da segurança em instalações e serviços com eletricidade. Ela existe para prevenir risco a trabalhadores, usuários e terceiros. Este curso não é curso de NR-10 e não torna ninguém autorizado a executar serviços elétricos.

EM UMA DEMONSTRAÇÃO
Se perceber cabo danificado, aquecimento anormal, cheiro de queimado ou qualquer condição insegura, interrompa a demonstração, não toque em parte exposta, isole a área e avise a liderança/profissional autorizado.

NA PRÁTICA HOJE
Para cada frase abaixo, responda “posso orientar”, “preciso confirmar” ou “encaminho”: “qual CCT fica mais aconchegante?”, “qual disjuntor devo usar?”, “essa fita 24 V liga na tomada?”, “posso usar no box?”, “qual facho destaca meu quadro?”`,
        },
        {
          title: 'Teste 4: segurança e eletricidade', kind: 'quiz', duration_min: 10, xp: 25,
          body: 'Você precisa acertar pelo menos 70%. Erros de segurança devem ser revisados mesmo com aprovação.',
          quiz_data: { passing_score: 70, questions: [
            { prompt: 'Uma fita de LED 24 V pode ser ligada diretamente na tomada?', options: ['Não; precisa de alimentação compatível', 'Sim, em qualquer tomada', 'Somente à noite', 'Somente se for IP65'], answer: 0, explanation: 'A fita exige fonte/driver com saída compatível.' },
            { prompt: 'O que o vendedor deve fazer diante de fio exposto e cheiro de queimado?', options: ['Interromper e chamar responsável autorizado', 'Tocar para testar', 'Aumentar o dimmer', 'Vender outra lâmpada'], answer: 0, explanation: 'A prioridade é interromper a condição insegura.' },
            { prompt: 'Quem deve dimensionar disjuntor, condutores e aterramento?', options: ['Profissional habilitado/qualificado para a atividade', 'Qualquer vendedor', 'O cliente sem dados', 'O catálogo'], answer: 0, explanation: 'Essas decisões são técnicas e devem seguir projeto e normas.' },
            { prompt: 'Qual é a diferença correta entre CA e CC?', options: ['A rede é CA e o LED usa CC com controle apropriado', 'CA é sempre 24 V', 'CC é sempre a rede da casa', 'Não existe diferença'], answer: 0, explanation: 'Drivers/fontes fazem a conversão quando necessária.' },
            { prompt: 'Um comando de iluminação serve para:', options: ['Criar acionamentos e cenas para o usuário', 'Substituir toda proteção elétrica', 'Definir o IRC', 'Medir o pé-direito'], answer: 0, explanation: 'Comandos controlam os grupos de luz.' },
          ] },
        },
      ],
    },
    {
      title: '5. Ler planta e transformar em orçamento',
      description: 'Leitura organizada de legenda, pontos, comandos, quantitativo e proposta.',
      lessons: [
        {
          title: 'Como ler uma planta luminotécnica', kind: 'text', duration_min: 16, xp: 20,
          body: `OBJETIVO DA AULA
Seguir uma ordem de leitura que reduz erros de contagem e de produto.

ORDEM DE LEITURA
1. Confira carimbo, nome do projeto, data e revisão.
2. Identifique quais ambientes e pavimentos estão no desenho.
3. Leia notas gerais e a legenda antes de contar pontos.
4. Reconheça códigos, símbolos, linhas de comando e alturas.
5. Faça a contagem por ambiente e depois por código.
6. Confronte a lista com memorial, detalhes e fichas técnicas.

SÍMBOLO NÃO É PRODUTO
O círculo, quadrado ou cruz na planta normalmente representa uma categoria/ponto. O produto final vem do código e da legenda, podendo depender ainda de memorial e detalhe. Nunca troque por algo “parecido” sem conferir fluxo, facho, CCT, IRC, recorte, driver, IP e acabamento.

COMANDOS E CIRCUITOS
Letras ou linhas podem indicar grupos de acionamento, mas a convenção pertence àquela planta. Leia a legenda. Circuito elétrico e comando não são necessariamente a mesma coisa.

O QUE FAZER COM DÚVIDA
Código sem legenda, legenda sem ponto, recorte ausente, quantidade diferente, tensão não indicada ou item inadequado ao ambiente não se resolve no chute. Registre uma pergunta objetiva e mantenha o orçamento como preliminar até confirmação.

NA PRÁTICA HOJE
Pegue uma planta. Circule todos os códigos diferentes e crie uma lista de dúvidas antes de tentar escolher produtos.`,
        },
        {
          title: 'Quantitativo: a ponte entre planta e pedido', kind: 'text', duration_min: 15, xp: 20,
          body: `OBJETIVO DA AULA
Montar uma lista rastreável que outra pessoa consegue conferir.

Crie uma linha para cada código de luminária ou acessório. Não misture itens diferentes só porque parecem parecidos. Um bom quantitativo contém código, descrição, ambiente, quantidade, tensão, potência, CCT, IRC, facho, recorte/dimensão, IP, acabamento, driver/fonte, acessórios e observações.

MÉTODO DE DUPLA CONFERÊNCIA
Primeira passagem: conte por ambiente e marque cada ponto na cópia da planta. Segunda passagem: conte por código e compare o total. Quando houver diferença, volte à planta; não faça média e não “arredonde”.

ACESSÓRIOS QUE SE PERDEM
Fontes, drivers, perfis, difusores, conectores, cabos, trilhos, lâmpadas para luminárias decorativas, suportes e controles podem não aparecer como ponto evidente na planta. Leia legenda e detalhes. Se não estiver claro, pergunte.

VERSÃO E RASTREABILIDADE
Anote sempre a revisão da planta usada. Uma alteração de projeto pode mudar quantidades, acabamentos, circuitos e orçamento. Também registre a data da proposta e as premissas comerciais.

NA PRÁTICA HOJE
Faça um quantitativo de uma planta curta. Peça a outro colaborador para contar de maneira independente. Resolva cada divergência indicando o local exato da planta.`,
        },
        {
          title: 'Atendimento consultivo e orçamento técnico', kind: 'text', duration_min: 16, xp: 20,
          body: `OBJETIVO DA AULA
Apresentar uma proposta que o cliente entenda e a loja consiga entregar sem surpresa.

Depois de entender o ambiente e conferir as informações técnicas, monte opções comparáveis. Uma opção “boa” atende os requisitos essenciais. Uma “melhor” pode trazer conforto, acabamento ou manutenção superiores. Uma “superior” pode agregar desempenho, controle ou design. Todas precisam ser tecnicamente corretas; nunca use uma solução insegura apenas para criar contraste de preço.

COMO EXPLICAR
Fale do benefício antes da especificação: “Nesta bancada, a luz linear evita a sombra do seu corpo.” Depois explique o produto: “Usaremos perfil com fita e fonte compatível, instalado de forma acessível para manutenção.”

PREMISSAS E EXCLUSÕES
Registre o que foi considerado e o que não está incluído: instalação, adequação elétrica, recorte, marcenaria, frete, automação, programação, projeto, prazo de estoque e validade do orçamento, conforme a política da empresa.

CONFERÊNCIA EM DUAS PASSAGENS
Técnica: SKU, tensão, CCT, acabamento, quantidade, acessórios, compatibilidade e aplicação.
Comercial: cliente, preço, desconto aprovado, prazo, estoque, frete, forma de pagamento, validade e observações.

NA PRÁTICA HOJE
Faça uma proposta com três faixas para uma sala de jantar. Apresente em três minutos sem começar por preço. Depois peça a alguém para auditar a sua lista.`,
        },
        {
          title: 'Teste 5: planta e orçamento', kind: 'quiz', duration_min: 10, xp: 25,
          body: 'Este teste confirma a sequência segura: planta, legenda, quantitativo, compatibilidade e proposta.',
          quiz_data: { passing_score: 70, questions: [
            { prompt: 'Antes de contar pontos na planta, o que você confere?', options: ['Carimbo, revisão, escopo e legenda', 'Somente a cor do desenho', 'O preço da última venda', 'O produto disponível mais próximo'], answer: 0, explanation: 'A revisão e a legenda evitam trabalhar na versão errada ou interpretar símbolos sem contexto.' },
            { prompt: 'Um símbolo de luminária define o SKU final?', options: ['Não; é preciso consultar legenda e especificação', 'Sim, sempre', 'Somente em plantas coloridas', 'Somente se houver pendente'], answer: 0, explanation: 'O símbolo representa um ponto/categoria; o código e os documentos definem o produto.' },
            { prompt: 'Como reduzir erro de quantitativo?', options: ['Contar por ambiente e depois por código', 'Contar uma vez rapidamente', 'Usar a quantidade do projeto anterior', 'Arredondar quando der diferença'], answer: 0, explanation: 'A dupla conferência torna divergências visíveis.' },
            { prompt: 'Qual item deve entrar na passagem técnica do orçamento?', options: ['Tensão e acessórios', 'Data de aniversário do vendedor', 'Cor do logo da loja', 'Música ambiente'], answer: 0, explanation: 'Tensão e acessórios são requisitos técnicos que evitam falha na entrega.' },
            { prompt: 'Quando o orçamento deve ficar como preliminar?', options: ['Quando faltam dados ou confirmação técnica', 'Nunca', 'Apenas se o cliente pedir desconto', 'Quando a luminária é bonita'], answer: 0, explanation: 'Dúvidas técnicas devem ser registradas e resolvidas antes do fechamento.' },
          ] },
        },
      ],
    },
    {
      title: '6. Conhecendo o sistema Luknos',
      description: 'Onde cada coisa fica e como registrar o trabalho para a equipe inteira enxergar.',
      lessons: [
        {
          title: 'Primeiro acesso, menu e boas práticas', kind: 'text', duration_min: 10, xp: 15,
          body: `OBJETIVO DA AULA
Saber entrar, se localizar no menu e cuidar dos dados dos clientes.

O menu lateral mostra as áreas do sistema. O que você enxerga depende do seu perfil: cada pessoa vê só as áreas liberadas pela liderança. Se precisar de uma tela que não aparece, peça a liberação; não peça o login de outra pessoa.

ÁREAS QUE VOCÊ VAI USAR MAIS
- Dashboard: visão geral do que está acontecendo.
- Tarefas e Agenda: suas tarefas, prazos e compromissos da equipe.
- Projetos: projetos de clientes e arquitetos em andamento.
- Orçamentos: pedidos de orçamento, do recebimento à entrega da proposta.
- Leitura de Projeto: ferramenta para medir e contar produtos direto na planta.
- Negociações: funil de vendas, com a temperatura de cada negociação.
- Contatos do Site: pessoas que chegaram pelo site.
- Expedição: separação, entrega e retirada de pedidos.
- Parceiros: arquitetos, designers e demais parceiros.
- Treinamento: esta trilha.

BOAS PRÁTICAS
1. O login é pessoal. Tudo que você registra fica com o seu nome; isso protege você e a equipe.
2. Dados de clientes (telefone, endereço, plantas) são confidenciais. Não envie print do sistema em grupos pessoais nem para quem não faz parte do atendimento.
3. Registre no sistema, não só na conversa. Se ficou só no WhatsApp ou na cabeça, os colegas não enxergam e o cliente pode receber respostas diferentes.
4. Quando a informação mudar, atualize. Um card desatualizado atrapalha a decisão de toda a equipe.

NA PRÁTICA HOJE
Entre no sistema, abra cada área do seu menu por um minuto e escreva uma frase dizendo para que serve. Se alguma tela não abrir, anote e avise a liderança.`,
        },
        {
          title: 'Orçamentos: lista, prioridade e kanban', kind: 'text', duration_min: 16, xp: 20,
          body: `OBJETIVO DA AULA
Cadastrar e acompanhar orçamentos sem deixar nenhum parado ou esquecido.

DUAS FORMAS DE VER
A lista mostra os orçamentos em ordem de cadastro, do mais recente para o mais antigo. O botão "Ver por prioridade" agrupa por urgência. O kanban mostra colunas por etapa e permite arrastar o cartão de uma coluna para outra.

AS ETAPAS (STATUS)
- Na fila: recebido, ainda não começou.
- Em andamento: alguém está trabalhando nele.
- Revisão: pronto para conferência antes de enviar.
- Elaborando nova versão: o cliente pediu mudança e o orçamento está sendo refeito.
- Pausado: aguardando alguma informação ou decisão.
- Concluído: entregue ao cliente.
Mover o cartão é a forma de avisar a equipe. Arraste assim que mudar de fase, não no fim do dia.

PRIORIDADE
Baixa, Média, Alta e Urgente. A prioridade aparece em cada linha. Ela indica o que atacar primeiro; não é enfeite. Se uma prioridade parecer errada, converse com quem a definiu em vez de trocar por conta própria.

CAMPOS DE UM ORÇAMENTO
Cliente, arquiteto ou parceiro, origem (visita, WhatsApp, loja, indicação ou outra), categoria (iluminação, automação ou as duas), tamanho, prazo, valor orçado, data da solicitação, observações, pasta do Google Drive, responsável primário e colaboradores. O responsável primário responde pelo orçamento; os colaboradores ajudam.

PRAZO
Prazo vencido aparece em vermelho no cartão. Se não conseguir cumprir, avise antes de vencer e registre o motivo nas observações.

BOAS PRÁTICAS
- Preencha as observações com tudo que a próxima pessoa precisa saber.
- Coloque plantas e arquivos na pasta do Drive do cliente e deixe o link no orçamento.
- Uma pessoa por vez como responsável primário. Se trocar, avise.
- Nunca exclua um orçamento sem alinhar com a liderança.

NA PRÁTICA HOJE
Crie um orçamento de treinamento com dados fictícios, mova-o por todas as etapas e volte para "Na fila". Depois peça à liderança para orientar como identificar orçamentos de teste.`,
        },
        {
          title: 'Leitura de Projeto: da planta ao quantitativo', kind: 'text', duration_min: 15, xp: 20,
          body: `OBJETIVO DA AULA
Usar a ferramenta como apoio ao quantitativo, mantendo a conferência técnica que você aprendeu no módulo 5.

A Leitura de Projeto permite abrir a planta, medir ambientes e marcar produtos direto sobre o desenho. Ela ajuda a ganhar tempo e reduzir erro de contagem, mas quem responde pelo resultado é você.

O QUE A FERRAMENTA OFERECE
- Girar a página, ajustar à tela e desfazer ou refazer ações.
- Marcar ambientes e medidas; corrigir uma medida diretamente quando estiver errada, sem precisar medir de novo.
- Carimbar produtos na planta e continuar carimbando o mesmo produto.
- Duplicar itens e mesclar medições.
- Trabalhar com perfil e fita juntos, além de fontes de 12 V posicionadas.
- Exportar a visualização em PDF.

COMO TRABALHAR
1. Confira a escala da planta antes de medir. Medida com escala errada gera quantitativo errado.
2. Nomeie os ambientes exatamente como na planta.
3. Leia a legenda antes de carimbar cada produto.
4. Ao terminar, faça a dupla conferência do módulo 5: contagem por ambiente e por código.
5. Exporte o PDF e anexe ao orçamento, junto da revisão da planta usada.

ATENÇÃO
A ferramenta não substitui a leitura da legenda, do memorial e das fichas técnicas. Se um número parecer estranho, volte à planta.

NA PRÁTICA HOJE
Abra uma planta de treinamento, meça dois ambientes, carimbe três produtos diferentes e exporte o PDF. Compare a contagem da ferramenta com a sua contagem manual.`,
        },
        {
          title: 'Negociações: temperatura, fechamento e perda', kind: 'text', duration_min: 14, xp: 20,
          body: `OBJETIVO DA AULA
Manter o funil de vendas real, para que a liderança decida com dados confiáveis.

A tela de Negociações mostra o funil. Cada negociação tem uma temperatura, que indica a chance de fechar.

TEMPERATURAS
- Sem previsão: ainda não há sinal claro.
- Frio: pouco interesse ou sem retorno.
- Morno: interesse real, faltam decisões.
- Quente: perto de fechar.
- Venda fechada e Perdida: negociação encerrada.
Seja honesto ao classificar. Marcar tudo como quente engana a equipe e atrapalha a previsão de vendas.

ATUALIZAÇÃO
O sistema alerta negociações com um dia ou mais sem atualização. Sempre que falar com o cliente, registre o que foi combinado e mova a temperatura, se mudou.

FECHAR UMA VENDA
Informe o valor final, a data em que a venda realmente foi fechada (não necessariamente hoje) e a forma de pagamento: PIX, cartão, dinheiro, boleto ou outra. Esses dados alimentam os relatórios e comissões; erro aqui vira erro no financeiro.

REGISTRAR UMA PERDA
Escolha o motivo: preço, concorrência, desistiu da obra, sem resposta ou outro. Os motivos mostram para a liderança onde a Luknos pode melhorar. Não esconda perdas.

NA PRÁTICA HOJE
Pegue três negociações de exemplo e classifique a temperatura de cada uma. Para cada uma, escreva qual seria o próximo contato e a data.`,
        },
        {
          title: 'Tarefas, Agenda, Projetos, Expedição e Parceiros', kind: 'text', duration_min: 14, xp: 20,
          body: `OBJETIVO DA AULA
Entender como as outras áreas se conectam ao seu orçamento.

TAREFAS E AGENDA
Registre o que precisa ser feito com data de vencimento, prioridade e, se for grande, checklist ou subtarefas. A agenda mostra também compromissos da equipe. Conclua a tarefa no sistema quando terminar; assim ninguém repete o trabalho.

PROJETOS
Acompanha projetos de clientes e arquitetos. Consulte antes de pedir uma planta que já foi enviada.

EXPEDIÇÃO
Depois da venda, o pedido segue para separação e entrega ou retirada. Os status são: na fila, em andamento, concluída, aguardando material e entregue ou retirada. A prioridade pode ser baixa, média ou alta. Quando faltar material, o status "aguardando material" avisa todo mundo; avise também o cliente com prazo real.

PARCEIROS
Reúne arquitetos, designers, engenheiros, eletricistas e outros profissionais que trazem ou acompanham obras. Cada um tem um tipo de contato. Cadastre com cuidado e associe ao orçamento o parceiro correto. Quem define condições comerciais e comissões é a liderança; não prometa valores.

CONTATOS DO SITE
Pessoas que pediram contato pelo site. Responda rápido: o primeiro atendimento pesa muito na decisão do cliente. Registre o retorno para o contato não ser atendido duas vezes.

NA PRÁTICA HOJE
Crie uma tarefa com prazo para amanhã, marque uma prioridade e adicione um checklist de três itens. Depois conclua um item.`,
        },
        {
          title: 'Teste 6: sistema Luknos', kind: 'quiz', duration_min: 10, xp: 25,
          body: 'Confirme que você sabe registrar o trabalho no sistema do jeito que a equipe precisa.',
          quiz_data: { passing_score: 70, questions: [
            { prompt: 'Quando você deve mover um orçamento para outra etapa no kanban?', options: ['Assim que a fase mudar', 'Só no fim do mês', 'Nunca, o sistema faz sozinho', 'Apenas quando o cliente reclamar'], answer: 0, explanation: 'Mover o cartão avisa a equipe em tempo real sobre o andamento.' },
            { prompt: 'Qual é a ordem padrão da lista de orçamentos?', options: ['Do mais recente cadastrado para o mais antigo', 'Do mais antigo para o mais recente', 'Alfabética por cliente', 'Sempre por valor'], answer: 0, explanation: 'A ordem padrão é por cadastro; o botão Ver por prioridade agrupa por urgência.' },
            { prompt: 'Ao fechar uma venda, qual data você informa?', options: ['A data em que a venda realmente foi fechada', 'Sempre a data de hoje', 'A data do primeiro contato', 'A data de entrega'], answer: 0, explanation: 'A data real de fechamento mantém relatórios e comissões corretos.' },
            { prompt: 'Uma negociação sem previsão clara de compra deve ser marcada como:', options: ['Sem previsão ou fria, conforme o caso', 'Quente, para animar a equipe', 'Venda fechada', 'Perdida sem motivo'], answer: 0, explanation: 'Classificar com honestidade permite prever vendas e priorizar esforço.' },
            { prompt: 'A Leitura de Projeto substitui a conferência da legenda e das fichas técnicas?', options: ['Não; ela apoia a contagem, e a conferência continua sendo sua', 'Sim, em qualquer caso', 'Sim, se a planta for colorida', 'Somente para fitas'], answer: 0, explanation: 'A ferramenta ajuda a medir e contar, mas o resultado precisa ser conferido.' },
            { prompt: 'Qual atitude é correta com dados de clientes?', options: ['Tratar como confidenciais e usar só no atendimento', 'Enviar prints em grupos pessoais', 'Compartilhar seu login para agilizar', 'Guardar só na memória'], answer: 0, explanation: 'Dados de clientes são confidenciais e o login é pessoal.' },
          ] },
        },
      ],
    },
    {
      title: '7. Vendas, parceiros e pós-venda',
      description: 'Conduzir a conversa comercial, trabalhar com profissionais da obra e cuidar do cliente depois da venda.',
      lessons: [
        {
          title: 'Objeções: preço, concorrência e prazo', kind: 'text', duration_min: 14, xp: 20,
          body: `OBJETIVO DA AULA
Responder objeções sem baixar preço por impulso e sem enganar o cliente.

OBJEÇÃO NÃO É RECUSA
Quando o cliente diz "está caro", ele quer entender se vale o valor. Pergunte antes de responder: "Caro em relação a quê? Você está comparando com uma proposta com os mesmos itens?"

COMPARE COISAS IGUAIS
Uma proposta mais barata pode ter fita sem perfil, fonte sem margem, IRC menor, garantia menor ou acessórios fora. Mostre as diferenças com calma e sem falar mal do concorrente. O que você pode dizer com segurança é o que a sua proposta inclui.

DESCONTO
Não prometa desconto que não foi aprovado. Use a política da Luknos e chame a liderança quando o cliente pedir mais. Uma alternativa melhor que descontar é ajustar a solução: menos pontos decorativos, outra linha de produto ou etapas de compra.

PRAZO
Nunca prometa prazo sem conferir estoque e prazo do fornecedor. Melhor um prazo realista do que um prazo bonito que será quebrado.

CLIENTE SUMIU
Retome com valor, não com cobrança: "Separei uma sugestão para a bancada que você comentou. Posso te mostrar?" Registre cada tentativa na negociação. Se não houver resposta após tentativas razoáveis, registre a perda com o motivo "sem resposta".

NA PRÁTICA HOJE
Treine com um colega a frase "está mais caro que o outro lugar". Faça pelo menos três perguntas antes de citar desconto.`,
        },
        {
          title: 'Trabalhando com arquitetos, eletricistas e outros profissionais', kind: 'text', duration_min: 12, xp: 20,
          body: `OBJETIVO DA AULA
Tratar o profissional da obra como parceiro, com clareza e sem quebrar regras da empresa.

QUEM PARTICIPA DA OBRA
O sistema cadastra clientes, arquitetos, designers, engenheiros, eletricistas, gestores de gesso, carpinteiros e outros. Cada um decide ou influencia uma parte do projeto: o arquiteto define conceito e especificação; o eletricista valida a instalação; o gesseiro e o marceneiro definem recortes e espaços.

COMO ATENDER
- O projeto do arquiteto é a referência. Não troque produto especificado sem falar com ele; se o item estiver em falta, proponha equivalentes técnicos e peça aprovação.
- Envie ao eletricista as informações organizadas (tensão, potência, driver, quantidades) e peça a validação por escrito.
- Avise recorte, profundidade e espaço para os profissionais de gesso e marcenaria antes da compra.
- Responda no mesmo dia, mesmo que seja para avisar que a resposta virá depois.

CONDIÇÕES COMERCIAIS
Comissão, desconto especial e condição de parceiro são definidos pela liderança. Você não promete e não compara valores entre parceiros. Se perguntarem, diga que vai confirmar e volte com a resposta.

REGISTRO
Cadastre o parceiro correto, com o tipo certo, e associe ao orçamento. Isso evita erro em comissões e mostra à liderança quem traz resultado.

NA PRÁTICA HOJE
Escreva uma mensagem para um eletricista com tudo o que ele precisa conferir em um projeto de fita LED 24 V em marcenaria.`,
        },
        {
          title: 'Da venda à entrega: expedição, troca e garantia', kind: 'text', duration_min: 12, xp: 20,
          body: `OBJETIVO DA AULA
Acompanhar o cliente depois do fechamento e resolver problemas sem improviso.

APÓS O FECHAMENTO
1. Feche a venda no sistema com valor final, data real e forma de pagamento.
2. Confirme com o cliente o que foi vendido, quantidades, acabamentos e prazo.
3. Acione a expedição com todos os dados: entrega ou retirada, endereço, contato e prioridade.
4. Se faltar material, avise o cliente com prazo real e registre.

CONFERÊNCIA NA SEPARAÇÃO
Confira código, tensão, CCT, acabamento e acessórios de cada item contra o pedido. Confira também se fonte, perfil e conectores estão junto. Erro na separação vira retrabalho, custo e cliente insatisfeito.

QUANDO ALGO DÁ ERRADO
Produto errado, faltando ou com defeito: registre o problema com fotos, descrição e número do pedido, avise a liderança e responda ao cliente rápido, com o próximo passo. Troca e garantia seguem a política da Luknos e as condições do fabricante; nunca prometa uma solução antes de confirmar.

DEPOIS DA ENTREGA
Pergunte se deu tudo certo. Um retorno simples ("ficou como você imaginava?") gera confiança, indicações e novas vendas.

NA PRÁTICA HOJE
Simule uma entrega com item faltando. Escreva a mensagem ao cliente informando o problema, o prazo previsto e o que a Luknos fará.`,
        },
        {
          title: 'Automação: o básico para atender sem prometer demais', kind: 'text', duration_min: 12, xp: 20,
          body: `OBJETIVO DA AULA
Reconhecer quando uma venda envolve automação e conduzir a conversa com segurança.

A Luknos atende iluminação, automação ou as duas. Automação inclui controle de cenas, dimerização, acionamento por aplicativo, voz, sensores e integração com outros sistemas. Ela depende da infraestrutura elétrica e do projeto.

PERGUNTAS INICIAIS
1. O que o cliente quer controlar: só luz ou também cortinas, som, ar-condicionado?
2. A obra já está executada ou ainda dá para prever infraestrutura?
3. Como o cliente quer acionar: interruptor, aplicativo, voz, cena única?
4. Há internet estável e onde ficará o equipamento central?
5. Quem instala e programa?

PONTOS DE ATENÇÃO
- Dimerização e automação exigem compatibilidade entre lâmpada, driver, dimmer e sistema.
- Obra pronta limita opções; obra em andamento permite planejar.
- Programação e instalação costumam ser etapas à parte. Deixe claro no orçamento o que está incluído.
- Não prometa integração com uma marca ou aplicativo sem confirmar com a ficha técnica ou com a liderança.

O QUE FAZER QUANDO NÃO SOUBER
Registre a necessidade, marque o orçamento como categoria automação ou iluminação + automação e chame quem domina o assunto. Levar uma boa lista de requisitos já resolve metade do trabalho.

NA PRÁTICA HOJE
Monte uma lista de dez perguntas para o primeiro contato com um cliente que quer "automatizar a casa toda".`,
        },
        {
          title: 'Teste 7: vendas e pós-venda', kind: 'quiz', duration_min: 10, xp: 25,
          body: 'Teste sua postura comercial e o cuidado com o cliente.',
          quiz_data: { passing_score: 70, questions: [
            { prompt: 'O cliente diz que outra loja está mais barata. O primeiro passo é:', options: ['Perguntar se a proposta tem os mesmos itens e especificações', 'Baixar o preço imediatamente', 'Criticar o concorrente', 'Encerrar o atendimento'], answer: 0, explanation: 'Comparar propostas equivalentes revela diferenças de acessórios, qualidade e garantia.' },
            { prompt: 'Você pode prometer desconto especial a um parceiro?', options: ['Não; condições são definidas pela liderança', 'Sim, sempre', 'Sim, se o cliente insistir', 'Somente por mensagem'], answer: 0, explanation: 'Descontos e comissões dependem de política e aprovação.' },
            { prompt: 'Faltou material para a entrega. O que fazer?', options: ['Avisar o cliente com prazo real e registrar no sistema', 'Esperar o cliente cobrar', 'Prometer o prazo mais curto possível', 'Trocar por outro item sem avisar'], answer: 0, explanation: 'Transparência e registro mantêm confiança e permitem acompanhamento.' },
            { prompt: 'Quem valida a instalação elétrica de um projeto?', options: ['O eletricista ou responsável técnico', 'O vendedor por telefone', 'O cliente sem informações', 'A embalagem do produto'], answer: 0, explanation: 'Validação elétrica é responsabilidade de profissional habilitado.' },
            { prompt: 'Um cliente quer automatizar toda a casa e a obra já está pronta. O que é correto?', options: ['Levantar requisitos e confirmar viabilidade com quem domina o assunto', 'Prometer que tudo é possível', 'Dizer que é impossível', 'Vender qualquer dimmer'], answer: 0, explanation: 'Obra pronta limita opções; confirme antes de prometer.' },
            { prompt: 'Após a entrega, qual atitude ajuda a construir confiança?', options: ['Perguntar se ficou como o cliente esperava', 'Nunca mais falar com o cliente', 'Cobrar indicação no mesmo dia', 'Apagar o histórico'], answer: 0, explanation: 'Acompanhar o resultado gera confiança, indicações e novas vendas.' },
          ] },
        },
      ],
    },
    {
      title: '8. Masterlojista e primeiros atendimentos',
      description: 'Módulo reservado para os vídeos e regras internas da Luknos.',
      lessons: [
        {
          title: 'Como estudar o Masterlojista', kind: 'text', duration_min: 8, xp: 10,
          body: `Este módulo usa os vídeos e o procedimento interno da Luknos. Não pule as conferências técnicas só porque o sistema encontrou o produto.

Em cada orçamento, compare a tela com a sua lista técnica: produto, descrição, quantidade, tensão, CCT, acabamento, fonte/driver e acessórios. Depois faça a conferência comercial: cliente, preço, desconto aprovado, prazo, estoque, frete, pagamento, validade e observações.

O resultado esperado não é apenas “saber clicar”. É gerar uma proposta que o cliente compreenda e que a equipe consiga separar e entregar sem correções.

Antes de concluir, assista aos vídeos internos definidos pela liderança e execute cada etapa no ambiente de treinamento ou com acompanhamento.`,
        },
        {
          title: 'Checklist antes de enviar um orçamento', kind: 'text', duration_min: 8, xp: 10,
          body: `Use este checklist em todos os seus primeiros atendimentos.

☐ Cliente e contato conferidos.
☐ Planta/foto/medidas e revisão registradas.
☐ Produto e quantidade conferidos contra o quantitativo.
☐ Tensão, CCT, acabamento e compatibilidade confirmados.
☐ Fontes, drivers, perfis, conectores e demais acessórios incluídos.
☐ Preço, desconto e condição comercial aprovados.
☐ Estoque, prazo, frete e validade alinhados.
☐ Instalação e adequações elétricas tratadas conforme política da Luknos.
☐ Dúvidas e premissas escritas no orçamento.
☐ Segunda pessoa conferiu quando o processo interno exigir.

Se um item essencial estiver em dúvida, não envie como definitivo. Registre a pendência e peça apoio.`,
        },
        {
          title: 'Compromisso de atendimento seguro', kind: 'text', duration_min: 6, xp: 15,
          body: `Ao concluir a trilha, você está pronto para iniciar atendimentos supervisionados. Isso significa que você sabe fazer boas perguntas, buscar informação, escolher produtos com critério e reconhecer quando precisa pedir ajuda.

Você não precisa saber tudo de memória. Profissionalismo é confirmar a ficha, consultar o projeto, chamar quem domina o assunto e registrar o que foi decidido. O erro que mais custa não é perguntar; é prometer sem confirmar.

Nos seus primeiros dez atendimentos, peça revisão de um colaborador mais experiente antes de enviar a proposta. Anote as correções: elas serão a sua melhor reciclagem.`,
        },
      ],
    },
  ],
}
