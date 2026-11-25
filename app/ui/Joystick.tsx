"use client";

import { useRef } from "react";
import { input } from "../game/input";

const MAX_RADIUS = 38;

/** The thumb joystick. It only reports a vector in -1..1; the driver moves the claw. */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_RADIUS) { dx = (dx / dist) * MAX_RADIUS; dy = (dy / dist) * MAX_RADIUS; }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setJoystick(dx / MAX_RADIUS, dy / MAX_RADIUS);
  };
  const reset = () => {
    dragging.current = false;
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
    input.setJoystick(0, 0);
  };

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2">
      <div
        ref={base}
        role="application"
        aria-label="Steering joystick"
        className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full glass-panel border-2 border-white/15 shadow-glass flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); update(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (dragging.current) update(e.clientX, e.clientY); }}
        onPointerUp={reset}
        onPointerCancel={reset}
      >
        <div className="absolute inset-3 rounded-full border border-dashed border-white/10 pointer-events-none" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/25 pointer-events-none" />
        <div ref={knob} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-b from-slate-600 to-slate-800 border-2 border-accent shadow-neon-violet flex items-center justify-center transition-transform duration-75">
          <div className="w-4 h-4 rounded-full bg-accent/80" />
        </div>
      </div>
      <span className="font-mono text-[11px] text-muted bg-base/75 px-2.5 py-0.5 rounded-full">Steer · WASD / drag</span>
    </div>
  );
}
