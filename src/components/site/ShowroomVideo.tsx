'use client'

import { useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { showroom } from './content'

/**
 * Player do vídeo institucional. Só carrega o arquivo quando o usuário dá play
 * (preload="none" + poster), para não pesar o carregamento da página.
 */
export function ShowroomVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const start = () => {
    videoRef.current?.play()
    setPlaying(true)
  }

  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl shadow-black/50">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={showroom.video}
        poster={showroom.poster}
        preload="none"
        playsInline
        controls={playing}
        onEnded={() => setPlaying(false)}
      />

      {!playing && (
        <button
          type="button"
          onClick={start}
          aria-label="Reproduzir vídeo de apresentação"
          className="group absolute inset-0 flex items-center justify-center bg-ink/40 transition-colors hover:bg-ink/25"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-champagne/90 text-ink transition-transform group-hover:scale-105">
            <Play size={30} className="ml-1" fill="currentColor" />
          </span>
        </button>
      )}
    </div>
  )
}
