import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Fragment, type ReactNode } from "react";

import { linkify, type LinkTarget } from "@/lib/world-wiki";

const render = (t: LinkTarget, key: string, matched: string) =>
  createElement("a", { key, "data-id": t.id }, matched);

function html(nodes: ReactNode): string {
  return renderToStaticMarkup(createElement(Fragment, null, nodes));
}

const targets: LinkTarget[] = [
  { id: "roc", name: "Roc" },
  { id: "mary", name: "Mary" },
  { id: "chase", name: "Chase" },
  { id: "ypi", name: "YPI" },
];

describe("linkify word boundaries", () => {
  it("leaves 'proceeding' untouched when an entity is named Roc", () => {
    expect(html(linkify("an adversary proceeding", targets, render))).toBe("an adversary proceeding");
  });

  it("leaves 'summary' untouched when an entity is named Mary", () => {
    expect(html(linkify("in summary, primary risk", targets, render))).toBe("in summary, primary risk");
  });

  it("leaves 'purchase' untouched when an entity is named Chase", () => {
    expect(html(linkify("they purchased it", targets, render))).toBe("they purchased it");
  });

  it("leaves 'typical' untouched when an entity is named YPI", () => {
    expect(html(linkify("typically typical", targets, render))).toBe("typically typical");
  });

  it("links a standalone Roc and keeps the prose spelling", () => {
    expect(html(linkify("Roc filed today.", targets, render))).toBe(
      '<a data-id="roc">Roc</a> filed today.',
    );
  });

  it("renders the matched text, not the stored name", () => {
    expect(html(linkify("roc filed today.", targets, render))).toBe(
      '<a data-id="roc">roc</a> filed today.',
    );
  });

  it("prefers the longest name when two overlap", () => {
    const overlap: LinkTarget[] = [
      { id: "short", name: "Roc" },
      { id: "long", name: "Roc Partners" },
    ];
    expect(html(linkify("Roc Partners filed.", overlap, render))).toBe(
      '<a data-id="long">Roc Partners</a> filed.',
    );
  });
});
