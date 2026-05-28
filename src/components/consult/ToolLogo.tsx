// 16px brand mark for a tool chip · 3-tier logo fallback chain:
//   1. SimpleIcons CDN (slug)
//   2. Google s2 favicons (domain)
//   3. Monogram circle (first letter of name)
// Colors come from the brand mark unchanged · no recoloring on selection.

import { useState } from "react";

type Tier = "simpleicons" | "favicon" | "monogram";

export function ToolLogo({
  name,
  slug,
  domain,
  size = 16,
}: {
  name: string;
  slug: string;
  domain: string;
  size?: number;
}) {
  const [tier, setTier] = useState<Tier>("simpleicons");

  if (tier !== "monogram") {
    const src =
      tier === "simpleicons"
        ? `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`
        : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setTier(tier === "simpleicons" ? "favicon" : "monogram")}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
    );
  }

  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "hsl(215 25% 27%)",
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.65),
        fontWeight: 600,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {letter}
    </span>
  );
}

export default ToolLogo;
