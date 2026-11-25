import { Suspense } from "react";
import { DriverGate } from "../ui/DriverGate";
import { CollectionView } from "./CollectionView";

export default function CollectionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <DriverGate>
        <CollectionView />
      </DriverGate>
    </Suspense>
  );
}
