"use client";
import { useState, useEffect } from "react";

export function FloatingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMenuMounted(true), 600);
  }, []);

  return (
    <>
      {/* Reserve button - top right */}
      <div className="fixed top-0 w-full z-50 pointer-events-none">
        <div className="flex justify-end p-[15px]">
          <button
            className="pointer-events-auto flex items-center gap-2 bg-[#F4EFE7] text-[#181717] rounded-full px-4 py-2 text-sm font-semibold hover:bg-white transition-colors"
            onClick={() => {}}
          >
            Reserve
            <span className="w-6 h-6 bg-[#181717] rounded-full flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 8L8 2M8 2H3M8 2V7" stroke="#F4EFE7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        </div>
      </div>

      {/* Menu button - bottom center */}
      <div
        className="fixed bottom-[37.5px] left-0 right-0 flex justify-center z-[100]"
        style={{ transform: menuMounted ? "scale(1)" : "scale(0)", transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 bg-[#F4EFE7] text-[#181717] rounded-full px-5 py-2.5 text-sm font-semibold"
        >
          <span>{menuOpen ? "Close" : "Menu"}</span>
          <span className="w-6 h-6 bg-[#181717] rounded-full flex items-center justify-center">
            {menuOpen ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8M8 2L2 8" stroke="#F4EFE7" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 1H9M1 4H9M1 7H9" stroke="#F4EFE7" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </span>
        </button>
      </div>

      {/* Menu drawer */}
      <div
        className="fixed inset-0 z-[11] bg-[#181717] flex flex-col justify-between p-[30px]"
        style={{
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
          transition: "opacity 0.3s ease"
        }}
      >
        <div className="flex justify-between items-start">
          <nav className="flex flex-col gap-6 mt-20">
            {["Welcome", "Introduction", "Houses", "Why Capsules?", "Activities", "Reviews"].map((item) => (
              <button
                key={item}
                onClick={() => setMenuOpen(false)}
                className="text-[#F4EFE7] text-4xl font-medium text-left hover:opacity-60 transition-opacity"
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="relative w-[300px] h-[200px] rounded-[20px] overflow-hidden">
            <img src="/images/cap2.png" alt="Menu Image" className="w-full h-full object-cover scale-[1.2]" />
          </div>
        </div>
      </div>
    </>
  );
}
