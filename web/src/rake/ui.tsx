// ui.tsx — общие хелперы: форматтеры, count-up, Pill, Dot.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export const SOL = "◎"; // ◎

export function fmtSol(n: number, dp = 2): string {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtPct(n: number, dp = 1): string {
  return Number(n).toFixed(dp) + "%";
}

// Count-up: бежит один раз, когда run становится true (и при смене value).
export function useCountUp(value: number, run: boolean, { dur = 900, dp = 2 } = {}): number {
  const [disp, setDisp] = useState(run ? 0 : value);
  const raf = useRef(0);
  useEffect(() => {
    if (!run) { setDisp(value); return; }
    const start = performance.now();
    const from = 0, to = Number(value);
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setDisp(from + (to - from) * ease(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // Подстраховка: если rAF заморожен (вкладка не в фокусе) — всё равно дойти до значения.
    const guard = setTimeout(() => setDisp(Number(value)), dur + 120);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(guard); };
  }, [value, run, dur]);
  const f = Math.pow(10, dp);
  return Math.round(disp * f) / f;
}

type Tone = "neutral" | "accent" | "sale";

export function Pill({ children, tone = "neutral", style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  const tones: Record<Tone, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: "var(--surface-2)", fg: "var(--ink-2)", bd: "var(--line)" },
    accent:  { bg: "var(--accent-wash)", fg: "var(--accent-ink)", bd: "transparent" },
    sale:    { bg: "var(--surface-2)", fg: "var(--ink)", bd: "var(--line)" },
  };
  const c = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        font: "500 11px/1 var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase",
        padding: "6px 9px", borderRadius: 999, background: c.bg, color: c.fg,
        border: `1px solid ${c.bd}`, whiteSpace: "nowrap", ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ color = "var(--accent)", size = 6 }: { color?: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: color, display: "inline-block" }} />;
}
