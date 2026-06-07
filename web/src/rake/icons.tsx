// icons.tsx — минимальные line-иконки (stroke, currentColor, 24x24) + TokenMark.
import type { CSSProperties, ReactNode } from "react";

type IconProps = { size?: number; sw?: number; style?: CSSProperties };

function Svg({ size = 18, sw = 1.6, children, style }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconChevron = (p: IconProps) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const IconBack = (p: IconProps) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7" /></Svg>;
export const IconExternal = (p: IconProps) => <Svg {...p}><path d="M14 5h5v5M19 5l-8 8M11 6H6v12h12v-5" /></Svg>;
export const IconCopy = (p: IconProps) => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" /></Svg>
);

// TokenMark — «звёздочка»-вырез внутри мягкой плитки. accent — для «горячих» токенов.
export function TokenMark({
  size = 38,
  accent = false,
  radius = 10,
}: {
  size?: number;
  accent?: boolean;
  radius?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flex: "none",
        background: accent ? "var(--accent-wash)" : "var(--surface-2)",
        display: "grid",
        placeItems: "center",
        border: "1px solid var(--line)",
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2 L13.6 9 L20 12 L13.6 15 L12 22 L10.4 15 L4 12 L10.4 9 Z"
          fill={accent ? "var(--accent)" : "#0f1110"}
        />
      </svg>
    </div>
  );
}
