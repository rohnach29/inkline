import { describe, it, expect } from "vitest";
import { pageFileName, svgShell, inlineTokens } from "./share";

describe("pageFileName", () => {
  it('turns a data-page value into "inkline-{value}.png"', () => {
    expect(pageFileName("ch-3")).toBe("inkline-ch-3.png");
  });

  it('falls back to "inkline-page.png" when data-page is null', () => {
    expect(pageFileName(null)).toBe("inkline-page.png");
  });

  it("handles other real data-page values (cover, colophon)", () => {
    expect(pageFileName("cover")).toBe("inkline-cover.png");
    expect(pageFileName("colophon")).toBe("inkline-colophon.png");
  });

  it('treats "" the same as a real value, not as null', () => {
    // empty string is falsy in JS but is NOT null — must not fall back.
    expect(pageFileName("")).toBe("inkline-.png");
  });
});

describe("svgShell", () => {
  it("wraps inner content in an SVG + foreignObject with the correct xmlns and dimensions", () => {
    const html = svgShell(300, 200, "<div>hi</div>");
    expect(html).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(html).toContain('width="300"');
    expect(html).toContain('height="200"');
    expect(html).toContain("<foreignObject");
    expect(html).toContain("<div>hi</div>");
  });

  it("passes inner content through verbatim, unescaped", () => {
    const inner = '<p class="x">a &amp; b</p>';
    const html = svgShell(10, 10, inner);
    expect(html).toContain(inner);
  });

  it("sizes the foreignObject to match the outer svg exactly", () => {
    const html = svgShell(640, 480, "x");
    const svgTag = html.match(/<svg[^>]*>/)?.[0] ?? "";
    const foTag = html.match(/<foreignObject[^>]*>/)?.[0] ?? "";
    expect(svgTag).toContain('width="640"');
    expect(svgTag).toContain('height="480"');
    expect(foTag).toContain('width="640"');
    expect(foTag).toContain('height="480"');
  });
});

describe("inlineTokens", () => {
  it("formats a single token pair as a style-attribute-ready string", () => {
    expect(inlineTokens({ "--ink": "#26211A" })).toBe("--ink:#26211A;");
  });

  it("formats every pair, sorted by key so output is order-stable", () => {
    const out = inlineTokens({
      "--shadow": "rgba(0,0,0,.5)",
      "--desk": "#e9e2d2",
      "--ink": "#26211a",
    });
    expect(out).toBe("--desk:#e9e2d2;--ink:#26211a;--shadow:rgba(0,0,0,.5);");
  });

  it("returns an empty string for no tokens", () => {
    expect(inlineTokens({})).toBe("");
  });

  it("is stable regardless of input key order", () => {
    const a = inlineTokens({ b: "2", a: "1" });
    const b = inlineTokens({ a: "1", b: "2" });
    expect(a).toBe(b);
  });
});
