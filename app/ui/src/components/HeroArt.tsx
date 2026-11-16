// The landing drawing above the Foyer: a small house at night with one lit
// window and a friendly ghost waving from the path. Drawn for this repository
// from plain lines and shapes; nothing is traced, copied or loaded.
//
// Decoration only: hidden from assistive technology and never focusable. The
// page sheet (App.tsx) colors it through `hh-hero-*` classes and currentColor.
export function HeroArt() {
  return (
    <svg
      className="hh-hero-art"
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Moon and two stars. */}
      <path className="hh-hero-moon" d="M28 10 a12 12 0 1 0 12 16 a9 9 0 1 1 -12 -16 z" fill="currentColor" fillOpacity={0.25} />
      <path d="M58 8 v6 M55 11 h6 M136 22 v4 M134 24 h4" strokeWidth={1.2} />
      {/* The house: roof, chimney, walls, a round attic window, the front door. */}
      <path d="M104 30 V18 h10 v20" />
      <path d="M50 58 L92 22 L134 58" strokeWidth={2.5} />
      <path d="M58 52 V112 H126 V52" />
      <circle cx="92" cy="44" r="6" />
      <path d="M86 44 h12 M92 38 v12" strokeWidth={1} />
      <path d="M84 112 V90 a8 8 0 0 1 16 0 V112" />
      <circle cx="96" cy="101" r="1.2" fill="currentColor" />
      {/* Two windows: the left one dark, the right one lit by a candle. */}
      <rect x="64" y="64" width="14" height="16" />
      <path d="M71 64 v16 M64 72 h14" strokeWidth={1} />
      <g className="hh-hero-glow">
        <rect x="106" y="64" width="14" height="16" fill="currentColor" fillOpacity={0.35} />
        <path d="M113 64 v16 M106 72 h14" strokeWidth={1} />
      </g>
      {/* Ground and a winding path to the door. */}
      <path d="M4 113 H156" strokeWidth={1.5} />
      <path d="M92 113 q-6 4 -18 5 M98 113 q6 3 -2 6" strokeWidth={1} />
      {/* A friendly ghost, waving. */}
      <g className="hh-hero-ghost">
        <path d="M18 112 V80 a12 12 0 0 1 24 0 V112 l-4 -5 l-4 5 l-4 -5 l-4 5 l-4 -5 z" fill="currentColor" fillOpacity={0.15} />
        <circle cx="26" cy="80" r="1.6" fill="currentColor" />
        <circle cx="34" cy="80" r="1.6" fill="currentColor" />
        <path d="M27 87 q3 3 6 0 M42 88 l8 -10 M18 90 q-4 4 -3 9" />
      </g>
    </svg>
  )
}
