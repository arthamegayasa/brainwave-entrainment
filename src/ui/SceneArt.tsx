import { memo, useEffect, useRef, useState } from "react";

type SceneVariant = "hero" | "card" | "step" | "reco" | "complete" | "player";
type Rays = "down" | "burst";
type Particles = "motes" | "pollen" | "sand" | "snow";

/**
 * A painted place (from `public/scenes/`, generated with GPT Image) plus the
 * live layers drawn over it. Coordinates are in the painting's own pixels,
 * so glows, glints and rays stay pinned to the moon, sun and water they
 * belong to at any crop.
 *
 * Every live layer is a plain HTML element animated only through transform
 * and opacity, so the GPU compositor runs all motion and the main thread
 * stays free for scrolling, even on phones.
 */
interface SceneSpec {
  width: number;
  height: number;
  /** Placeholder colour shown until the painting has loaded. */
  tint: string;
  /** Colour of the light source, its bloom, rays and glints. */
  glow: string;
  /** Light source: x, y and bloom radius. */
  light: [number, number, number];
  /** Height of the horizon band the mist drifts along. */
  mist: number;
  /** Twinkling stars down to this height (night scenes only). */
  stars?: number;
  /** Column of water or wet sand that reflects the light. */
  reflection?: { x: number; top: number; bottom: number };
  rays?: Rays;
  /** Where the down-rays land. */
  rayTarget?: [number, number];
  particles?: Particles;
  /** Region particles live in: x, y, width, height. */
  particleBox?: [number, number, number, number];
  aurora?: boolean;
  meteor?: boolean;
}

const WIDE = { width: 1536, height: 864 };
const CARD = { width: 1536, height: 1024 };

const SCENES: Record<string, SceneSpec> = {
  landing: {
    ...WIDE, tint: "#0f2237", glow: "#ffd9a8", light: [1249, 254, 60], mist: 478,
    stars: 380, reflection: { x: 1247, top: 494, bottom: 864 }, meteor: true,
  },
  complete: {
    ...WIDE, tint: "#8fb0c4", glow: "#ffe2ae", light: [1257, 322, 60], mist: 470,
    reflection: { x: 1250, top: 494, bottom: 864 }, rays: "burst",
  },
  "deep-sleep": {
    ...CARD, tint: "#1b2148", glow: "#e3e8ff", light: [985, 220, 90], mist: 640,
    stars: 470, meteor: true,
  },
  "deep-meditation": {
    ...CARD, tint: "#6a6788", glow: "#ffe7c2", light: [767, 238, 70], mist: 760,
    rays: "down", rayTarget: [767, 1024],
  },
  "healing-relaxation": {
    ...CARD, tint: "#e7a58b", glow: "#ffd7a0", light: [1047, 444, 70], mist: 470,
    reflection: { x: 1060, top: 486, bottom: 900 },
  },
  "anxiety-relief": {
    ...CARD, tint: "#4d6e5c", glow: "#fff4cf", light: [1440, 70, 120], mist: 640,
    rays: "down", rayTarget: [760, 800],
    particles: "motes", particleBox: [640, 160, 820, 640],
  },
  focus: {
    ...CARD, tint: "#5b7ea8", glow: "#ffcf85", light: [767, 487, 70], mist: 580,
    rays: "burst",
  },
  energy: {
    ...CARD, tint: "#c7704f", glow: "#ffcc7a", light: [1055, 270, 80], mist: 330,
    rays: "burst", particles: "sand", particleBox: [0, 380, 1536, 480],
  },
  creativity: {
    ...CARD, tint: "#12305a", glow: "#8ef0d0", light: [760, 330, 260], mist: 670,
    stars: 520, aurora: true, reflection: { x: 780, top: 700, bottom: 1010 },
    particles: "snow", particleBox: [0, 0, 1536, 1024],
  },
  "power-nap": {
    ...CARD, tint: "#b9c8d6", glow: "#fff1d0", light: [1020, 340, 110], mist: 720,
    rays: "down", rayTarget: [700, 1024],
    particles: "pollen", particleBox: [0, 560, 1536, 460],
  },
};

/** Large frames get the 1536 px painting, particles, ripples and the meteor. */
const FULL_SIZE: Record<SceneVariant, boolean> = {
  hero: true, reco: true, player: true, complete: true, step: false, card: false,
};

/** Typical frame shape (width / height) of each surface, used until measured. */
const FRAME_ASPECT: Record<SceneVariant, number> = {
  hero: 1.8, reco: 3.3, player: 1.78, complete: 2.1, step: 1.8, card: 1.72,
};

/** Share of the cover crop that is shown; the rest is room for parallax and drift. */
const CROP_ZOOM = 0.92;

interface Decor {
  stars: Array<{ x: number; y: number; size: number; alpha: number }>;
  particles: Array<{ x: number; y: number; size: number; dx: number; dy: number; dur: number; delay: number }>;
  glints: Array<{ x: number; y: number; length: number }>;
  /** Conic-gradient colour stops for the light shafts, as CSS angles. */
  rays: string;
}

const DECOR: Record<string, Decor> = {};

/** Deterministic noise, so each scene's stars and motes never jump between renders. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** `#rrggbb` at the given alpha, for gradients built in JavaScript. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function buildDecor(sceneId: string, spec: SceneSpec, full: boolean): Decor {
  const rand = seeded(sceneId);
  const [lx, ly] = spec.light;

  const stars: Decor["stars"] = [];
  if (spec.stars) {
    for (let i = 0; i < (full ? 44 : 20); i++) {
      stars.push({
        x: rand() * spec.width, y: spec.stars * rand() ** 1.6,
        size: (full ? 1.1 : 0.8) + rand() * 1.4, alpha: 0.55 + rand() * 0.45,
      });
    }
  }

  const particles: Decor["particles"] = [];
  if (full && spec.particles && spec.particleBox) {
    const [bx, by, bw, bh] = spec.particleBox;
    const drift: Record<Particles, [number, number]> = {
      motes: [24, -60], pollen: [70, -80], sand: [150, -18], snow: [-24, 110],
    };
    const [dx, dy] = drift[spec.particles];
    for (let i = 0; i < 16; i++) {
      particles.push({
        x: bx + rand() * bw, y: by + rand() * bh, size: 2 + rand() * 3,
        dx: dx * (0.6 + rand() * 0.8), dy: dy * (0.6 + rand() * 0.8),
        dur: 7 + rand() * 7, delay: -rand() * 14,
      });
    }
  }

  const glints: Decor["glints"] = [];
  if (spec.reflection) {
    const { x, top, bottom } = spec.reflection;
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      glints.push({
        x: x + (rand() - 0.5) * (28 + 150 * t),
        y: top + (bottom - top) * t ** 1.3,
        length: 14 + 70 * t * rand() + 10,
      });
    }
  }

  // Light shafts as a conic gradient centred on the light; CSS angles start
  // at 12 o'clock and run clockwise, so screen angle θ maps to θ + 90°.
  const wedges: Array<[number, number]> = [];
  if (spec.rays === "down" && spec.rayTarget) {
    const base = (Math.atan2(spec.rayTarget[1] - ly, spec.rayTarget[0] - lx) * 180) / Math.PI + 90;
    for (const [offset, half] of [[-19, 2], [-10, 3], [0, 1.6], [9, 3.2], [17, 1.7]]) {
      wedges.push([base + offset, half]);
    }
  } else if (spec.rays === "burst") {
    for (let i = 0; i < 14; i++) wedges.push([(i + 0.5) * (360 / 14), 1.2 + rand() * 1.7]);
  }
  const ray = withAlpha(spec.glow, 0.5);
  const rays = wedges
    .map(([angle, half]) => [((angle % 360) + 360) % 360, half])
    .sort((a, b) => a[0] - b[0])
    .map(([angle, half]) => `transparent ${(angle - half).toFixed(1)}deg, ${ray} ${angle.toFixed(1)}deg, transparent ${(angle + half).toFixed(1)}deg`)
    .join(", ");

  return { stars, particles, glints, rays };
}

let visibilityObserver: IntersectionObserver | undefined;
let pointerTracking = false;

/**
 * One delegated listener feeds pointer position to whichever surface carries
 * `data-parallax`, as `--px`/`--py` in [-1, 1]. CSS turns those into depth
 * parallax, card tilt and glare, so React never re-renders on pointer moves.
 */
function trackPointer() {
  if (pointerTracking || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  pointerTracking = true;
  let active: HTMLElement | null = null;
  let frame = 0;
  let clientX = 0;
  let clientY = 0;
  const release = () => {
    active?.style.setProperty("--px", "0");
    active?.style.setProperty("--py", "0");
    active = null;
  };
  window.addEventListener("pointermove", (event) => {
    // Touch and pen scroll the page; letting them drive parallax would
    // restyle the whole scene on every finger movement.
    if (event.pointerType !== "mouse") return;
    const surface = (event.target as Element | null)?.closest<HTMLElement>("[data-parallax]") ?? null;
    if (surface !== active) release();
    active = surface;
    if (!active) return;
    clientX = event.clientX;
    clientY = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!active) return;
      const box = active.getBoundingClientRect();
      active.style.setProperty("--px", (((clientX - box.left) / box.width) * 2 - 1).toFixed(3));
      active.style.setProperty("--py", (((clientY - box.top) / box.height) * 2 - 1).toFixed(3));
    });
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", release);
}

const pct = (value: number) => `${value.toFixed(2)}%`;

interface SceneArtProps {
  sceneId: string;
  variant: SceneVariant;
}

export const SceneArt = memo(function SceneArt({ sceneId, variant }: SceneArtProps) {
  const spec = SCENES[sceneId];
  if (!spec) throw new Error(`Unknown scene: ${sceneId}`);

  const rootRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  // Real frame shape (width / height), measured; the typical one until then.
  const [frame, setFrame] = useState(FRAME_ASPECT[variant]);
  const full = FULL_SIZE[variant];
  const decor = (DECOR[`${sceneId}:${full}`] ??= buildDecor(sceneId, spec, full));
  const { width: W, height: H, glow, light: [lx, ly, lr] } = spec;

  // Crop to the frame's own shape around a focal point just below the light,
  // so the moon or sun stays in view on any card, banner or phone.
  const cropW = Math.min(W, H * frame) * CROP_ZOOM;
  const cropH = Math.min(H, W / frame) * CROP_ZOOM;
  const cropX = Math.min(Math.max(lx - cropW / 2, 0), W - cropW);
  const cropY = Math.min(Math.max(ly + (spec.mist - ly) * 0.3 - cropH / 2, 0), H - cropH);
  // Painting coordinates → percentages of the painting (stage) or of the frame.
  const px = (x: number) => pct((x / W) * 100);
  const py = (y: number) => pct((y / H) * 100);
  const fx = (x: number) => ((x - cropX) / cropW) * 100;
  const fy = (y: number) => ((y - cropY) / cropH) * 100;

  useEffect(() => {
    trackPointer();
    const element = rootRef.current;
    if (!element) return;
    if (element.querySelector("img")?.complete) setLoaded(true);
    const resize = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) setFrame(Math.round((w / h) * 20) / 20);
    });
    resize.observe(element);
    visibilityObserver ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) delete (entry.target as HTMLElement).dataset.offscreen;
        else (entry.target as HTMLElement).dataset.offscreen = "";
      }
    });
    visibilityObserver.observe(element);
    return () => {
      resize.disconnect();
      visibilityObserver?.unobserve(element);
    };
  }, []);

  const reflection = spec.reflection;
  const glintBox = reflection && { left: reflection.x - 180, width: 360, top: reflection.top, height: reflection.bottom - reflection.top };
  const glintLayer = (odd: boolean) => glintBox && decor.glints
    .filter((_, i) => i % 2 === (odd ? 1 : 0))
    .map((g) => {
      const x = ((g.x - glintBox.left) / glintBox.width) * 100;
      const y = ((g.y - glintBox.top) / glintBox.height) * 100;
      const half = (g.length / 2 / glintBox.width) * 100;
      return `radial-gradient(ellipse ${pct(half)} ${full ? 1.6 : 1.1}px at ${pct(x)} ${pct(y)}, ${withAlpha(glow, 0.95)}, transparent)`;
    })
    .join(", ");
  const skyHeight = spec.stars ? Math.max(0, Math.min(100, fy(spec.stars))) : 0;
  const starLayer = (odd: boolean) => decor.stars
    .filter((star, i) => i % 2 === (odd ? 1 : 0) && fx(star.x) > 0 && fx(star.x) < 100 && fy(star.y) < skyHeight)
    .map((star) => {
      const color = `rgba(255,248,236,${star.alpha.toFixed(2)})`;
      return `radial-gradient(circle ${star.size.toFixed(1)}px at ${pct(fx(star.x))} ${pct((fy(star.y) / skyHeight) * 100)}, ${color}, transparent)`;
    })
    .join(", ");
  const mistTop = fy(spec.mist - H * 0.09);
  const mistHeight = ((H * 0.18) / cropH) * 100;
  // Just past the frame: the shafts fade out before the edge, and a larger
  // layer would only cost GPU memory.
  const raySize = Math.max(cropW, cropH) * 1.15;

  return (
    <div ref={rootRef} className={`scene-art scene-art--${variant}`} data-scene={sceneId}
      data-loaded={loaded || undefined} aria-hidden="true"
      style={{ "--scene-tint": spec.tint, "--glow": glow } as React.CSSProperties}>
      <div className="scene-stage" style={{
        left: pct((-cropX / cropW) * 100), top: pct((-cropY / cropH) * 100),
        width: pct((W / cropW) * 100), height: pct((H / cropH) * 100),
      }}>
        <div className="scene-plane scene-plane--base"
          style={{ "--origin": `${px(lx)} ${py(ly)}` } as React.CSSProperties}>
          <img className="scene-image" src={`/scenes/${sceneId}-${full ? 1536 : 768}.webp`} alt=""
            draggable={false} decoding="async" loading={full ? "eager" : "lazy"}
            fetchPriority={variant === "hero" ? "high" : "auto"} onLoad={() => setLoaded(true)} />
          <div className="scene-fx">
            {spec.aurora && (
              <div className="fx-aurora">
                {[[380, 330, 0.7], [700, 380, 1.6], [1010, 430, 2.8], [1290, 470, 0.2]].map(([x, y, delay]) => (
                  <i key={x} className="scene-ambient fx-curtain" style={{
                    left: px(x), top: py(y), width: px(300), height: py(660),
                    animationDelay: `${-delay}s`,
                  }} />
                ))}
              </div>
            )}
            {decor.rays && (
              <div className={`fx-rays fx-rays--${spec.rays}`} style={{
                left: px(lx), top: py(ly), width: px(raySize),
              }}>
                <i className="scene-ambient fx-rays-glow"
                  style={{ background: `conic-gradient(${decor.rays})` }} />
              </div>
            )}
            <i className="scene-ambient fx-bloom" style={{ left: px(lx), top: py(ly), width: px(lr * 5.2) }} />
            {glintBox && (
              <div className="fx-glints" style={{
                left: px(glintBox.left), top: py(glintBox.top),
                width: px(glintBox.width), height: py(glintBox.height),
              }}>
                <i className="scene-ambient fx-glint fx-glint--a" style={{ backgroundImage: glintLayer(false) }} />
                <i className="scene-ambient fx-glint fx-glint--b" style={{ backgroundImage: glintLayer(true) }} />
              </div>
            )}
            {reflection && full && [0, 1, 2].map((ring) => (
              <i key={ring} className="fx-ripple" style={{
                left: px(reflection.x), top: py(reflection.top + 38), width: px(170),
              }} />
            ))}
          </div>
        </div>
      </div>

      {skyHeight > 0 && (
        <div className="scene-plane scene-plane--stars" style={{ height: pct(skyHeight) }}>
          <i className="scene-ambient fx-stars fx-stars--a" style={{ backgroundImage: starLayer(false) }} />
          <i className="scene-ambient fx-stars fx-stars--b" style={{ backgroundImage: starLayer(true) }} />
          {spec.meteor && full && <i className="fx-meteor" />}
        </div>
      )}

      <div className="scene-plane scene-plane--mist">
        <i className="scene-ambient fx-mist" style={{ top: pct(mistTop), height: pct(mistHeight) }} />
      </div>

      {decor.particles.length > 0 && (
        <div className="scene-plane scene-plane--particles">
          {decor.particles.filter((p) => fx(p.x) > -4 && fx(p.x) < 104 && fy(p.y) > -4 && fy(p.y) < 104).map((p, i) => (
            <i key={i} className={`fx-particle fx-particle--${spec.particles}`} style={{
              left: pct(fx(p.x)), top: pct(fy(p.y)), width: `${p.size.toFixed(1)}px`,
              "--dx": `${p.dx.toFixed(0)}px`, "--dy": `${p.dy.toFixed(0)}px`,
              animationDuration: `${p.dur.toFixed(1)}s`, animationDelay: `${p.delay.toFixed(1)}s`,
            } as React.CSSProperties} />
          ))}
        </div>
      )}

      <span className="scene-glare" />
    </div>
  );
});
