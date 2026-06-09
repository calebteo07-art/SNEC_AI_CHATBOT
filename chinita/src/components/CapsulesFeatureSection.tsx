"use client";
import { useState } from "react";
import Image from "next/image";

const panels = [
  {
    num: "01",
    heading: "Enjoy the view through—the wide panoramic glass window",
    body: "Get closer to the desert nature than ever before and admire this unique, breathtaking landscape.",
    img: "/images/cap3-square.jpg",
  },
  {
    num: "02",
    heading: "Sound of silence—out of the city rush with completely privacy",
    body: "Here, every whisper of nature recharges your soul—your sanctuary of solitude awaits.",
    img: "/images/cap2-square.jpg",
  },
  {
    num: "03",
    heading: "Relax yourself in—Wooden Jacuzzi",
    body: "Let the natural textures and warm waters melt away the stresses of everyday life.",
    img: "/images/cap1-square.jpg",
  },
];

export function CapsulesFeatureSection() {
  const [active, setActive] = useState(0);
  const p = panels[active];
  return (
    <section id="capsules" className="w-full h-screen flex bg-[#181717] overflow-hidden">
      <div className="flex-1 flex flex-col justify-between p-[45px]">
        <div className="flex gap-2">
          {panels.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`text-sm font-medium transition-colors ${i === active ? "text-[#F4EFE7]" : "text-[#F4EFE7]/30"}`}
            >
              {String(i + 1).padStart(2, "0")}/{panels.length.toString().padStart(2, "0")}
            </button>
          ))}
        </div>
        <div>
          <h2
            className="text-[#F4EFE7] mb-6"
            style={{ fontSize: "42px", fontWeight: 500, lineHeight: "1.1", letterSpacing: "-0.5px" }}
          >
            {p.heading}
          </h2>
          <p className="text-[#F4EFE7]/60 text-base leading-relaxed max-w-[360px]">{p.body}</p>
        </div>
      </div>
      <div className="w-[55%] relative">
        <Image
          key={p.img}
          src={p.img}
          alt={p.heading}
          fill
          className="object-cover transition-opacity duration-500"
          sizes="55vw"
        />
      </div>
    </section>
  );
}
