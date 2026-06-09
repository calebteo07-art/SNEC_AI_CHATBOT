import Image from "next/image";

const reviews = [
  {
    text: "Staying at Capsules® in the California desert redefined my retreat — modern design meets nature, and every sunset feels like a serene masterpiece.",
    name: "Marcus Simpson",
    location: "New York",
    img: "/images/review1.png",
  },
  {
    text: "Capsules® offered the perfect escape — sleek, modern spaces surrounded by desert stillness. Each moment felt peaceful, grounded, and truly unique.",
    name: "Lena Morrison",
    location: "Los Angeles",
    img: "/images/review2.png",
  },
  {
    text: "Capsules® was the perfect desert hideaway — stylish, peaceful, and fully surrounded by stunning views day and night.",
    name: "Jason Whitaker",
    location: "San Francisco",
    img: "/images/review3.png",
  },
];

export function ReviewsSection() {
  return (
    <section id="reviews" className="w-full px-[22.5px] py-[90px]">
      <h2
        className="text-[#F4EFE7] mb-12"
        style={{ fontSize: "56px", fontWeight: 500, letterSpacing: "-1px" }}
      >
        Do people like us?
      </h2>
      <div className="grid grid-cols-3 gap-8">
        {reviews.map((r) => (
          <div key={r.name} className="flex flex-col gap-4">
            <p className="text-[#F4EFE7]/80 text-base leading-relaxed flex-1">{r.text}</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden relative shrink-0">
                <Image src={r.img} alt={r.name} fill className="object-cover" />
              </div>
              <div>
                <p className="text-[#F4EFE7] text-sm font-semibold">{r.name}</p>
                <p className="text-[#F4EFE7]/50 text-xs">({r.location})</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
