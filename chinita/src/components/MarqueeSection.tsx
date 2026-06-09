export function MarqueeSection() {
  const text = "Why Capsules®?* ";
  const repeated = text.repeat(8);
  return (
    <section
      className="relative overflow-hidden py-10"
      style={{ background: "linear-gradient(#181717, #332E2B, #181717)" }}
    >
      <div className="flex whitespace-nowrap animate-marquee">
        <span
          className="text-[#F4EFE7]/40 shrink-0"
          style={{ fontSize: "48px", fontWeight: 500, letterSpacing: "-1px" }}
        >
          {repeated}
        </span>
        <span
          className="text-[#F4EFE7]/40 shrink-0"
          style={{ fontSize: "48px", fontWeight: 500, letterSpacing: "-1px" }}
        >
          {repeated}
        </span>
      </div>
    </section>
  );
}
