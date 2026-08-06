/** The view switcher used on /hq/world and /hq/memories.
 *
 * Three ways to look at the same information. The choice is remembered for this
 * client in this browser. Nothing here reads or writes your records.
 */
import { HQ_VIEWS, type HqView } from "@/lib/world-views";

export function ViewSwitch({
  view,
  onChange,
  labels,
}: {
  view: HqView;
  onChange: (v: HqView) => void;
  labels?: Partial<Record<HqView, string>>;
}) {
  return (
    <div className="vswitch" role="group" aria-label="How to look at this">
      {HQ_VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          className={`vbtn${view === v.key ? " on" : ""}`}
          aria-pressed={view === v.key}
          title={v.hint}
          onClick={() => onChange(v.key)}
        >
          {labels?.[v.key] ?? v.label}
        </button>
      ))}
    </div>
  );
}

export default ViewSwitch;
