import { HeroSection } from "@/components/HeroSection";
import { FloatingNav } from "@/components/FloatingNav";
import { WelcomeSection } from "@/components/WelcomeSection";
import { ChooseSection } from "@/components/ChooseSection";
import { MarqueeSection } from "@/components/MarqueeSection";
import { CapsulesFeatureSection } from "@/components/CapsulesFeatureSection";
import { ReviewsSection } from "@/components/ReviewsSection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="bg-[#181717] min-h-screen">
      <FloatingNav />
      <HeroSection />
      <WelcomeSection />
      <ChooseSection />
      <MarqueeSection />
      <CapsulesFeatureSection />
      <ReviewsSection />
      <Footer />
    </main>
  );
}
