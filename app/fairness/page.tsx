import { Suspense } from "react";
import { DriverGate } from "../ui/DriverGate";
import { FairnessView } from "./FairnessView";

export default function FairnessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <DriverGate>
        <FairnessView />
      </DriverGate>
    </Suspense>
  );
}
