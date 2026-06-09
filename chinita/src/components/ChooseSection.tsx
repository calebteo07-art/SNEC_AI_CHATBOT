import Image from "next/image";

const capsules = [
  { name: "Classic Capsule®", img: "/images/cap3.png", desc: "Classic Capsule® boasts refined aesthetics and a modern interior, creating an intimate space for a unique desert experience." },
  { name: "Terrace Capsule®", img: "/images/cap2.png", desc: "Terrace Capsule® offers a private outdoor terrace with breathtaking panoramic views of the California desert." },
  { name: "Desert Capsule®", img: "/images/cap1.png", desc: "Desert Capsule® immerses you in the raw beauty of nature with floor-to-ceiling glass and an open-air design." },
];

export function ChooseSection() {
  return (
    <section id="choose" className="w-full px-[22.5px] py-[60px]">
      <p className="text-[#F4EFE7]/60 text-sm font-medium mb-4">Discover available Capsules®</p>
      <h2
        className="text-[#F4EFE7] mb-8"
        style={{ fontSize: "56px", fontWeight: 500, lineHeight: "1", letterSpacing: "-1px" }}
      >
        Choose the one you like best
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {capsules.map((c) => (
          <div key={c.name} className="group cursor-pointer">
            <div className="relative h-[320px] rounded-[30px] overflow-hidden mb-4">
              <Image src={c.img} alt={c.name} fill className="object-cover scale-[1.3] group-hover:scale-[1.35] transition-transform duration-700" />
            </div>
            <h3 className="text-[#F4EFE7] text-xl font-medium mb-2">{c.name}</h3>
            <p className="text-[#F4EFE7]/60 text-sm leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-6 mt-8 text-sm text-[#F4EFE7]/60">
        {["Sustainable", "Nature—Care", "Smart Privacy", "Spacious", "Glassed-in"].map((f) => (
          <span key={f} className="border border-[#F4EFE7]/20 rounded-full px-4 py-1">{f}</span>
        ))}
      </div>
    </section>
  );
}
