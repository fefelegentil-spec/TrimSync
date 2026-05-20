import { GlowCard } from '../components/ui/spotlight-card'
import { Scissors, CalendarCheck, Instagram } from 'lucide-react'

export function Default() {
  return (
    <div className="w-screen min-h-screen flex flex-col items-center justify-center gap-12 bg-background px-6 py-16">
      <h1 className="text-3xl font-bold text-foreground tracking-tight">
        GlowCard — Spotlight Component
      </h1>

      <div className="flex flex-row flex-wrap items-center justify-center gap-10">

        <GlowCard glowColor="teal" size="sm">
          <div className="flex flex-col gap-2">
            <Scissors className="w-8 h-8 text-cyan-400" />
            <p className="text-sm font-semibold text-foreground">Coupe Simple</p>
            <p className="text-xs text-muted-foreground">30 min — 25 €</p>
          </div>
        </GlowCard>

        <GlowCard glowColor="teal" size="md">
          <div className="flex flex-col gap-2">
            <CalendarCheck className="w-9 h-9 text-cyan-400" />
            <p className="text-base font-semibold text-foreground">Réservation IA</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              TrimSync prend vos rendez-vous Instagram automatiquement, 24/7.
            </p>
          </div>
        </GlowCard>

        <GlowCard glowColor="teal" size="lg">
          <div className="flex flex-col gap-3">
            <Instagram className="w-10 h-10 text-cyan-400" />
            <p className="text-lg font-bold text-foreground">Instagram DMs</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connectez votre compte Instagram. L'IA répond à chaque DM et confirme
              les créneaux disponibles.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">300+ barbers</span>
            <span className="text-xs font-semibold text-cyan-400">Actif →</span>
          </div>
        </GlowCard>

      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Taille personnalisée</p>
        <GlowCard glowColor="teal" customSize width={480} height={120}
          className="rounded-xl p-6 flex items-center gap-6">
          <CalendarCheck className="w-10 h-10 text-cyan-400 shrink-0" />
          <div>
            <p className="font-semibold text-foreground">Premier mois gratuit</p>
            <p className="text-sm text-muted-foreground">Sans carte bancaire · Configuré en 10 minutes</p>
          </div>
        </GlowCard>
      </div>
    </div>
  )
}
