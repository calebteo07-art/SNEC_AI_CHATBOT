import Image from "next/image";

export function WelcomeSection() {
  return (
    <section id="welcome" className="w-full px-[22.5px] py-[60px]">
      <div className="flex gap-12 items-start">
        <div className="flex-1">
          <p
            className="text-[#F4EFE7] leading-tight"
            style={{ fontSize: "32px", fontWeight: 400, lineHeight: "1.2" }}
          >
            Welcome to a world of wild California desert with Capsules®, where you will discover exquisite nature observing it from capsule houses, nestled in the one of the most breathtaking destination on the United States.
          </p>
          <p className="mt-8 text-[#F4EFE7]/70 text-base">
            A place where you can be with yourself and your loved ones.
          </p>
        </div>
        <div className="flex flex-col gap-4 w-[280px] shrink-0">
          <div className="relative h-[180px] rounded-[20px] overflow-hidden">
            <Image src="/images/welcome-1.png" alt="Welcome 1" fill className="object-cover" />
          </div>
          <div className="relative h-[180px] rounded-[20px] overflow-hidden">
            <Image src="/images/welcome-2.png" alt="Welcome 2" fill className="object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}
