"""Maps a Kokonut component's stock zinc/red palette onto Ctrl-F's brand tokens.

Drops dark: classes (Ctrl-F is light only), turns zinc greys into ink, ink-muted,
rule and panel, red into copper, and removes shadows. Run once per component after
`shadcn add`, then review the diff: layout and behaviour are left alone.
Usage: python3 scripts/restyle-kokonut.py components/kokonutui/<name>.tsx
"""
import re
import sys

MAP = [
    (r"\bdark:[^\s\"'`]+", ""),
    (r"\bshadow-\[[^\]]*\]", ""),
    (r"\bshadow(-(sm|md|lg|xl|2xl))?\b", ""),
    (r"\b(text|bg|stroke|fill|border|ring|from|to|decoration)-zinc-(900|950|800)(/\d+)?", r"\1-ink\3"),
    (r"\b(text|bg|stroke|fill|border|ring|from|to|decoration)-zinc-(700|600|500)(/\d+)?", r"\1-ink-muted\3"),
    (r"\b(text|bg|stroke|fill|border|ring)-zinc-400(/\d+)?", r"\1-ink-muted\2"),
    (r"\b(text|bg|stroke|fill|border|ring)-zinc-(300|200)(/\d+)?", r"\1-rule\3"),
    (r"\b(text|bg|stroke|fill|border|ring)-zinc-(100|50)(/\d+)?", r"\1-panel\3"),
    (r"\b(text|bg|stroke|fill|border|ring)-(red|rose)-\d{2,3}(/\d+)?", r"\1-copper\3"),
    (r"\bring-offset-zinc-\d+", "ring-offset-sheet"),
    (r"\bfont-mono\b", ""),
]

for path in sys.argv[1:]:
    src = open(path).read()
    # Only inside string literals, where class names live; code is never touched
    # (an earlier version deleted a variable named `shadow`).
    def restyle(literal: re.Match) -> str:
        text = literal.group(0)
        for pattern, repl in MAP:
            text = re.sub(pattern, repl, text)
        return text

    out = re.sub(r'"[^"\n]*"|`[^`]*`', restyle, src)
    # Tidy doubled spaces left inside class strings.
    out = re.sub(r'(className=\{?["`][^"`]*)', lambda m: re.sub(r" {2,}", " ", m.group(1)), out)
    open(path, "w").write(out)
    print(f"{path}: {sum(1 for a, b in zip(src.splitlines(), out.splitlines()) if a != b)} lines changed")
