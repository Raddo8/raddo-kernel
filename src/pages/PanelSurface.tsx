import { SurfaceFrame } from "@/components/SurfaceFrame";

/**
 * Authority for this surface is enforced by FleetOperatorGate on the route.
 * The legacy is_cob_operator() check was removed · it is not fleet authority.
 */
export default function PanelSurface() {
  return <SurfaceFrame surfaceKey="panel" title="Panel" />;
}
