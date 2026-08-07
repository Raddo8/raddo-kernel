/** COB mark · the tile that carries the client's initial.
 *
 * The image lives in the asset store and is served by hosting. When it cannot
 * be fetched, we paint the initial instead of leaving a broken image glyph.
 */
import { useState } from "react";

import cobMark from "@/assets/cob-mark.png.asset.json";
import { useCob } from "@/lib/cob-identity";

export function CobMark({ className, size }: { className?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const { cobName } = useCob();
  const letter = (cobName ?? "").trim().charAt(0).toUpperCase();

  if (broken) {
    return (
      <span
        className={`cobmark-fb ${className ?? ""}`}
        aria-hidden="true"
        style={size ? { width: size, height: size, fontSize: Math.round(size * 0.52) } : undefined}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={cobMark.url}
      alt=""
      width={size}
      height={size}
      onError={() => setBroken(true)}
    />
  );
}
