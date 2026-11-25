import Link from "next/link";
import { ClawMark } from "../ui/Logo";
import { Lottie } from "../scene/Lottie";
import { GlassCard } from "../ui/GlassCard";
import { Reveal } from "../ui/Reveal";

export function PlayNow() {
  return (
    <section id="play-now" className="relative py-28 px-4 sm:px-8 border-t border-white/5">
      <Reveal className="max-w-5xl mx-auto">
        <GlassCard className="cta-rect rounded-3xl p-8 sm:p-12 border border-accent/25 flex flex-col md:flex-row md:items-center md:justify-between gap-8 md:gap-12 relative overflow-hidden">
          <div className="flex items-start gap-5 text-left md:flex-1 lg:max-w-[27rem] lg:flex-none">
            <div className="hidden sm:flex w-14 h-14 shrink-0 rounded-2xl bg-accent/15 border border-accent/40 items-center justify-center">
              <ClawMark className="w-7 h-7" sw={2.2} />
            </div>
            <div>
              <h2 className="font-display font-bold text-3xl sm:text-5xl text-ink">Ready to drop?</h2>
              <p className="text-muted text-[1rem] sm:text-lg mt-2">Connect your wallet. One credit, one drop, one creature.</p>
              <p className="mt-3 font-mono text-xs text-muted">Devnet · plays are real, funds are test SOL.</p>
            </div>
          </div>
          <div className="hidden lg:flex absolute right-[290px] bottom-0 items-end pointer-events-none">
            <Lottie name="monstersCute" className="w-36 h-36 block" />
            <Lottie name="monstersFunny" className="w-40 h-40 block -ml-4" />
          </div>
          <Link href="/play?connect=1" className="spring-btn md:flex-none md:self-center w-full md:w-auto md:min-w-[250px] px-10 py-4 rounded-xl bg-white hover:bg-[#F3EEE6] text-[#14110F] font-display font-semibold text-lg cursor-pointer text-center">
            Connect wallet
          </Link>
        </GlassCard>
      </Reveal>
    </section>
  );
}
