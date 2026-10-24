// Draws the mock camera snapshots in web/public/mock/ from lib/data/mock/scenes.json.
// One fixed view (shelf, side table, desk), the way the Pi camera sees the room; each
// snapshot places items at the positions the mock detections use, so boxes line up.
// Run: node scripts/make-mock-scenes.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const scenes = JSON.parse(readFileSync(new URL("lib/data/mock/scenes.json", root)));
const { width: W, height: H } = scenes;

const room = `
  <rect width="${W}" height="${H}" fill="#d9cfbc"/>
  <rect y="330" width="${W}" height="${H - 330}" fill="#6b5641"/>
  <rect y="322" width="${W}" height="10" fill="#b9ab92"/>
  <rect x="980" y="40" width="220" height="170" fill="#c8bea9"/>
  <rect x="992" y="52" width="196" height="146" fill="#a7b5b9"/>
  <rect x="992" y="150" width="196" height="48" fill="#8d9c8f"/>
  <rect x="70" y="180" width="420" height="16" fill="#7a5638"/>
  <rect x="90" y="196" width="10" height="26" fill="#5e4129"/>
  <rect x="460" y="196" width="10" height="26" fill="#5e4129"/>
  <rect x="96" y="96" width="34" height="84" fill="#8a3b2a"/>
  <rect x="134" y="110" width="28" height="70" fill="#2f4a5e"/>
  <rect x="166" y="102" width="30" height="78" fill="#b8902f"/>
  <rect x="80" y="500" width="330" height="22" fill="#8b6b4a"/>
  <rect x="96" y="522" width="298" height="150" fill="#76583b"/>
  <rect x="236" y="560" width="28" height="8" fill="#c9a24a"/>
  <rect x="510" y="460" width="740" height="26" fill="#7d5c3c"/>
  <polygon points="540,330 1250,330 1250,460 510,460" fill="#9a7650"/>
  <rect x="540" y="486" width="22" height="234" fill="#5e4129"/>
  <rect x="1206" y="486" width="22" height="234" fill="#5e4129"/>
  <polygon points="1010,240 1190,240 1190,370 1010,370" fill="#2c2b2a"/>
  <rect x="1020" y="250" width="160" height="110" fill="#8fa3ad"/>
  <polygon points="990,372 1210,372 1230,420 970,420" fill="#3a3836"/>
  <rect x="890" y="300" width="60" height="70" fill="#e6dfd1"/>
  <rect x="950" y="318" width="16" height="30" fill="none" stroke="#e6dfd1" stroke-width="8"/>`;

const draw = {
  wallet: (x, y, w, h) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#4e3121"/>
    <rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="5" fill="none" stroke="#a37a52" stroke-width="2" stroke-dasharray="6 5"/>
    <rect x="${x + w - 40}" y="${y + h / 2 - 10}" width="32" height="20" rx="4" fill="#3b2418"/>`,
  keys: (x, y, w) => `
    <circle cx="${x + 22}" cy="${y + 22}" r="18" fill="none" stroke="#c9c2b2" stroke-width="5"/>
    <rect x="${x + 34}" y="${y + 16}" width="${w - 40}" height="12" rx="3" fill="#b38f3a"/>
    <rect x="${x + 30}" y="${y + 38}" width="${w - 48}" height="11" rx="3" fill="#c9c2b2" transform="rotate(14 ${x + 30} ${y + 38})"/>
    <circle cx="${x + 40}" cy="${y + 22}" r="9" fill="#b38f3a"/>`,
  glasses: (x, y, w, h) => `
    <circle cx="${x + h / 2 + 8}" cy="${y + h / 2}" r="${h / 2 - 2}" fill="#c7d3d6" fill-opacity="0.5" stroke="#1f1a14" stroke-width="5"/>
    <circle cx="${x + w - h / 2 - 8}" cy="${y + h / 2}" r="${h / 2 - 2}" fill="#c7d3d6" fill-opacity="0.5" stroke="#1f1a14" stroke-width="5"/>
    <path d="M${x + h + 4} ${y + h / 2 - 4} q${(w - 2 * h - 8) / 2} -10 ${w - 2 * h - 8} 0" fill="none" stroke="#1f1a14" stroke-width="5"/>
    <line x1="${x + 2}" y1="${y + h / 2 - 6}" x2="${x + 10}" y2="${y + h / 2 - 2}" stroke="#1f1a14" stroke-width="5"/>
    <line x1="${x + w - 2}" y1="${y + h / 2 - 6}" x2="${x + w - 10}" y2="${y + h / 2 - 2}" stroke="#1f1a14" stroke-width="5"/>`,
  "airpods case": (x, y, w, h) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#f4f1ea"/>
    <line x1="${x + 4}" y1="${y + 16}" x2="${x + w - 4}" y2="${y + 16}" stroke="#cfc8ba" stroke-width="2"/>
    <circle cx="${x + w / 2}" cy="${y + 34}" r="3" fill="#cfc8ba"/>`,
  remote: (x, y, w, h) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1d1c1b"/>
    <circle cx="${x + 20}" cy="${y + h / 2}" r="6" fill="#9c4a2a"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${x + 40 + i * 20}" y="${y + h / 2 - 5}" width="12" height="10" rx="2" fill="#4a4846"/>`).join("")}`,
  watch: (x, y, w, h) => `
    <rect x="${x + w / 2 - 14}" y="${y}" width="28" height="${h}" rx="6" fill="#3d3a35"/>
    <circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 4}" fill="#a8772a"/>
    <circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 10}" fill="#f1e8d6"/>
    <line x1="${x + w / 2}" y1="${y + h / 2}" x2="${x + w / 2}" y2="${y + h / 2 - 16}" stroke="#1f1a14" stroke-width="3"/>`,
};

for (const snap of scenes.snapshots) {
  const items = Object.entries(snap.place)
    .map(([name, [x, y]]) => {
      const { w, h } = scenes.items[name];
      return draw[name](x, y, w, h);
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${room}${items}</svg>\n`;
  writeFileSync(new URL(`public/mock/${snap.id}.svg`, root), svg);
}
console.log(`wrote ${scenes.snapshots.length} snapshots to public/mock/`);
