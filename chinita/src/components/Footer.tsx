export function Footer() {
  const bookText = "Book your capsule— ";
  const repeated = bookText.repeat(8);
  return (
    <footer className="w-full bg-[#181717] border-t border-[#F4EFE7]/10">
      <div className="px-[22.5px] py-[60px] flex justify-between items-start">
        <div>
          <p
            className="text-[#F4EFE7]"
            style={{ fontSize: "36px", fontWeight: 500, lineHeight: "1.1", letterSpacing: "-0.5px" }}
          >
            Closer to
            <br />
            Nature—Closer
            <br />
            to Yourself
          </p>
          <p className="mt-4 text-[#F4EFE7]/50 text-sm max-w-xs">
            Spend unforgettable and remarkable time in the Californian desert with—Capsules.
          </p>
        </div>
        <div>
          <p className="text-[#F4EFE7]/50 text-sm mb-4">Interested in an amazing adventure?</p>
          <p className="text-[#F4EFE7] text-base font-medium">Reserve one of our Capsules®</p>
        </div>
      </div>
      <div className="overflow-hidden py-6 border-t border-[#F4EFE7]/10">
        <div className="flex whitespace-nowrap animate-marquee">
          <span className="text-[#F4EFE7]/20 shrink-0 text-2xl font-medium">{repeated}</span>
          <span className="text-[#F4EFE7]/20 shrink-0 text-2xl font-medium">{repeated}</span>
        </div>
      </div>
      <div className="px-[22.5px] py-4 border-t border-[#F4EFE7]/10">
        <p className="text-[#F4EFE7]/30 text-xs">This website is a concept work done for EyeBot.</p>
      </div>
    </footer>
  );
}
