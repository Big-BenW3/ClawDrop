"use client";

import { useEffect } from "react";
import { loadEngine } from "./loadEngine";

/**
 * A live 3D creature drawn into a 2D canvas by the engine's shared renderer. The engine finds
 * `canvas[data-creature]` elements by itself; this component only makes sure it is loaded.
 * `mode` is read once when the canvas mounts, so changing it remounts (via `key`).
 */
export function CreatureCanvas({ id, mode = "idle", className = "w-full h-full block" }: { id: string; mode?: "idle" | "celebrate" | "turntable"; className?: string }) {
  useEffect(() => { void loadEngine(); }, []);
  return <canvas key={`${id}:${mode}`} data-creature={id} data-mode={mode} className={className} />;
}
