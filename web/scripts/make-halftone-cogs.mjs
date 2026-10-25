// Draws web/public/halftone-cogs.svg: large cogs in black on white, for the halftone
// background to print as brass dots. Darker areas print as bigger dots.
// Run: node scripts/make-halftone-cogs.mjs
import { writeFileSync } from "node:fs";

function cog(cx, cy, r, teeth, depth, fill) {
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r - depth;
    pts.push(`${(cx + Math.cos(a0) * rr).toFixed(1)},${(cy + Math.sin(a0) * rr).toFixed(1)}`);
    pts.push(`${(cx + Math.cos(a1) * rr).toFixed(1)},${(cy + Math.sin(a1) * rr).toFixed(1)}`);
  }
  const hub = r * 0.32;
  const spokes = [0, 1, 2, 3, 4, 5]
    .map((k) => {
      const a = (k / 6) * Math.PI * 2;
      return `<circle cx="${(cx + Math.cos(a) * r * 0.58).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.58).toFixed(1)}" r="${(r * 0.14).toFixed(1)}" fill="#fff"/>`;
    })
    .join("");
  return `<path d="M${pts.join("L")}Z" fill="${fill}"/>${spokes}<circle cx="${cx}" cy="${cy}" r="${hub}" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${hub * 0.45}" fill="${fill}"/>`;
}

const cogs = [
  cog(1380, 160, 300, 18, 34, "#222"),
  cog(1040, 520, 190, 14, 26, "#555"),
  cog(1500, 760, 220, 16, 28, "#3a3a3a"),
  cog(140, 820, 260, 16, 30, "#444"),
  cog(430, 1010, 160, 12, 22, "#666"),
  cog(-40, 300, 200, 14, 26, "#777"),
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000"><rect width="1600" height="1000" fill="#fff"/>${cogs.join("")}</svg>\n`;
writeFileSync(new URL("../public/halftone-cogs.svg", import.meta.url), svg);
console.log("wrote public/halftone-cogs.svg");
