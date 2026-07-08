import Image from 'next/image'
import {
  ArrowRight,
  ArrowUpRight,
  Lightbulb,
  Ruler,
  Sparkles,
  Quote,
  Mail,
  Instagram,
  MapPin,
  Clock,
  Phone,
  type LucideIcon,
} from 'lucide-react'
import {
  brand,
  hero,
  paths,
  stats,
  differentials,
  projects,
  testimonials,
  contact,
} from '@/components/site/content'
import { whatsappHref } from '@/components/site/utils'
import { Reveal } from '@/components/site/Reveal'
import { SiteNav } from '@/components/site/SiteNav'
import { FloatingWhatsApp } from '@/components/site/FloatingWhatsApp'

/* Placeholder de mídia premium — vira <Image> assim que houver `src`. */
function MediaFrame({
  src,
  alt,
  label,
  className = '',
}: {
  src: string | null
  alt: string
  label?: string
  className?: string
}) {
  if (src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image src={src} alt={alt} fill className="object-cover" />
      </div>
    )
  }
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-ink-700 via-ink to-ink-800 ${className}`}
    >
      {/* brilho champagne sutil */}
      <div className="pointer-events-none absolute -right-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-champagne/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(228,201,131,0.10),transparent_55%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <Lightbulb className="text-champagne/70" size={30} />
        {label && (
          <span className="text-xs uppercase tracking-[0.25em] text-white/40">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

const pathIcons = [Lightbulb, Ruler]
const diffIcons = [Sparkles, Ruler, Lightbulb]

export default function SitePage() {
  return (
    <main id="top" className="bg-ink font-sans text-white">
      <SiteNav />
      <FloatingWhatsApp />

      {/* ================= HERO ================= */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden">
        {/* Fundo: vídeo, imagem ou gradiente estilizado */}
        <div className="absolute inset-0">
          {hero.media?.type === 'video' ? (
            <video
              className="h-full w-full object-cover"
              src={hero.media.src}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : hero.media?.type === 'image' ? (
            <Image src={hero.media.src} alt="" fill priority className="object-cover" />
          ) : (
            <div className="h-full w-full animate-slow-zoom bg-gradient-to-br from-ink-800 via-ink to-black" />
          )}
          {/* Grade técnica sutil (toque tecnológico) */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
          {/* Glow champagne */}
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-champagne/20 blur-[120px]" />
          {/* Vinheta para leitura */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/70" />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-6 pt-32 lg:px-10">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-champagne/30 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-champagne">
              <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
              {hero.eyebrow}
            </span>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-6 max-w-3xl font-display text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              {hero.headline}
            </h1>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              {hero.subtitle}
            </p>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <a
                href={hero.ctaPrimary.href}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-champagne px-7 py-4 font-medium text-ink transition-colors hover:bg-champagne-light"
              >
                {hero.ctaPrimary.label}
                <ArrowRight
                  size={18}
                  className="transition-transform group-hover:translate-x-1"
                />
              </a>
              <a
                href={hero.ctaSecondary.href}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-7 py-4 font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5"
              >
                {hero.ctaSecondary.label}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= DOIS CAMINHOS (Loja / Projeto) ================= */}
      <section className="relative border-t border-white/10 bg-ink py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-2">
            {paths.map((p, i) => {
              const Icon = pathIcons[i] ?? Lightbulb
              return (
                <Reveal
                  key={p.id}
                  delay={i * 120}
                  as="article"
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 transition-colors hover:border-champagne/40 lg:p-10"
                >
                  <div id={p.id} className="absolute -top-24" />
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
                    <Icon size={26} />
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em] text-champagne">
                    {p.kicker}
                  </span>
                  <h3 className="mt-3 font-display text-3xl font-medium leading-tight lg:text-4xl">
                    {p.title}
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-white/65">
                    {p.description}
                  </p>
                  <ul className="mt-6 flex flex-wrap gap-2">
                    {p.bullets.map((b) => (
                      <li
                        key={b}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70"
                      >
                        {b}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={p.cta.href}
                    className="mt-8 inline-flex items-center gap-2 font-medium text-champagne transition-colors group-hover:text-champagne-light"
                  >
                    {p.cta.label}
                    <ArrowUpRight size={18} />
                  </a>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ================= AUTORIDADE (stats) ================= */}
      {stats.some((s) => s.value) && (
        <section className="relative overflow-hidden border-y border-champagne/20 bg-gradient-to-r from-ink-800 via-ink to-ink-800 py-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(203,164,85,0.15),transparent_60%)]" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 lg:grid-cols-4 lg:px-10">
            {stats
              .filter((s) => s.value)
              .map((s, i) => (
                <Reveal key={s.label} delay={i * 100} className="text-center">
                  <div className="font-display text-5xl font-semibold text-champagne lg:text-6xl">
                    {s.value}
                    <span className="text-champagne/70">{s.suffix}</span>
                  </div>
                  <div className="mt-2 text-sm uppercase tracking-wide text-white/60">
                    {s.label}
                  </div>
                </Reveal>
              ))}
          </div>
        </section>
      )}

      {/* ================= DIFERENCIAIS ================= */}
      <section id="sobre" className="bg-ink py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <Reveal>
              <span className="text-xs uppercase tracking-[0.2em] text-champagne">
                A Luknos
              </span>
              <h2 className="mt-4 font-display text-4xl font-medium leading-tight lg:text-5xl">
                {brand.tagline}
              </h2>
              <p className="mt-6 max-w-md leading-relaxed text-white/65">
                {brand.about}
              </p>
            </Reveal>

            <div className="grid gap-4 sm:grid-cols-1">
              {differentials.map((d, i) => {
                const Icon = diffIcons[i] ?? Sparkles
                return (
                  <Reveal
                    key={d.title}
                    delay={i * 120}
                    className="flex gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-champagne/10 text-champagne">
                      <Icon size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">{d.title}</h3>
                      <p className="mt-1 text-white/60">{d.text}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ================= PORTFÓLIO ================= */}
      <section id="portfolio" className="border-t border-white/10 bg-ink py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <Reveal className="mb-14 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs uppercase tracking-[0.2em] text-champagne">
                Projetos
              </span>
              <h2 className="mt-4 max-w-xl font-display text-4xl font-medium leading-tight lg:text-5xl">
                Ambientes que ganham vida com a luz certa
              </h2>
            </div>
            <a
              href="#contato"
              className="inline-flex items-center gap-2 whitespace-nowrap font-medium text-champagne hover:text-champagne-light"
            >
              Quero um projeto assim
              <ArrowRight size={18} />
            </a>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <Reveal
                key={p.title}
                delay={(i % 3) * 100}
                as="article"
                className="group relative"
              >
                <MediaFrame
                  src={p.src}
                  alt={p.title}
                  label={p.tag}
                  className={`rounded-2xl ${i % 5 === 0 ? 'aspect-[4/5]' : 'aspect-square'}`}
                />
                <div className="pointer-events-none absolute inset-0 flex items-end rounded-2xl bg-gradient-to-t from-ink/90 via-transparent to-transparent p-6 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-champagne">
                      {p.tag}
                    </div>
                    <div className="mt-1 font-display text-2xl">{p.title}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= DEPOIMENTOS ================= */}
      {testimonials.length > 0 && (
        <section className="border-t border-white/10 bg-ink py-24 lg:py-32">
          <div className="mx-auto max-w-6xl px-6 lg:px-10">
            <Reveal className="mb-14 text-center">
              <span className="text-xs uppercase tracking-[0.2em] text-champagne">
                Quem confia
              </span>
            </Reveal>
            <div className="grid gap-6 md:grid-cols-2">
              {testimonials.map((t, i) => (
                <Reveal
                  key={i}
                  delay={i * 120}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 lg:p-10"
                >
                  <Quote className="text-champagne/50" size={32} />
                  <p className="mt-5 font-display text-2xl leading-relaxed text-white/90">
                    “{t.quote}”
                  </p>
                  <footer className="mt-6 text-sm">
                    <div className="font-medium text-white">{t.author}</div>
                    <div className="text-white/50">{t.role}</div>
                  </footer>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= CTA + CONTATO ================= */}
      <section
        id="contato"
        className="relative overflow-hidden border-t border-champagne/20 bg-gradient-to-b from-ink to-black py-24 lg:py-32"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-champagne/15 blur-[130px]" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <h2 className="font-display text-4xl font-medium leading-tight lg:text-6xl">
                {contact.headline}
              </h2>
              <p className="mt-5 max-w-md text-lg text-white/65">
                {contact.subtitle}
              </p>
              <a
                href={whatsappHref(contact.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-champagne px-8 py-4 font-medium text-ink transition-colors hover:bg-champagne-light"
              >
                Falar no WhatsApp
                <ArrowRight
                  size={18}
                  className="transition-transform group-hover:translate-x-1"
                />
              </a>
            </Reveal>

            <Reveal delay={150} className="grid gap-4">
              <ContactRow icon={Phone} label="WhatsApp" value={contact.whatsapp.display} href={whatsappHref(contact.whatsapp)} />
              <ContactRow icon={Mail} label="E-mail" value={contact.email} href={`mailto:${contact.email}`} />
              <ContactRow icon={Instagram} label="Instagram" value={contact.instagram.handle} href={contact.instagram.url} />
              <ContactRow icon={MapPin} label="Endereço" value={contact.address} />
              <ContactRow icon={Clock} label="Horário" value={contact.hours} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= RODAPÉ ================= */}
      <footer className="border-t border-white/10 bg-black py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row lg:px-10">
          <div className="relative h-8 w-[128px]">
            <Image src="/logo-white.svg" alt="Luknos Iluminação" fill className="object-contain object-left" />
          </div>
          <p className="text-sm text-white/40">
            © {new Date().getFullYear()} {brand.name}. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </main>
  )
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon
  label: string
  value: string
  href?: string
}) {
  const inner = (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 transition-colors hover:border-champagne/40">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-champagne/10 text-champagne">
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
        <div className="text-white/90">{value}</div>
      </div>
    </div>
  )
  return href ? (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    inner
  )
}
