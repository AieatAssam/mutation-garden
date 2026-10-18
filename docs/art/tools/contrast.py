"""WCAG 2.x contrast checks for the UI text pairs in palette.json.
Run: python3 docs/art/tools/contrast.py  (exits 1 if any pair fails its target)"""
import json, sys, pathlib
P = json.loads((pathlib.Path(__file__).parent.parent / "palette.json").read_text())
def lum(h):
    h = h.lstrip("#"); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
u = P["ui"]
# (label, fg, bg, target) - 4.5 body text, 3.0 large text (>=24px or >=19px bold) and UI graphics
pairs = [
 ("text on background", u["text"], u["background"], 4.5),
 ("text on panel", u["text"], u["panel"], 4.5),
 ("text on panel-sunk", u["text"], u["panel-sunk"], 4.5),
 ("muted text on background", u["text-muted"], u["background"], 4.5),
 ("muted text on panel", u["text-muted"], u["panel"], 4.5),
 ("button label on accent", u["text-on-accent"], u["accent"], 4.5),
 ("button label on accent-pressed", u["text-on-accent"], u["accent-pressed"], 4.5),
 ("accent text on panel", u["accent"], u["panel"], 4.5),
 ("coin amount text on panel", u["coin-text"], u["panel"], 4.5),
 ("success text on panel", u["success"], u["panel"], 4.5),
 ("warning text on panel", u["warning"], u["panel"], 4.5),
 ("danger text on panel", u["danger"], u["panel"], 4.5),
 ("ink text on coin face (large numerals)", u["coin"]["outline"], u["coin"]["face"], 4.5),
 ("border vs background (UI graphic)", u["border"], u["background"], 3.0),
 ("focus ring vs panel (UI graphic)", u["focus-ring"], u["panel"], 3.0),
 ("ink on sky horizon (in-world labels)", u["text"], P["environment"]["sky-day"]["horizon"], 4.5),
 ("ink on sky zenith (in-world labels)", u["text"], P["environment"]["sky-day"]["zenith"], 4.5),
]
fail = 0; rows = []
for label, fg, bg, t in pairs:
    r = ratio(fg, bg); ok = r >= t; fail += not ok
    rows.append(f"| {label} | `{fg}` | `{bg}` | {r:.2f}:1 | {t}:1 | {'pass' if ok else 'FAIL'} |")
print("| Pair | Foreground | Background | Ratio | Target | Result |\n|---|---|---|---|---|---|"); print("\n".join(rows))
sys.exit(1 if fail else 0)
