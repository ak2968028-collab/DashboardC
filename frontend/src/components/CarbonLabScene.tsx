"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import type { ParcelUse, VillageScene } from "@/lib/types";

export type SourceKey = "lpg" | "firewood" | "electricity" | "petrol" | "waste" | "cow" | "goat" | "sheep";
export type Emissions = Record<SourceKey, number>;

export const SOURCE_COLORS: Record<SourceKey, string> = {
  lpg: "#5c8fd6", firewood: "#8d6e63", electricity: "#f9a825", petrol: "#e53935",
  waste: "#8e24aa", cow: "#ef6c00", goat: "#c0ca33", sheep: "#26a69a",
};

interface SceneProps {
  /** Current emissions per source, t CO2e/yr. */
  emissions: Emissions;
  /** Survey baseline emissions per source, t CO2e/yr (scales the animation). */
  baseline: Emissions;
  focus: SourceKey | null;
  onPick: (key: SourceKey) => void;
  /** Real cadastral layout; the illustrative village is drawn when absent. */
  village?: VillageScene | null;
}

type Vec3 = [number, number, number];
type Rgb = [number, number, number];
interface Face { pts: Vec3[]; rgb: Rgb; n: Vec3; alpha?: number }
/** Upright picture standing at `at` (world), `height` world units tall, facing left or right on screen. */
interface Sprite { at: Vec3; img: string; height: number; flip?: boolean }

// Icons in public/icon; `faces` is the direction the drawing looks (1 = right, -1 = left).
const ICONS: Record<string, { src: string; faces: 1 | -1 }> = {
  cow: { src: "/icon/cow.png", faces: 1 },
  cow2: { src: "/icon/cow (1).png", faces: -1 },
  goat: { src: "/icon/goat.png", faces: 1 },
  goat2: { src: "/icon/animal.png", faces: -1 },
  sheep: { src: "/icon/sheep.png", faces: -1 },
  tree: { src: "/icon/tree.png", faces: 1 },
  tree2: { src: "/icon/tree (1).png", faces: 1 },
  bike: { src: "/icon/motorbike.png", faces: 1 },
  car: { src: "/icon/744465.png", faces: 1 },
  tower: { src: "/icon/electric-tower.png", faces: 1 },
};
const SMOG_VIDEO = "/vedio/smog_loop.mp4";
interface Particle { p: Vec3; v: Vec3; age: number; life: number; size: number; rgb: Rgb; glow?: boolean }

type P2 = [number, number];

/** Everything the renderer places, in world units (the ground spans roughly -12..12). */
interface Layout {
  ground: P2[];
  decals: { ring: P2[]; fill: string }[];
  /** Cadastral boundary lines drawn over the decals. */
  parcelLines: P2[][];
  road: P2[];
  roadLen: number[];
  roadWidth: number;
  houses: P2[];
  /** Size of houses, animals and bikes (1 = illustrative village). */
  u: number;
  pasture: P2[];
  fences: P2[];
  dump: P2;
  plant: P2;
  poles: P2[];
  trees: P2[];
  anchors: Record<SourceKey, Vec3>;
}

const ring = (n: number, f: (t: number) => P2) => Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2));

function cumulative(path: P2[]): number[] {
  const out = [0];
  for (let i = 1; i <= path.length; i++) {
    const [a, b] = [path[i - 1], path[i % path.length]];
    out.push(out[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
}

/** Point at distance d along a closed path. */
function along(path: P2[], len: number[], d: number): P2 {
  const total = len[len.length - 1];
  const t = ((d % total) + total) % total;
  let i = 1;
  while (i < len.length - 1 && len[i] < t) i++;
  const [a, b] = [path[i - 1], path[i % path.length]];
  const f = (t - len[i - 1]) / Math.max(len[i] - len[i - 1], 1e-9);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function demoLayout(): Layout {
  const road = ring(48, (t) => [0.5 + 5.5 * Math.cos(t), 1 + 2.2 * Math.sin(t)]);
  const pasture: P2[] = Array.from({ length: 30 }, (_, i) => [-9 + ((i * 7.3 * 3.1) % 6), 6 + ((i * 7.3 * 1.7) % 3.5)]);
  const fences: P2[] = [];
  for (let x = -10; x <= -2; x += 1.6) fences.push([x, 5], [x, 10.5]);
  return {
    ground: [[-12, -12], [12, -12], [12, 12], [-12, 12]],
    decals: [
      ...Array.from({ length: 6 }, (_, i) => ({
        ring: [[2, 5 + i * 0.95], [10, 5 + i * 0.95], [10, 5.7 + i * 0.95], [2, 5.7 + i * 0.95]] as P2[], fill: i % 2 ? "#9ccc65" : "#c5e1a5",
      })),
      { ring: [[-10, 5], [-2, 5], [-2, 10.5], [-10, 10.5]], fill: "#aed581" },
      { ring: ring(48, (t) => [0.5 + 4.9 * Math.cos(t), 1 + 1.6 * Math.sin(t)]), fill: "#8bc34a" },
      { ring: ring(24, (t) => [0.5 + 2.6 * Math.cos(t), 1 + 0.9 * Math.sin(t)]), fill: "#4fc3f7" },
    ],
    parcelLines: [],
    road, roadLen: cumulative(road), roadWidth: 1.2,
    houses: [[-8, -8], [-5, -8.5], [-2.5, -7], [-7.5, -5], [-4.5, -4.5]],
    u: 1, pasture, fences,
    dump: [8, 1], plant: [8, -8], poles: [[5.5, -7.5], [2.5, -7], [0, -6.5]],
    trees: [[-11, -2], [-10, 1], [-11, 3.5], [1, -10.5], [3.5, -9.5], [-0.5, -4], [11, 5], [10.5, 9], [0, 11], [3, -4.5], [11, -3], [-11.5, -10.5], [5.5, 4.2]],
    anchors: {
      lpg: [-5, -8.5, 3.2], firewood: [-6, -5, 3.2], electricity: [8, -8, 7.5], petrol: [0.5, 3.2, 1.4],
      waste: [8, 1, 2.2], cow: [-7.5, 7, 1.8], goat: [-4, 9, 1.4], sheep: [-3.5, 6.2, 1.4],
    },
  };
}

const FIELD_FILLS = ["#9ccc65", "#aed581", "#c5e1a5", "#8bc34a", "#b5d68a"];
/** Parcel colours by land use (fields alternate shades so neighbouring plots stay distinct). */
export const USE_FILLS: Record<Exclude<ParcelUse, "cropland" | "land">, string> = {
  builtup: "#d9c7a5", trees: "#2e7d32", water: "#4fc3f7", rangeland: "#c0a96e", bare: "#bcaaa4",
};
const centroid = (pts: P2[]): P2 => pts.reduce<P2>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);

/** Real village: metres (x east, y north) scaled to fit the ground; y is flipped so north points away from the camera. */
function villageLayout(v: VillageScene): Layout {
  const k = 22 / Math.max(v.extent_m[0], v.extent_m[1], 1);
  const w = ([x, y]: P2): P2 => [x * k, -y * k];
  const houses = v.houses.map(w);
  const builtM2 = v.builtup_est_ha * 1e4;
  const spacing = Math.sqrt(builtM2 / Math.max(houses.length, 1)) * k;
  const u = Math.min(0.5, Math.max(0.12, spacing * 0.4));
  const road = v.route.map(w);
  const hc = houses.length ? centroid(houses) : [0, 0] as P2;
  const pasture = v.pasture.length ? v.pasture.map(w) : [[hc[0] + 2, hc[1] + 2] as P2];
  const pc = centroid(pasture);
  const dump = w(v.dump);
  // Electricity is generated off-site: put the plant just beyond the village edge, away from the settlement.
  const away = Math.hypot(hc[0], hc[1]) > 1 ? Math.atan2(-hc[1], -hc[0]) : -Math.PI / 4;
  const reach = Math.min(12.5, Math.max(...v.outline.map(w).map(([x, y]) => x * Math.cos(away) + y * Math.sin(away))) + 2);
  const plant: P2 = [Math.cos(away) * reach, Math.sin(away) * reach];
  const poles: P2[] = [0.25, 0.5, 0.75].map((f) => [plant[0] + (hc[0] - plant[0]) * f, plant[1] + (hc[1] - plant[1]) * f]);
  const top = 2.6 * u + 0.8;
  return {
    ground: v.outline.map(w),
    decals: v.parcels.map((p, i) => ({
      ring: p.ring.map(w),
      fill: p.use === "cropland" || p.use === "land" ? FIELD_FILLS[i % FIELD_FILLS.length] : USE_FILLS[p.use],
    })),
    parcelLines: v.parcels.map((p) => p.ring.map(w)),
    road, roadLen: cumulative(road), roadWidth: Math.max(0.15, u * 0.8),
    houses, u, pasture, fences: [], dump, plant, poles,
    trees: v.trees.map(w),
    anchors: {
      lpg: [hc[0] - 1.2, hc[1] - 0.8, top], firewood: [hc[0] + 1.2, hc[1] + 0.8, top],
      electricity: [plant[0], plant[1], 7.5], petrol: [road[0]?.[0] ?? 0, road[0]?.[1] ?? 0, 1.2],
      waste: [dump[0], dump[1], 1.6], cow: [pc[0], pc[1], 1.4], goat: [pc[0] + 1.2, pc[1] - 0.8, 1.1], sheep: [pc[0] - 1.2, pc[1] + 0.8, 1.1],
    },
  };
}

const LIGHT = norm([-0.45, 0.55, 0.85]);
const MAX_PARTICLES = 1400;
const ATMOS_Z = 10;

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const hex = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (c: Rgb, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Adds a polygon, orienting its normal away from the owning solid's centre. */
function poly(out: Face[], pts: Vec3[], rgb: Rgb, centre: Vec3, alpha?: number) {
  const [a, b, c] = pts;
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = norm([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
  const m = pts.reduce<Vec3>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
  if (n[0] * (m[0] - centre[0]) + n[1] * (m[1] - centre[1]) + n[2] * (m[2] - centre[2]) < 0) n = [-n[0], -n[1], -n[2]];
  out.push({ pts, rgb, n, alpha });
}

function box(out: Face[], x: number, y: number, z: number, w: number, d: number, h: number, color: string | Rgb) {
  const rgb = typeof color === "string" ? hex(color) : color;
  const [x0, x1, y0, y1, z0, z1] = [x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + h];
  const c: Vec3 = [x, y, z + h / 2];
  poly(out, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], rgb, c);
  poly(out, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], rgb, c);
  poly(out, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], rgb, c);
  poly(out, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], rgb, c);
  poly(out, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], rgb, c);
}

/** Vertical prism / frustum / cone (r1 = 0) around (x, y). */
function prism(out: Face[], x: number, y: number, z: number, r0: number, r1: number, h: number, sides: number, color: string) {
  const rgb = hex(color);
  const c: Vec3 = [x, y, z + h / 3];
  const ring = (r: number, zz: number) =>
    Array.from({ length: sides }, (_, i) => [x + r * Math.cos((i / sides) * Math.PI * 2), y + r * Math.sin((i / sides) * Math.PI * 2), zz] as Vec3);
  const bottom = ring(r0, z);
  const top = ring(r1 || 0.0001, z + h);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    poly(out, [bottom[i], bottom[j], top[j], top[i]], rgb, c);
  }
  if (r1 > 0.05) poly(out, top, rgb, [x, y, z]);
}

function house(out: Face[], x: number, y: number, wall: string, roof: string, s = 1) {
  box(out, x, y, 0, 2 * s, 1.6 * s, 1.3 * s, wall);
  const rgb = hex(roof);
  const [x0, x1, y0, y1, z0, z1] = [x - 1.15 * s, x + 1.15 * s, y - 0.95 * s, y + 0.95 * s, 1.3 * s, 2.2 * s];
  const c: Vec3 = [x, y, 1.5 * s];
  poly(out, [[x0, y0, z0], [x1, y0, z0], [x1, y, z1], [x0, y, z1]], rgb, c);
  poly(out, [[x0, y1, z0], [x1, y1, z0], [x1, y, z1], [x0, y, z1]], rgb, c);
  poly(out, [[x0, y0, z0], [x0, y1, z0], [x0, y, z1]], hex(wall), c);
  poly(out, [[x1, y0, z0], [x1, y1, z0], [x1, y, z1]], hex(wall), c);
  box(out, x + 0.55 * s, y - 0.35 * s, 1.6 * s, 0.28 * s, 0.28 * s, 1.0 * s, "#6d4c41");
  if (s > 0.3) box(out, x - 0.25 * s, y + 0.81 * s, 0, 0.45 * s, 0.02 * s, 0.8 * s, "#5d4037");
}

/** Stable per-source spawn rate: grows with the source's emission relative to the village baseline total. */
function rates(e: Emissions, baseTotal: number): Emissions {
  const ref = Math.max(baseTotal, 1e-6);
  const out = {} as Emissions;
  for (const k of Object.keys(e) as SourceKey[]) out[k] = e[k] <= 0 ? 0 : 4 + 34 * Math.sqrt(e[k] / ref);
  return out;
}

/** Rotatable 3D village where each emission source visibly pours gas into a shared atmosphere layer. */
export default function CarbonLabScene({ emissions, baseline, focus, onPick, village }: SceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smogRef = useRef<HTMLVideoElement>(null);
  const layout = useMemo(() => (village ? villageLayout(village) : demoLayout()), [village]);
  const props = useRef({ emissions, baseline, focus, layout });
  props.current = { emissions, baseline, focus, layout };
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  playingRef.current = playing;
  // Real villages start north-up so they line up with the 2D maps; the illustrative one at an angle.
  const homeYaw = village ? 0 : -0.7;
  const cam = useRef({
    yaw: homeYaw, pitch: 0.72, targetYaw: null as number | null, idle: 0, dragging: false,
    zoom: 1, center: [0, 0] as P2, targetCenter: [0, 0] as P2,
  });
  const zoomBy = (f: number) => { cam.current.zoom = Math.min(4, Math.max(0.6, cam.current.zoom * f)); };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  // The smog footage plays with the animation.
  useEffect(() => {
    const v = smogRef.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);

  // New layout: back to the home view.
  const lastFocus = useRef(focus);
  useEffect(() => {
    Object.assign(cam.current, { yaw: homeYaw, targetYaw: null, idle: 0, center: [0, 0], targetCenter: [0, 0] });
    lastFocus.current = focus;
  }, [layout]);

  // Turn the camera so a newly picked source faces the viewer (not on first load, which stays north-up).
  useEffect(() => {
    if (!focus || focus === lastFocus.current) return;
    lastFocus.current = focus;
    const [ax, ay] = layout.anchors[focus];
    cam.current.targetYaw = Math.PI / 2 - Math.atan2(ay, ax);
    cam.current.targetCenter = [ax * 0.5, ay * 0.5];
  }, [focus, layout]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0, h = 0, raf = 0, last = performance.now(), time = 0;
    const particles: Particle[] = [];
    const spawnAcc: Record<string, number> = {};
    let load = 1; // smoothed atmosphere load (current / baseline total)
    let placedLabels: { key: SourceKey; x0: number; x1: number; y: number }[] = [];
    const images: Record<string, HTMLImageElement> = {};
    for (const [key, { src }] of Object.entries(ICONS)) {
      const img = new Image();
      img.src = encodeURI(src);
      images[key] = img;
    }
    const smog = document.createElement("canvas");
    const sctx = smog.getContext("2d")!;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      smog.width = w;
      smog.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const project = (p: Vec3) => {
      const { yaw, pitch, zoom, center } = cam.current;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const x = p[0] - center[0], y = p[1] - center[1];
      const xr = x * c - y * s;
      const yr = x * s + y * c;
      const depth = yr * Math.cos(pitch) + p[2] * Math.sin(pitch);
      const f = 60 / (60 - Math.min(depth, 50));
      const scale = Math.min(w / 30, h / 22) * f * zoom;
      return { x: w / 2 + xr * scale, y: h * 0.6 + (yr * Math.sin(pitch) - p[2] * Math.cos(pitch)) * scale, depth, scale };
    };
    const facing = (n: Vec3) => {
      const { yaw, pitch } = cam.current;
      const yr = n[0] * Math.sin(yaw) + n[1] * Math.cos(yaw);
      return yr * Math.cos(pitch) + n[2] * Math.sin(pitch);
    };

    const emit = (at: Vec3, color: Rgb, opts: Partial<Particle> & { spread?: number; up?: number } = {}) => {
      if (particles.length >= MAX_PARTICLES) return;
      const sp = opts.spread ?? 0.15;
      particles.push({
        p: [at[0] + rand(-sp, sp), at[1] + rand(-sp, sp), at[2]],
        v: opts.v ?? [rand(-0.15, 0.15) + 0.25, rand(-0.15, 0.15), opts.up ?? rand(1.2, 2)],
        age: 0, life: opts.life ?? rand(6, 9), size: opts.size ?? rand(0.25, 0.45), rgb: color, glow: opts.glow,
      });
    };

    const spawn = (L: Layout, dt: number, e: Emissions, baseTotal: number, bikes: Vec3[], animals: { p: Vec3; kind: SourceKey }[]) => {
      const u = L.u;
      const puff = Math.min(1, Math.max(0.5, u * 1.5));
      const chimney = (): Vec3 => {
        const [x, y] = L.houses[(Math.random() * L.houses.length) | 0];
        return [x + 0.55 * u, y - 0.35 * u, 2.7 * u];
      };
      const r = rates(e, baseTotal);
      const tick = (key: SourceKey, fn: () => void) => {
        spawnAcc[key] = (spawnAcc[key] ?? 0) + r[key] * dt;
        while (spawnAcc[key] >= 1) {
          spawnAcc[key] -= 1;
          fn();
        }
      };
      tick("lpg", () => L.houses.length && emit(chimney(), [150, 175, 215], { size: rand(0.18, 0.3) * puff, spread: 0.15 * u }));
      tick("firewood", () => L.houses.length && emit(chimney(), [95, 80, 72], { size: rand(0.35, 0.6) * puff, spread: 0.15 * u }));
      tick("electricity", () => emit([L.plant[0] + 1, L.plant[1] - 0.6, 7], [120, 120, 125], { size: rand(0.45, 0.8), spread: 0.25 }));
      tick("petrol", () => {
        if (!bikes.length) return;
        const b = bikes[(Math.random() * bikes.length) | 0];
        emit([b[0], b[1], 0.35 * u], [110, 110, 110], { size: rand(0.12, 0.22) * puff, spread: 0.05, up: rand(0.6, 1.1) });
      });
      const dumpR = Math.max(0.5, u);
      tick("waste", () => emit([L.dump[0] + rand(-dumpR, dumpR), L.dump[1] + rand(-dumpR, dumpR), 0.9 * dumpR], hex("#ab47bc"), { size: rand(0.15, 0.3) * puff, up: rand(0.8, 1.4), glow: true }));
      for (const kind of ["cow", "goat", "sheep"] as const) {
        tick(kind, () => {
          const herd = animals.filter((a) => a.kind === kind);
          if (!herd.length) return;
          const a = herd[(Math.random() * herd.length) | 0];
          emit([a.p[0], a.p[1], a.p[2]], hex("#ffa726"), { size: rand(0.12, 0.24) * puff, spread: 0.1 * u, up: rand(0.7, 1.2), glow: true });
        });
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(Math.max(0, (now - last) / 1000), 0.05);
      last = now;
      const run = playingRef.current;
      if (run) time += dt;
      const { emissions: e, baseline: base, focus: foc, layout: L } = props.current;
      const u = L.u;
      const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
      const total = Object.values(e).reduce((a, b) => a + b, 0);
      load += ((baseTotal > 0 ? total / baseTotal : 1) - load) * Math.min(1, dt * 2);
      const haze = Math.min(1, Math.max(0, (load - 0.4) / 2));

      // Camera: ease to the focus target, otherwise slowly orbit when idle.
      const c = cam.current;
      const ease = Math.min(1, dt * 2);
      c.center = [c.center[0] + (c.targetCenter[0] - c.center[0]) * ease, c.center[1] + (c.targetCenter[1] - c.center[1]) * ease];
      if (c.targetYaw !== null) {
        const d = ((c.targetYaw - c.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        c.yaw += d * Math.min(1, dt * 3);
        if (Math.abs(d) < 0.002) c.targetYaw = null;
      } else if (run && !c.dragging) {
        c.idle += dt;
        // Only the illustrative village orbits; a real one stays put so it keeps matching the map.
        if (c.idle > 3 && !L.parcelLines.length) c.yaw += dt * 0.08;
      }

      // Sky darkens and browns as the atmosphere load rises.
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, rgba(mix([96, 165, 230], [120, 105, 95], haze)));
      sky.addColorStop(0.55, rgba(mix([200, 228, 245], [190, 165, 140], haze)));
      sky.addColorStop(1, rgba(mix([225, 240, 225], [200, 185, 160], haze)));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgba([255, 236, 150], 0.9 - haze * 0.6);
      ctx.beginPath();
      ctx.arc(w * 0.84, h * 0.16, Math.min(w, h) * 0.05, 0, Math.PI * 2);
      ctx.fill();

      // Ground slab and flat decals.
      const flat = (pts: Vec3[], fill: string) => {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const s = project(p);
          if (i) ctx.lineTo(s.x, s.y);
          else ctx.moveTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      // Ground slab: the outline drawn twice gives it a visible edge.
      const groundRgb = mix([124, 179, 66], [150, 140, 90], haze * 0.7);
      flat(L.ground.map(([x, y]) => [x, y, -0.7] as Vec3), rgba(mix(groundRgb, [40, 50, 30], 0.45)));
      flat(L.ground.map(([x, y]) => [x, y, 0] as Vec3), rgba(groundRgb));
      for (const d of L.decals) flat(d.ring.map(([x, y]) => [x, y, 0] as Vec3), d.fill);
      if (L.parcelLines.length) {
        ctx.strokeStyle = "rgba(62,39,35,0.35)";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (const r of L.parcelLines) {
          r.forEach(([x, y], i) => {
            const s = project([x, y, 0]);
            if (i) ctx.lineTo(s.x, s.y);
            else ctx.moveTo(s.x, s.y);
          });
          ctx.closePath();
        }
        ctx.stroke();
      }
      const roadScreen = L.road.map(([x, y]) => project([x, y, 0]));
      ctx.strokeStyle = "#78909c";
      ctx.lineJoin = "round";
      ctx.lineWidth = L.roadWidth * project([0, 0, 0]).scale;
      ctx.beginPath();
      roadScreen.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)));
      ctx.closePath();
      ctx.stroke();

      // Solids.
      const faces: Face[] = [];
      const sprites: Sprite[] = [];
      // Which way something moving from a to b goes on screen (sprites face that way).
      const goesLeft = (a: Vec3, b: Vec3) => project(b).x < project(a).x;
      L.houses.forEach(([x, y], i) => house(faces, x, y, WALLS[i % WALLS.length], i % 2 ? "#c62828" : "#8d6e63", u));
      const treeS = Math.max(0.45, u * 1.4);
      L.trees.forEach(([x, y], i) => sprites.push({ at: [x, y, 0], img: i % 2 ? "tree2" : "tree", height: 2 * treeS * (0.8 + (i % 3) * 0.15) }));
      const [px, py] = L.plant;
      box(faces, px, py, 0, 3, 2.2, 2, "#90a4ae");
      prism(faces, px + 1, py - 0.6, 2, 0.4, 0.3, 5, 8, "#b0bec5");
      prism(faces, px - 1.6, py + 1.4, 0, 1.2, 0.8, 3, 10, "#cfd8dc");
      const ds = Math.max(0.5, u);
      const [dx, dy] = L.dump;
      prism(faces, dx, dy, 0, 1.8 * ds, 0.3 * ds, 1 * ds, 9, "#795548");
      box(faces, dx + 0.6 * ds, dy - 0.4 * ds, 0.8 * ds, 0.5 * ds, 0.4 * ds, 0.3 * ds, "#7b1fa2");
      box(faces, dx - 0.5 * ds, dy + 0.5 * ds, 0.75 * ds, 0.4 * ds, 0.5 * ds, 0.25 * ds, "#1565c0");
      // Power poles from the plant to the settlement.
      L.poles.forEach(([x, y]) => sprites.push({ at: [x, y, 0], img: "tower", height: 2.8 }));
      L.fences.forEach(([x, y]) => box(faces, x, y, 0, 0.12, 0.12, 0.6, "#8d6e63"));

      // Bikes: count follows petrol use relative to the survey.
      const petrolRatio = base.petrol > 0 ? e.petrol / base.petrol : e.petrol > 0 ? 1 : 0;
      const nBikes = Math.min(9, Math.round(3 * petrolRatio));
      const bikes: Vec3[] = [];
      const loop = L.roadLen[L.roadLen.length - 1];
      // Icons stay readable even in big villages where houses are tiny.
      const bu = Math.max(0.6, u);
      for (let i = 0; L.road.length > 1 && i < nBikes; i++) {
        const d = (time * 2 + (i / Math.max(nBikes, 1)) * loop) * (i % 2 ? -1 : 1);
        const [x, y] = along(L.road, L.roadLen, d);
        const [nx, ny] = along(L.road, L.roadLen, d + (i % 2 ? -0.2 : 0.2));
        bikes.push([x, y, 0]);
        const car = i % 4 === 3;
        sprites.push({ at: [x, y, 0], img: car ? "car" : "bike", height: (car ? 0.75 : 0.9) * bu, flip: goesLeft([x, y, 0], [nx, ny, 0]) });
      }

      // Herds sized by head count relative to the survey.
      const animals: { p: Vec3; kind: SourceKey }[] = [];
      (["cow", "goat", "sheep"] as const).forEach((kind, ki) => {
        const ratio = base[kind] > 0 ? e[kind] / base[kind] : e[kind] > 0 ? 1 : 0;
        const n = Math.min(kind === "cow" ? 10 : 8, Math.round((kind === "cow" ? 4 : 3) * ratio));
        const au = Math.max(0.6, u);
        for (let i = 0; i < n; i++) {
          const seed = ki * 13 + i * 7.3;
          const [sx, sy] = L.pasture[(ki * 10 + i) % L.pasture.length];
          const px = sx + Math.sin(time * 0.2 + seed) * 0.4 * au;
          const py = sy + Math.cos(time * 0.15 + seed) * 0.4 * au;
          const height = (kind === "cow" ? 1.15 : kind === "goat" ? 0.9 : 0.8) * au;
          const img = kind === "sheep" ? "sheep" : `${kind}${i % 2 ? "2" : ""}`;
          const next: Vec3 = [px + Math.cos(time * 0.2 + seed) * 0.08, py - Math.sin(time * 0.15 + seed) * 0.06, 0];
          sprites.push({ at: [px, py, 0], img, height, flip: goesLeft([px, py, 0], next) });
          animals.push({ p: [px, py, height * 0.7], kind });
        }
      });

      drawFaces(faces, sprites);

      // Wires with power pulses (speed and density follow electricity use).
      const wireEnd = L.houses.length ? centroid(L.houses) : L.poles[L.poles.length - 1];
      const wire: Vec3[] = [[px - 1.3, py, 1.9], ...L.poles.map(([x, y]) => [x, y, 2.6] as Vec3), [wireEnd[0], wireEnd[1], 1.4 * Math.max(u, 0.4)]];
      ctx.strokeStyle = "rgba(55,71,79,0.8)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      wire.forEach((p, i) => {
        const s = project(p);
        if (i) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      });
      ctx.stroke();
      const elecRatio = base.electricity > 0 ? e.electricity / base.electricity : e.electricity > 0 ? 1 : 0;
      const pulses = Math.min(12, Math.round(4 * elecRatio));
      for (let i = 0; i < pulses; i++) {
        const t = ((time * 0.4 + i / pulses) % 1) * (wire.length - 1);
        const k = Math.min(Math.floor(t), wire.length - 2);
        const f = t - k;
        const a = wire[k], b = wire[k + 1];
        const s = project([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
        ctx.fillStyle = "rgba(255,213,79,0.95)";
        ctx.shadowColor = "#ffca28";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Firewood chulha glow at the doors.
      if (e.firewood > 0) {
        L.houses.forEach(([x, y], i) => {
          const s = project([x - 0.25 * u, y + 0.85 * u, 0.3 * u]);
          ctx.fillStyle = `rgba(255,${120 + 60 * Math.sin(time * 9 + i)},40,0.7)`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, Math.max(1.2, s.scale * 0.18 * u), 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Particles: rise, drift, and pool into the atmosphere layer.
      if (run) {
        spawn(L, dt, e, baseTotal, bikes, animals);
        for (const p of particles) {
          p.age += dt;
          const nearTop = p.p[2] > ATMOS_Z - 2;
          p.v[2] *= nearTop ? 0.92 : 0.995;
          p.v[0] += (0.05 + Math.sin(time + p.p[1]) * 0.04) * dt;
          p.p[0] += p.v[0] * dt;
          p.p[1] += p.v[1] * dt;
          p.p[2] = Math.min(ATMOS_Z + 1, p.p[2] + p.v[2] * dt);
          p.size += dt * (p.glow ? 0.03 : 0.12);
        }
        for (let i = particles.length - 1; i >= 0; i--) if (particles[i].age > particles[i].life) particles.splice(i, 1);
      }
      const drawn = particles.map((p) => ({ p, s: project(p.p) })).sort((a, b) => a.s.depth - b.s.depth);
      for (const { p, s } of drawn) {
        const fade = Math.min(1, p.age * 2) * (1 - p.age / p.life);
        ctx.fillStyle = rgba(p.rgb, (p.glow ? 0.75 : 0.45) * fade);
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(1, p.size * s.scale * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      // Greenhouse blanket: the CO2 plume footage, denser, deeper and faster-swirling as emissions rise.
      const top = Math.max(h * 0.14, project([0, 0, ATMOS_Z]).y);
      const smogLevel = total > 0 ? Math.min(1, Math.max(0, (load - 0.15) / 1.6)) : 0;
      const video = smogRef.current;
      if (video && video.readyState >= 2 && smogLevel > 0.01) {
        video.playbackRate = 0.4 + smogLevel * 1.2;
        const bandH = h * (0.22 + 0.42 * smogLevel);
        const y0 = Math.max(0, top - bandH * 0.6);
        const k = Math.max(w / video.videoWidth, bandH / video.videoHeight);
        const dw = video.videoWidth * k, dh = video.videoHeight * k;
        sctx.globalCompositeOperation = "source-over";
        sctx.clearRect(0, 0, w, h);
        sctx.drawImage(video, (w - dw) / 2, y0 + (bandH - dh) / 2, dw, dh);
        const fade = sctx.createLinearGradient(0, y0, 0, y0 + bandH);
        fade.addColorStop(0, "rgba(0,0,0,0.35)");
        fade.addColorStop(0.25, "rgba(0,0,0,1)");
        fade.addColorStop(0.6, "rgba(0,0,0,0.8)");
        fade.addColorStop(1, "rgba(0,0,0,0)");
        sctx.globalCompositeOperation = "destination-in";
        sctx.fillStyle = fade;
        sctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 0.12 + 0.7 * smogLevel;
        ctx.drawImage(smog, 0, 0, w, h);
        ctx.globalAlpha = 1;
      } else if (smogLevel > 0.01) {
        const band = ctx.createLinearGradient(0, top - h * 0.18, 0, top + h * 0.12);
        const bandRgb = mix([160, 160, 165], [110, 80, 60], haze);
        band.addColorStop(0, rgba(bandRgb, 0));
        band.addColorStop(0.5, rgba(bandRgb, Math.min(0.75, 0.12 + load * 0.22)));
        band.addColorStop(1, rgba(bandRgb, 0));
        ctx.fillStyle = band;
        ctx.fillRect(0, top - h * 0.18, w, h * 0.3);
      }
      // Smog level badge (top right).
      const smogText = `Smog: ${smogLevel < 0.05 ? "clear" : smogLevel < 0.35 ? "light" : smogLevel < 0.7 ? "moderate" : "heavy"}`;
      ctx.font = "700 11px system-ui, sans-serif";
      const sw = ctx.measureText(smogText).width + 34;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.beginPath();
      ctx.roundRect(w - sw - 12, 12, sw, 22, 11);
      ctx.fill();
      ctx.fillStyle = rgba(mix([129, 199, 132], [121, 85, 72], smogLevel));
      ctx.beginPath();
      ctx.arc(w - sw + 1, 23, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#263238";
      ctx.textAlign = "left";
      ctx.fillText(smogText, w - sw + 12, 27);
      // Heat trapped: sun rays bounce back down off the blanket.
      ctx.strokeStyle = `rgba(255,112,67,${Math.min(0.9, 0.15 + haze)})`;
      ctx.lineWidth = 1.5;
      const rays = 3 + Math.round(load * 3);
      for (let i = 0; i < rays; i++) {
        const x = w * (0.15 + (i / rays) * 0.7);
        const ph = (time * 0.6 + i * 0.37) % 1;
        const y0 = top + 10, y1 = top + 10 + h * 0.18;
        const y = y0 + (y1 - y0) * ph;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6, y + 12);
        ctx.stroke();
      }

      // Focus ring and floating labels (nudged upwards so they never overlap).
      const placed: { x0: number; x1: number; y: number }[] = [];
      const nextLabels: typeof placedLabels = [];
      const keys = (Object.keys(L.anchors) as SourceKey[]).sort((a, b) => (a === foc ? -1 : b === foc ? 1 : project(L.anchors[b]).y - project(L.anchors[a]).y));
      for (const key of keys) {
        const s = project(L.anchors[key]);
        const isFocus = key === foc;
        if (isFocus) {
          const g = project([L.anchors[key][0], L.anchors[key][1], 0]);
          const pulse = 1 + Math.sin(time * 4) * 0.12;
          ctx.strokeStyle = SOURCE_COLORS[key];
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(g.x, g.y, g.scale * 2.4 * pulse, g.scale * 2.4 * pulse * Math.sin(c.pitch), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (!isFocus && w < 520) continue;
        const text = `${LABELS[key]} · ${e[key] >= 100 ? e[key].toFixed(0) : e[key].toFixed(1)} t`;
        ctx.font = `${isFocus ? 700 : 600} ${isFocus ? 13 : 11}px system-ui, sans-serif`;
        const tw = ctx.measureText(text).width;
        const x0 = s.x - tw / 2 - 7, x1 = s.x + tw / 2 + 7;
        let y = s.y - 22;
        while (placed.some((r) => x0 < r.x1 && x1 > r.x0 && Math.abs(r.y - y) < 20)) y -= 4;
        placed.push({ x0, x1, y });
        nextLabels.push({ key, x0, x1, y });
        if (y < s.y - 26) {
          ctx.strokeStyle = "rgba(38,50,56,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(s.x, y + 18);
          ctx.lineTo(s.x, s.y - 4);
          ctx.stroke();
        }
        ctx.fillStyle = isFocus ? SOURCE_COLORS[key] : "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.roundRect(x0, y, tw + 14, 18, 9);
        ctx.fill();
        ctx.fillStyle = isFocus ? "#fff" : "#263238";
        ctx.textAlign = "center";
        ctx.fillText(text, s.x, y + 13);
      }

      // North arrow (real villages: world -y is north).
      if (L.parcelLines.length) {
        const a = project([0, 0, 0]), b = project([0, -1, 0]);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const nx = w - 34, ny = h - 40;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = "#c62828";
        ctx.beginPath();
        ctx.moveTo(0, -12); ctx.lineTo(5, 2); ctx.lineTo(-5, 2);
        ctx.fill();
        ctx.fillStyle = "#90a4ae";
        ctx.beginPath();
        ctx.moveTo(0, 12); ctx.lineTo(5, 2); ctx.lineTo(-5, 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#263238";
        ctx.font = "700 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("N", nx + Math.cos(ang) * 25, ny + Math.sin(ang) * 25 + 3);
      }

      placedLabels = nextLabels;
      raf = requestAnimationFrame(frame);
    };

    function drawSprite(sp: Sprite) {
      const img = images[sp.img];
      if (!img?.complete || !img.naturalWidth) return;
      const s = project(sp.at);
      const hpx = sp.height * s.scale;
      const wpx = hpx * (img.naturalWidth / img.naturalHeight);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, wpx * 0.38, Math.max(1, wpx * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
      const flip = (sp.flip ? -1 : 1) * ICONS[sp.img].faces === -1;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(img, -wpx / 2, -hpx, wpx, hpx);
      ctx.restore();
    }

    /** Polygons and sprites painted back to front together, so icons hide behind houses correctly. */
    function drawFaces(faces: Face[], sprites: Sprite[] = []) {
      type Item = { f?: Face; sp?: Sprite; pts?: ReturnType<typeof project>[]; depth: number };
      const items: Item[] = faces
        .filter((f) => facing(f.n) > 0)
        .map((f) => {
          const pts = f.pts.map(project);
          return { f, pts, depth: pts.reduce((s, p) => s + p.depth, 0) / pts.length };
        });
      for (const sp of sprites) items.push({ sp, depth: project(sp.at).depth + 0.05 });
      items.sort((a, b) => a.depth - b.depth);
      for (const { f, sp, pts } of items) {
        if (sp) {
          drawSprite(sp);
          continue;
        }
        if (!f || !pts) continue;
        const light = 0.55 + 0.45 * Math.max(0, f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2]);
        ctx.fillStyle = rgba([f.rgb[0] * light, f.rgb[1] * light, f.rgb[2] * light], f.alpha ?? 1);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Drag to orbit; click a label to pick its source.
    let down: { x: number; y: number; moved: boolean } | null = null;
    const onDown = (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY, moved: false };
      cam.current.dragging = true;
      cam.current.targetYaw = null;
      canvas.setPointerCapture(ev.pointerId);
    };
    const onMove = (ev: PointerEvent) => {
      if (!down) return;
      const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) down.moved = true;
      cam.current.yaw += dx * 0.008;
      cam.current.pitch = Math.min(1.25, Math.max(0.3, cam.current.pitch + dy * 0.005));
      down.x = ev.clientX;
      down.y = ev.clientY;
    };
    const onUp = (ev: PointerEvent) => {
      cam.current.dragging = false;
      cam.current.idle = 0;
      if (down && !down.moved) {
        const r = canvas.getBoundingClientRect();
        const mx = ev.clientX - r.left, my = ev.clientY - r.top;
        let best: SourceKey | null = null, bestD = 40;
        const { anchors } = props.current.layout;
        for (const r of placedLabels) if (mx >= r.x0 && mx <= r.x1 && my >= r.y && my <= r.y + 18) [best, bestD] = [r.key, 0];
        for (const key of Object.keys(anchors) as SourceKey[]) {
          const s = project(anchors[key]);
          const d = Math.hypot(s.x - mx, s.y - 12 - my);
          if (d < bestD) [best, bestD] = [key, d];
        }
        if (best) pickRef.current(best);
      }
      down = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      cam.current.zoom = Math.min(4, Math.max(0.6, cam.current.zoom * Math.exp(-ev.deltaY * 0.0015)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="lab-scene">
      <canvas ref={canvasRef} aria-label="Animated 3D village showing gas rising from each emission source into the atmosphere" role="img" />
      {/* Smog footage drawn into the canvas; kept out of sight here. */}
      <video ref={smogRef} className="lab-smog-src" src={SMOG_VIDEO} muted loop playsInline autoPlay preload="auto" aria-hidden />
      <div className="lab-scene-controls">
        <button type="button" className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause animation" : "Play animation"}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.3)}><Plus size={16} /></button>
        <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)}><Minus size={16} /></button>
        <button type="button" className="icon-btn" aria-label="Reset view"
          onClick={() => Object.assign(cam.current, { yaw: homeYaw, pitch: 0.72, targetYaw: null, idle: 0, zoom: 1, targetCenter: [0, 0] })}>
          <RotateCcw size={16} />
        </button>
      </div>
      <p className="lab-scene-hint">Drag to rotate · scroll to zoom · click a label to inspect · smog footage: NASA GEOS-5 CO₂ model (via TIME)</p>
    </div>
  );
}

const WALLS = ["#ffe0b2", "#ffccbc", "#fff9c4", "#d7ccc8", "#ffecb3"];

const LABELS: Record<SourceKey, string> = {
  lpg: "LPG", firewood: "Firewood", electricity: "Power plant (off-site)", petrol: "Bikes",
  waste: "Waste dump", cow: "Cattle", goat: "Goats", sheep: "Sheep",
};
