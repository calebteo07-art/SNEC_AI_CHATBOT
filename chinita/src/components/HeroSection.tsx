"use client";
import Image from "next/image";
import { CapsulesLogo } from "./icons";

export function HeroSection() {
  return (
    <section id="hero" className="w-full h-svh p-[7.5px] mb-[90px]">
      <div className="h-full w-full rounded-[45px] overflow-hidden relative">
        {/* Background image */}
        <Image
          src="/images/cap1.png"
          alt="Capsules Hero"
          fill
          priority
          className="object-cover object-center scale-[1.2]"
          sizes="100vw"
        />
        {/* Smoke video overlay */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-60"
          style={{ mixBlendMode: "hard-light" }}
        >
          <source src="/videos/smoke_final.mp4" type="video/mp4" />
        </video>
        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col justify-between p-[22.5px]">
          {/* Top: Logo */}
          <div>
            <CapsulesLogo className="text-[#F4EFE7] w-[515px] mt-[3.75px]" />
          </div>
          {/* Bottom: tagline + description */}
          <div className="flex justify-between items-end pr-[7.5px]">
            <div
              className="text-[#F4EFE7]"
              style={{ fontSize: "36px", fontWeight: 500, lineHeight: "37.5px", letterSpacing: "-0.15px" }}
            >
              Closer to
              <br />
              Nature—Closer
              <br />
              to Yourself
            </div>
            <div
              className="text-[#F4EFE7] mb-[18px] max-w-[256px] text-right"
              style={{ fontSize: "13.5px", fontWeight: 600, lineHeight: "17.25px", letterSpacing: "-0.15px" }}
            >
              Spend unforgettable and remarkable time
              <br />
              in the Californian desert with—Capsules®.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
