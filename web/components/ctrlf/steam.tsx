"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion/use-anime";

/*
 * Steam over the narrator's screen, drawn as particles on a canvas.
 *
 * While `on`, every vent jets vapour into the screen: a hard blast for the first half
 * second, then a steady stream. Each wisp leaves the vent fast and thin, slows as it
 * spreads, swirls on a cheap turbulence field and rises a little. Wisps pile up over a
 * thickening veil until the scene is hidden. When `on` turns off the vents stop and the
 * wisps already out keep spreading and thin away, so the steam dissipates to reveal the
 * answer. Under reduced motion there are no wisps: the veil alone fades in and out.
 */

/** A vent on the screen's edge: where it is (fractions of the screen) and which way it blows. */
export type SteamVent = { x: number; y: number; angle: number };

type Wisp = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rMax: number;
  age: number;
  life: number;
  peak: number;
  sprite: number;
  seed: number;
};

const SCALE = 0.2; // canvas pixels per CSS pixel; vapour is soft, so a coarse canvas looks the same
const MAX_WISPS = 150;
// Frame budget: 25 fps while the steam moves in or out, 15 once the screen is hidden.
const FRAME_MS = 40;
const SETTLED_FRAME_MS = 66;
const VEIL = 0.9; // how opaque the veil gets once the screen is filled

/** Soft, lumpy puffs: a bright core with a few offset lobes, greyer underneath. */
function makeSprites(count: number): HTMLCanvasElement[] {
  return Array.from({ length: count }, () => {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const blob = (x: number, y: number, r: number, a: number) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.45, `rgba(246,243,237,${a * 0.6})`);
      grad.addColorStop(1, "rgba(235,230,222,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    blob(32, 32, 30, 0.95);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 7 + Math.random() * 11;
      blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 9 + Math.random() * 11, 0.45 + Math.random() * 0.45);
    }
    // A touch of grey on the underside gives each puff some body against the others.
    g.globalCompositeOperation = "source-atop";
    const shade = g.createLinearGradient(0, 18, 0, 64);
    shade.addColorStop(0, "rgba(120,110,95,0)");
    shade.addColorStop(1, "rgba(100,90,76,0.45)");
    g.fillStyle = shade;
    g.fillRect(0, 0, size, size);
    return c;
  });
}

/**
 * `clear`: something now needs the screen (the full camera photo), so any vapour still
 * thinning away goes in a quarter of a second instead of its usual few.
 */
export function Steam({ on, vents, clear = false }: { on: boolean; vents: SteamVent[]; clear?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onRef = useRef(on);
  const ventsRef = useRef(vents);
  const clearRef = useRef(clear);
  // Drawn while on, and afterwards until the last wisp has thinned away.
  const [running, setRunning] = useState(on);
  if (on && !running) setRunning(true);

  useEffect(() => {
    onRef.current = on;
    ventsRef.current = vents;
    clearRef.current = clear;
  }, [on, vents, clear]);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true, desynchronized: true });
    if (!(canvas && ctx)) return;

    const reduced = prefersReducedMotion();
    const sprites = makeSprites(6);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * SCALE));
      canvas.height = Math.max(1, Math.round(h * SCALE));
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const wisps: Wisp[] = [];
    let emitting = false;
    let startedAt = 0;
    let owed = 0; // fractional wisps carried between frames
    let veil = 0;
    let last = performance.now();
    let frame = 0;

    const spawn = (vent: SteamVent, blast: boolean) => {
      const unit = Math.min(w, h * 1.78) / 1000; // keep the look the same at any screen size
      const angle = vent.angle + (Math.random() - 0.5) * (blast ? 0.55 : 0.75);
      const speed = (blast ? 1400 : 900) * (0.55 + Math.random() * 0.6) * unit;
      wisps.push({
        x: vent.x * w,
        y: vent.y * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: (10 + Math.random() * 14) * unit,
        rMax: (160 + Math.random() * 170) * unit,
        age: 0,
        life: 2.2 + Math.random() * 1.4,
        peak: 0.45 + Math.random() * 0.35,
        sprite: Math.floor(Math.random() * sprites.length),
        seed: Math.random() * 100,
      });
    };

    const tick = (now: number) => {
      // Skip frames beyond the budget: vapour needs no more than 25 fps.
      const settled = emitting && now / 1000 - startedAt > 1.5 && veil > VEIL * 0.95;
      if (now - last < (settled ? SETTLED_FRAME_MS : FRAME_MS) - 2) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      // Start or stop the vents as `on` changes.
      if (onRef.current && !emitting) {
        emitting = true;
        startedAt = t;
      } else if (!onRef.current && emitting) {
        emitting = false;
        // Wisps already out finish their spread and thin away over the next couple of seconds.
        for (const p of wisps) p.life = Math.min(p.life, p.age + 1.1 + Math.random() * 1.2);
      }
      // Cleared while thinning away: the rest goes in about a quarter of a second.
      const hurry = !emitting && clearRef.current;
      if (hurry) for (const p of wisps) p.life = Math.min(p.life, p.age + 0.25);
      const since = t - startedAt;

      if (emitting && !reduced) {
        const blast = since < 0.55;
        const area = Math.min(1.2, Math.max(0.5, (w * h) / (1000 * 560)));
        // Once the screen is hidden behind the veil, a gentle stream keeps it moving.
        const perVent = (blast ? 45 : settled ? 7 : 14) * area;
        owed += perVent * ventsRef.current.length * dt;
        while (owed >= 1 && wisps.length < MAX_WISPS) {
          owed -= 1;
          const vents = ventsRef.current;
          spawn(vents[Math.floor(Math.random() * vents.length)], blast);
        }
        if (wisps.length >= MAX_WISPS) owed = 0;
      }

      // The veil thickens behind the first wave, and thins when the vents stop.
      const target = emitting ? (since > 0.25 ? VEIL : 0) : 0;
      veil += (target - veil) * (1 - Math.exp(-dt * (emitting ? 2.2 : hurry ? 14 : 1.9)));

      ctx.clearRect(0, 0, w, h);
      if (veil > 0.002) {
        ctx.globalAlpha = veil;
        ctx.fillStyle = "rgb(204,197,186)";
        ctx.fillRect(0, 0, w, h);
      }

      const drag = Math.exp(-2.3 * dt);
      const spread = 1 - Math.exp(-(emitting ? 1.5 : 2.8) * dt);
      for (let i = wisps.length - 1; i >= 0; i--) {
        const p = wisps[i];
        p.age += dt;
        if (p.age >= p.life) {
          wisps.splice(i, 1);
          continue;
        }
        p.vx = p.vx * drag + Math.sin(p.y * 0.011 + t * 1.3 + p.seed) * 55 * dt;
        p.vy = p.vy * drag + Math.cos(p.x * 0.009 + t * 1.1 + p.seed) * 55 * dt - 8 * dt; // swirl, and a little lift
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += (p.rMax - p.r) * spread;
        const k = p.age / p.life;
        const alpha = p.peak * Math.min(1, p.age / 0.12) * (1 - k * k);
        if (alpha <= 0.003) continue;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[p.sprite], p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.globalAlpha = 1;

      if (!emitting && wisps.length === 0 && veil < 0.004) {
        ctx.clearRect(0, 0, w, h);
        setRunning(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [running]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-steam={on ? "on" : "off"}
      data-testid="steam"
      hidden={!running}
    >
      {/* No CSS blur: a live filter over the whole canvas costs more than all the wisps. */}
      <canvas className="h-full w-full" ref={canvasRef} />
    </div>
  );
}
