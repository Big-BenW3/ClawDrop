import type { ElementType, ReactNode, CSSProperties } from "react";

/**
 * The mockup's card system: glass surface, cursor spotlight (`spot`, driven by CardEffects) and a
 * glare sweep on hover. The arcade's overlays are plain `glass-card`s without these.
 */
export function GlassCard({ as: Tag = "div", className = "", style, children, ...rest }: { as?: ElementType; className?: string; style?: CSSProperties; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={`glass-card spot glare ${className}`} style={style} {...rest}>
      {children}
      <div className="glare-sweep" />
    </Tag>
  );
}
