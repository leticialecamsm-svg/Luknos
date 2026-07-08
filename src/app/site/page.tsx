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
  showroom,
  paths,
  stats,
  differentials,
  projects,
  testimonials,
  instagram,
  contact,
} from '@/components/site/content'
import { whatsappHref } from '@/components/site/utils'
import { Reveal } from '@/components/site/Reveal'
import { SiteNav } from '@/components/site/SiteNav'
import { FloatingWhatsApp } from '@/components/site/FloatingWhatsApp'
import { ShowroomVideo } from '@/components/site/ShowroomVideo'
import { InstagramFeed } from '@/components/site/InstagramFeed'

const pathIcons = [Lightbulb, Ruler]
const diffIcons = [Sparkles, Ruler, Lightbulb]

export default function SitePage() {
  return (
    <main id="top" className="bg-ink font-sans text-white">
      <SiteNav />
      <FloatingWhatsApp />

      {/* ================= HERO ================= */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden">
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
            <Image
              src={hero.media.src}
              alt=""
              fill
              priority
              sizes="100vw"
              className="animate-slow-zoom object-cover object-center"
            />
          ) : (
            <div className="h-full w-full animate-slow-zoom bg-gradient-to-br from-ink-800 via-ink to-black" />
          )}
          {/* Grade técnica sutil */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
          {/* Escurecimento só o suficiente para o texto (à esquerda) ficar legível,
              deixando a foto respirar à direita. */}
          <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/75 to-ink/10" />
          {/* Leve fade no topo (nav) e na base (emenda com a próxima seção) */}
          <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-ink/85" />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-6 pt-32 lg:px-10">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-champagne/30 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-champagne">
              <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
              {hero.eyebrow}
            </span>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-7 max-w-3xl font-display text-4xl font-extralight leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
              {hero.headline}
            </h1>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-white/85 [text-shadow:0_1px_12px_rgba(0,26,60,0.6)]">
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
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
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
                  <h3 className="mt-3 font-display text-2xl font-light leading-tight tracking-tight lg:text-3xl">
                    {p.title}
                  </h3>
                  <p className="mt-4 max-w-md font-light leading-relaxed text-white/65">
                    {p.description}
                  </p>
                  <ul className="mt-6 flex flex-wrap gap-2">
                    {p.bullets.map((b) => (
                      <li
                        key={b}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-light text-white/70"
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
                  <div className="font-display text-4xl font-extralight tracking-tight text-champagne lg:text-5xl">
                    {s.value}
                    <span className="text-champagne/70">{s.suffix}</span>
                  </div>
                  <div className="mt-2 text-sm font-light uppercase tracking-wide text-white/60">
                    {s.label}
                  </div>
                </Reveal>
              ))}
          </div>
        </section>
      )}

      {/* ================= SHOWROOM + LABORATÓRIO (vídeo) ================= */}
      <section
        id="showroom"
        className="relative overflow-hidden border-b border-white/10 bg-ink py-24 lg:py-32"
      >
        <div className="pointer-events-none absolute -left-40 top-1/4 h-[420px] w-[420px] rounded-full bg-champagne/10 blur-[130px]" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <Reveal>
              <span className="text-xs uppercase tracking-[0.2em] text-champagne">
                {showroom.kicker}
              </span>
              <h2 className="mt-4 max-w-md font-display text-3xl font-extralight leading-tight tracking-tight lg:text-5xl">
                {showroom.title}
              </h2>
              <p className="mt-6 max-w-md font-light leading-relaxed text-white/65">
                {showroom.description}
              </p>
              <a
                href={showroom.cta.href}
                className="group mt-8 inline-flex items-center gap-2 rounded-full border border-champagne/60 px-7 py-3.5 font-medium text-champagne transition-colors hover:bg-champagne hover:text-ink"
              >
                {showroom.cta.label}
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </a>
            </Reveal>

            <Reveal delay={150}>
              <ShowroomVideo />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= DIFERENCIAIS ================= */}
      <section id="sobre" className="bg-ink py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <Reveal>
              <span className="text-xs uppercase tracking-[0.2em] text-champagne">
                A Luknos
              </span>
              <h2 className="mt-4 font-display text-3xl font-extralight leading-tight tracking-tight lg:text-4xl">
                {brand.tagline}
              </h2>
              <p className="mt-6 max-w-md font-light leading-relaxed text-white/65">
                {brand.about}
              </p>
            </Reveal>

            <div className="grid gap-4">
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
                      <h3 className="font-display text-lg font-normal">{d.title}</h3>
                      <p className="mt-1 font-light text-white/60">{d.text}</p>
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
              <h2 className="mt-4 max-w-xl font-display text-3xl font-extralight leading-tight tracking-tight lg:text-5xl">
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

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {projects.map((p, i) => (
              <Reveal
                key={p.src}
                delay={(i % 3) * 100}
                as="article"
                className={`group relative overflow-hidden rounded-2xl ${
                  'wide' in p && p.wide ? 'col-span-2 row-span-2' : ''
                }`}
              >
                <div
                  className={`relative ${
                    'wide' in p && p.wide ? 'aspect-square lg:aspect-[4/5]' : 'aspect-[3/4]'
                  }`}
                >
                  <Image
                    src={p.src}
                    alt={p.title}
                    fill
                    sizes="(max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-ink/95 via-ink/10 to-transparent p-5 lg:p-6">
                  <div className="translate-y-2 transition-transform duration-500 group-hover:translate-y-0">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-champagne">
                      {p.tag}
                    </div>
                    <div className="mt-1 font-display text-base font-light leading-tight lg:text-xl">
                      {p.title}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= INSTAGRAM ================= */}
      <section id="instagram" className="border-t border-white/10 bg-ink py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <Reveal className="mb-14 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs uppercase tracking-[0.2em] text-champagne">
                {instagram.kicker}
              </span>
              <h2 className="mt-4 max-w-xl font-display text-3xl font-extralight leading-tight tracking-tight lg:text-5xl">
                {instagram.title}
              </h2>
            </div>
            <a
              href={instagram.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 whitespace-nowrap font-medium text-champagne hover:text-champagne-light"
            >
              <Instagram size={18} />
              {instagram.handle}
            </a>
          </Reveal>

          <Reveal delay={120}>
            <InstagramFeed />
          </Reveal>
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
                  <Quote className="text-champagne/50" size={30} />
                  <p className="mt-5 font-display text-xl font-light leading-relaxed text-white/90">
                    “{t.quote}”
                  </p>
                  <footer className="mt-6 text-sm">
                    <div className="font-medium text-white">{t.author}</div>
                    <div className="font-light text-white/50">{t.role}</div>
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
              <h2 className="font-display text-3xl font-extralight leading-tight tracking-tight lg:text-5xl">
                {contact.headline}
              </h2>
              <p className="mt-5 max-w-md text-lg font-light text-white/65">
                {contact.subtitle}
              </p>
              <a
                href={whatsappHref(contact.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-champagne px-8 py-4 font-medium text-ink transition-colors hover:bg-champagne-light"
              >
                Falar no WhatsApp
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
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
          <p className="text-sm font-light text-white/40">
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
        <div className="font-light text-white/90">{value}</div>
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
