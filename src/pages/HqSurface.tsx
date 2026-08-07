import { SurfaceFrame } from "@/components/SurfaceFrame";
import { HqShell } from "@/components/hq/HqShell";

/** The original pinned HQ document, kept reachable inside the one menu. */
export default function HqSurface() {
  return (
    <HqShell>
      <SurfaceFrame surfaceKey="hq" title="HQ" />
    </HqShell>
  );
}
