'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'
import { computePeaks, fallbackPeaks, formatClock, nextSpeed, ratioFromPointer, speedLabel } from '@/lib/audio-ui'
import { cn } from '@/lib/utils'

const BARS = 44
const SPEED_KEY = 'crm-audio-speed'
const peaksCache = new Map<string, number[]>()

// Player de mensagem de voz estilo WhatsApp: onda clicável/arrastável para ir a
// qualquer ponto, velocidade 1x/1,5x/2x e só um áudio toca por vez.
export function AudioPlayer({ src, mimeType, fileName, tone = 'light' }: { src: string; mimeType?: string | null; fileName?: string | null; tone?: 'light' | 'blue' }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [peaks, setPeaks] = useState<number[]>(() => peaksCache.get(src) ?? fallbackPeaks(src.slice(-40), BARS))
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  // velocidade escolhida fica lembrada
  useEffect(() => {
    try { const v = Number(localStorage.getItem(SPEED_KEY)); if (v === 1.5 || v === 2) setRate(v) } catch { /* sem preferência */ }
  }, [])
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate }, [rate, src])

  // onda real do áudio (decodifica no navegador; se não der, fica a onda de enfeite)
  useEffect(() => {
    if (peaksCache.has(src)) { setPeaks(peaksCache.get(src)!); return }
    let cancelled = false
    ;(async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer()
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
        const ctx = new Ctx()
        const decoded = await ctx.decodeAudioData(buf.slice(0))
        ctx.close?.()
        const p = computePeaks(decoded.getChannelData(0), BARS)
        peaksCache.set(src, p)
        if (!cancelled) { setPeaks(p); if (!Number.isFinite(duration) || duration === 0) setDuration(decoded.duration) }
      } catch { /* mantém a onda de enfeite */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // um áudio por vez
  useEffect(() => {
    const onOther = (e: Event) => { if ((e as CustomEvent).detail !== audioRef.current) audioRef.current?.pause() }
    window.addEventListener('crm-audio-play', onOther)
    return () => window.removeEventListener('crm-audio-play', onOther)
  }, [])

  const dur = Number.isFinite(audioRef.current?.duration) && (audioRef.current?.duration ?? 0) > 0 ? audioRef.current!.duration : duration

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      window.dispatchEvent(new CustomEvent('crm-audio-play', { detail: a }))
      setLoading(true)
      a.play().catch(() => { setFailed(true) }).finally(() => setLoading(false))
    } else a.pause()
  }, [])

  function seekTo(clientX: number) {
    const a = audioRef.current; const w = waveRef.current
    if (!a || !w) return
    const r = w.getBoundingClientRect()
    const d = dur || a.duration
    if (!Number.isFinite(d) || d <= 0) return
    const t = ratioFromPointer(clientX, r.left, r.width) * d
    a.currentTime = t
    setCurrent(t)
  }

  function cycleSpeed() {
    const n = nextSpeed(rate)
    setRate(n)
    try { localStorage.setItem(SPEED_KEY, String(n)) } catch { /* ignore */ }
  }

  const progress = dur > 0 ? Math.min(1, current / dur) : 0
  const accent = tone === 'blue' ? 'bg-[#2F5C9E]' : 'bg-[#0A1F3B]'

  if (failed) {
    return (
      <a href={src} download={fileName ?? 'audio.ogg'} className="text-xs underline text-blue-700">🎙️ Não foi possível tocar aqui — baixar áudio</a>
    )
  }

  return (
    <div className="flex items-center gap-2.5 min-w-[240px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onTimeUpdate={(e) => { if (!dragging.current) setCurrent(e.currentTarget.currentTime) }}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d) }}
        onError={() => setFailed(true)}
      >
        {mimeType && <source src={src} type={mimeType.split(';')[0]} />}
      </audio>

      <button type="button" onClick={toggle} aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'}
        className={cn('w-9 h-9 shrink-0 rounded-full text-white flex items-center justify-center hover:opacity-90', accent)}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          ref={waveRef}
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur) || 0}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatClock(current)} de ${formatClock(dur)}`}
          className="relative h-8 flex items-center gap-[2px] cursor-pointer touch-none select-none"
          onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekTo(e.clientX) }}
          onPointerMove={(e) => { if (dragging.current) seekTo(e.clientX) }}
          onPointerUp={() => { dragging.current = false }}
          onPointerCancel={() => { dragging.current = false }}
          onKeyDown={(e) => {
            const a = audioRef.current
            if (!a) return
            if (e.key === 'ArrowRight') { e.preventDefault(); a.currentTime = Math.min(dur, a.currentTime + 5) }
            if (e.key === 'ArrowLeft') { e.preventDefault(); a.currentTime = Math.max(0, a.currentTime - 5) }
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle() }
          }}
        >
          {peaks.map((p, i) => (
            <span key={i} className={cn('flex-1 rounded-full min-w-[2px]', (i + 0.5) / peaks.length <= progress ? accent : 'bg-black/20')} style={{ height: `${Math.round(p * 100)}%` }} />
          ))}
          {/* bolinha de posição */}
          <span className={cn('absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full', accent)} style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-gray-500 leading-none mt-0.5">
          <span>{playing || current > 0 ? formatClock(current) : formatClock(dur)}{dur > 0 && (playing || current > 0) ? ` / ${formatClock(dur)}` : ''}</span>
        </div>
      </div>

      <button type="button" onClick={cycleSpeed} aria-label={`Velocidade ${speedLabel(rate)}. Clique para mudar`} title="Velocidade de reprodução"
        className="shrink-0 min-w-[2.6rem] px-1.5 py-1 text-xs font-semibold rounded-full bg-black/10 hover:bg-black/20 text-gray-800">
        {speedLabel(rate)}
      </button>
    </div>
  )
}
