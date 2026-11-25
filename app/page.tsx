import { brand } from "./theme/brand";
import { CardEffects } from "./ui/CardEffects";
import { Hero } from "./landing/Hero";
import { HowItWorks } from "./landing/HowItWorks";
import { LandingHeader } from "./landing/LandingHeader";
import { PlayNow } from "./landing/PlayNow";
import { Prizes } from "./landing/Prizes";

/** The landing page: marketing only. No wallet or chain code is loaded here. */
export default function Landing() {
  return (
    <div className="relative w-full arcade-grid">
      <CardEffects />
      <LandingHeader />
      <Hero />
      <HowItWorks />
      <Prizes />
      <PlayNow />
      <footer className="py-8 px-4 border-t border-white/5 text-center text-xs font-mono text-muted">{brand.footer}</footer>
    </div>
  );
}
