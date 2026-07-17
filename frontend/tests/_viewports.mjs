/* One device matrix, shared by every mobile assert. landscape-wide (932x430) is
   mandatory: @media (min-width:861px) sits inside the landscape-phone width range,
   so phones wider than 861 in landscape get the desktop hover-only rail. A matrix
   that stops at 844 tests the one width where that bug hides. */
export const VIEWPORTS = [
  { tag: "portrait-sm",      width: 360, height: 800, touch: true },
  { tag: "portrait",         width: 390, height: 844, touch: true },
  { tag: "landscape-narrow", width: 844, height: 390, touch: true },
  { tag: "landscape-wide",   width: 932, height: 430, touch: true },
];
export const DESKTOP = { tag: "desktop", width: 1440, height: 900, touch: false };
