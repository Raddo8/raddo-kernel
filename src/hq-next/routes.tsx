/** HOST COMPOSITIONS for the Lovable repo. The ONLY file that touches app auth.
 * Merged into src/App.tsx as two additive <Route> lines:
 *   <Route path="/hq-next" element={<AuthGate><ClientReadinessGate><HqNextClient /></ClientReadinessGate></AuthGate>} />
 *   <Route path="hq-next" element={<HqNextOperator />} />   // inside the existing /control ControlShell tree
 * Identity is SERVER-derived here (current_cid RPC + is_fleet_operator RPC) and
 * handed to HqNext, which cannot resolve identity itself.
 * NOTE: this file references the repo's supabase client and gates; it is compiled
 * IN THE REPO, not in this workspace. Kept out of the local build on purpose. */
export const ROUTE_SNIPPET = `
// /hq-next (client) — AuthGate + ClientReadinessGate wrap in App.tsx
// /control/hq-next (operator) — inherits AuthGate + FleetOperatorGate from ControlShell
`;
