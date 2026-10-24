# Ctrl-F web design record

How the UI was art-directed, and the checks it passed. The plan and decisions behind it are in
`openspec/changes/web-ui/design.md` (Decisions 13, 15, 16).

## Direction (TasteSkill app run)

- **Style dealt:** `editorial-greeting` (light), seed `1781554301`, kind `workspace`, screens home, list, detail,
  drawn with `--keep palette,type`. Chosen over `achromatic-ledger`, which bans brand colour in the chrome and so
  conflicts with the brass primary action. Its move: the greeting is the h1 in a centred 1100px column; figures at
  regular weight on tonal panels.
- **Shell:** tinted frame, lighter sheet: a 228px sidebar on the paper ground; the page on a sheet inset 8px with a
  1px edge and no shadow. Phone: a 48px bar with the mark, the name and a menu.
- **Face:** the greeting names today's one fact from the data ("The wallet was the last thing seen, 12 min ago on the
  desk"), and the ground is the product's own material: aged paper.
- **Brand (fixed):** paper `#f1e8d6`, sheet `#fbf7ef`, panel `#f3ecdf`, ink `#1f1a14`, muted `#5f5444`, brass
  `#a8772a` (marks and the one primary action, never small text), brass-ink `#7a5418`, copper `#9c4a2a` (failure only).
  Square corners everywhere.
- **Type:** Playfair (variable, optical size) for the greeting and titles; Source Serif 4 (variable, optical size,
  tabular figures) for everything else. Two families.

## Each screen's one question

| Screen | Question | Biggest thing |
| --- | --- | --- |
| Ask (`/`) | Where is it right now? | The talk control and, once answered, the photo with the lens |
| Items (`/items`) | What's missing, and where was it last? | The list, newest sighting first, beside the latest photo |
| History (`/history`) | What was seen lately, and what goes missing most? | Two lists: recently seen, lost most often |
| Item history (`/items/[id]`) | Where has this been? | The chosen sighting, large |

## Theme devices allowed (and why)

Steampunk is the brand, so these break TasteSkill's no-ornament rule on purpose, each because it carries meaning:

- **The lens:** a brass ring with a paper outline around the matched item; it is the answer. Drawn by anime.js.
- **Gauges:** each device's freshness, and detection confidence. The words always say it too.
- **The cog train:** seven cogs in brass, dark brass, copper and iron that hop, turn and swell in a wave
  (anime.js `waapi.animate` with `stagger(75)`), shown only while a question is being worked on; still under
  reduced motion (`components/ctrlf/cog-train.tsx`).
- **The flow-field background:** brass streams behind the frame, added at the team's request for a stronger
  steampunk feel. This one is decoration, not information; it stays behind opaque panels so it never sits under text.

## The narrator

A steampunk detective (deerstalker, brass goggles, pipe) is the face of the ElevenLabs voice that reads every
answer. He stands, large (340px), flush in the bottom-right corner of the Ask page sheet, facing the panel; a spacer in his column keeps content out of that corner,, in the page flow so he never covers content
(`components/ctrlf/narrator.tsx`, image `public/narrator.png`). The right column runs to the bottom of the page; before a question it holds only him;
after an answer the telegram slip prints above him. He nods while a reply's audio plays and his caption reads
"Speaking…". On phones he sits under the Ask panel, on the right. Still under reduced motion.

## Kokonut components in use

`ai-voice` (hold-to-talk), `ai-loading` (job stages), `receipt-printer` (telegram outcome slip),
`synced-transcript` (spoken-word highlight, driven by real audio), `split-flap-text` (last seen),
`contact-sheet` (history film strips with loupe), `flow-field` (background). `uptime-card`'s header pattern is used
for the status area; the component itself was removed. Palette mapping: `scripts/restyle-kokonut.py`.

## Checks

`lint.mjs --app web/app web/components`: **0 FAIL**, 4 WARN. The gradient hits are CSS masks and hard-stop
patterns, marked `taste-skill-ignore`; the warnings are clock padding (fine for times) and `font-mono`, which maps to
the serif.

`inspect.mjs --app` at 1440, 768 and 390:

| Screen | FAIL | WARN (defended) |
| --- | --- | --- |
| Ask | 0 | `palette-cream`: the paper ground is the fixed brand. `app-title-size` 48px: the dealt style's greeting is 48/700 serif. |
| Items | 0 | `palette-cream` (as above) |
| Item history | 0 | `palette-cream` (as above) |

### Critique round 1 (what the screenshots showed, and what changed)

1. Items rows left half the width empty (the inspector's 30% void). Fixed: the list takes 7 columns and the latest
   camera photo, with every item in it marked and named, takes the other 5.
2. The brass lens disappeared against the brown wallet. Fixed: a paper outline under the brass ring.
3. Split-flap tiles were cramped at 15px. Fixed: 19px tiles, a little wider.
4. Item and history titles were set like a landing page (48px). Fixed: 32px; only the Ask greeting stays at 48px.
5. The slip's dashed rule ran past the paper on phones (the one FAIL). Fixed: a dash line that fits the slip.
6. The empty slip printer offered "Print answer" with nothing to print, and filled a phone screen. Fixed: an empty
   note instead of the button, and no printer on phones until there is an answer.

Still short: the mock snapshots are drawn SVG scenes, not camera photos; replace them with real Pi captures for demos.

## Bundle

Ask screen, production build, before the flow-field background: 11 scripts, 644 KB uncompressed, about 241 KB gzip
(Next.js, React, motion, anime.js, lucide).
