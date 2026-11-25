import { Suspense } from "react";
import type { Viewport } from "next";
import { DriverGate } from "../ui/DriverGate";
import { ArcadeScreen } from "./ArcadeScreen";

// No pinch-zoom on the machine: the joystick would trigger it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-base" />}>
      <DriverGate>
        <ArcadeScreen />
      </DriverGate>
    </Suspense>
  );
}
