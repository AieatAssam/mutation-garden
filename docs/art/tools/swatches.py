"""Render palette.png from palette.json. Run: python3 docs/art/tools/swatches.py"""
import json, pathlib
from PIL import Image, ImageDraw, ImageFont
HERE = pathlib.Path(__file__).parent.parent
P = json.loads((HERE / "palette.json").read_text())
FD = "/usr/share/fonts/truetype/sand-box/google"
def font(path, size, var=None):
    f = ImageFont.truetype(path, size)
    if var:
        try: f.set_variation_by_axes(var)
        except Exception as ex: print("axis warn", ex)
    return f
FR = f"{FD}/Fraunces/Fraunces-VariableFont_SOFT,WONK,opsz,wght.ttf"
H1 = font(FR, 54, [144, 800, 100, 1]); H2 = font(FR, 26, [48, 650, 100, 1])
SM = font(f"{FD}/Atkinson Hyperlegible/AtkinsonHyperlegible-Regular.ttf", 15)
INK, PAPER = P["ink"]["press-ink"], P["ink"]["paper-cream"]
def lum(h):
    h = h.lstrip("#"); return sum(w * int(h[i:i+2], 16) for w, i in ((.299, 0), (.587, 2), (.114, 4))) / 255
rows = []  # (group title, [(label, hex)])
e = P["environment"]
rows.append(("Ink & paper", list(P["ink"].items())))
rows.append(("Sky: day / dusk", [(f"day {k}", v) for k, v in e["sky-day"].items()] + [(f"dusk {k}", v) for k, v in e["sky-dusk"].items()]))
for k in ("grass", "soil", "island-rock", "water"):
    rows.append((k.replace("-", " ").title(), [(f"{k} {i+1}", v) for i, v in enumerate(e[k])]))
for plant, d in P["plants"].items():
    for part in ("leaf", "stem", "fruit"):
        rows.append((f"{plant.replace('-', ' ').title()}: {part}", [(f"{part} {i+1}", v) for i, v in enumerate(d[part])]))
m = P["mutations"]
rows.append(("Golden", list(m["golden"].items())))
rows.append(("Glowing", list(m["glowing"].items())))
rows.append(("Crystal", list(m["crystal"].items())))
rows.append(("Rainbow", [(f"band {i+1}", v) for i, v in enumerate(m["rainbow"])]))
u = P["ui"]
rows.append(("UI surfaces & text", [(k, u[k]) for k in ("background", "panel", "panel-sunk", "text", "text-muted", "accent", "accent-pressed")]))
rows.append(("UI states & coin", [(k, u[k]) for k in ("success", "warning", "danger", "focus-ring", "coin-text")] + [(f"coin {k}", v) for k, v in u["coin"].items() if k != "outline"]))
SW, SH, GAP, LBL, X0 = 112, 64, 10, 250, 40
W = X0 + LBL + 9 * (SW + GAP) + 30
H = 150 + len(rows) * (SH + 36) + 30
im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
d.text((X0, 34), "Mutation Garden — Seed Packet palette", font=H1, fill=INK)
d.text((X0, 100), "v0.1 · source of truth: docs/art/palette.json · ramps run light to dark", font=SM, fill=P["ink"]["faded-ink"])
y = 150
for title, items in rows:
    d.text((X0, y + 18), title, font=H2, fill=INK)
    x = X0 + LBL
    for label, hx in items:
        # misprint offset shadow, then swatch with ink outline
        d.rounded_rectangle((x + 4, y + 4, x + SW + 4, y + SH + 4), 14, fill=P["ink"]["misprint-tomato"])
        d.rounded_rectangle((x, y, x + SW, y + SH), 14, fill=hx, outline=INK, width=3)
        tc = INK if lum(hx) > .55 else P["ink"]["paper-white"]
        d.text((x + 10, y + SH - 24), hx.upper(), font=SM, fill=tc)
        d.text((x + 2, y + SH + 8), label[:16], font=SM, fill=P["ink"]["faded-ink"])
        x += SW + GAP
    y += SH + 36
im.save(HERE / "palette.png", optimize=True); print(im.size)
