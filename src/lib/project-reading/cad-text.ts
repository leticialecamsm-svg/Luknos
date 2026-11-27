// Leitura de textos na plotagem girada.

/**
 * Um texto precisa ser virado 180° no papel? `angulo` é a inclinação dele no
 * desenho em tela (radianos, sentido horário) e `giro` o giro da planta (graus).
 * Vale a regra das pranchas: lê-se de baixo ou pela direita.
 */
export function deCabecaPraBaixo(angulo: number, giro: number) {
  let a = (angulo + (giro * Math.PI) / 180) % (2 * Math.PI)
  if (a > Math.PI) a -= 2 * Math.PI
  if (a <= -Math.PI) a += 2 * Math.PI
  return a >= Math.PI / 2 - 0.01 || a < -Math.PI / 2 - 0.01
}

/** As fontes padrão do PDF só têm o alfabeto latino. */
export const safeText = (t: string) => t.replace(/≈/g, '~').replace(/[^\x20-\x7E\xA0-\xFF—–‘’“”•…€]/g, '?')

/** Quebra o texto em linhas que cabem em `max`; palavra maior que a linha é partida. */
export function quebrarLinhas(t: string, largura: (s: string) => number, max: number): string[] {
  const out: string[] = []
  let atual = ''
  for (let palavra of safeText(t).split(/\s+/).filter(Boolean)) {
    const junto = atual ? `${atual} ${palavra}` : palavra
    if (largura(junto) <= max) { atual = junto; continue }
    if (atual) out.push(atual)
    while (palavra.length > 1 && largura(palavra) > max) {
      let n = palavra.length - 1
      while (n > 1 && largura(palavra.slice(0, n)) > max) n--
      out.push(palavra.slice(0, n)); palavra = palavra.slice(n)
    }
    atual = palavra
  }
  if (atual) out.push(atual)
  return out.length ? out : ['-']
}
