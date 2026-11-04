# ====================================================================
# app/api/service/report_svc/lab_parts.py
# Drawings for the advanced report that mirror the Carbon Lab: a 3D (isometric) view of the village built from its
# cadastral parcels and LULC land cover, emission-raster maps for each source, and scenario bars (ReportLab only).
# ====================================================================
import math

from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors

from app.api.service.report_svc.pdf_parts import BORDER, GREEN_700, GREEN_900, MUTED, TEXT, Projection, draw_geom, fmt

# Parcel fill per land use (same palette as the 3D view).
USE_COLORS = {
    "builtup": colors.HexColor("#d9c7a5"), "cropland": colors.HexColor("#aed581"), "trees": colors.HexColor("#43a047"),
    "water": colors.HexColor("#4fc3f7"), "rangeland": colors.HexColor("#c0a96e"), "bare": colors.HexColor("#bcaaa4"),
    "land": colors.HexColor("#c5e1a5"),
}
USE_LABELS = {
    "builtup": "Built-up", "cropland": "Cropland", "trees": "Trees", "water": "Water", "rangeland": "Rangeland",
    "bare": "Bare ground", "land": "Land (no LULC)",
}
ROOF = colors.HexColor("#b23a2a")
WALL_LIGHT, WALL_DARK = colors.HexColor("#f3e3c3"), colors.HexColor("#d4bf97")


def _shade(c, k):
    return colors.Color(c.red * k, c.green * k, c.blue * k)


class _Iso:
    """Local metres (x east, y north) to an isometric drawing: north-east up and away, heights straight up."""

    def __init__(self, points, width, height, z_room=0.0, pad=10):
        self.c, self.s = math.cos(math.radians(30)), math.sin(math.radians(30))
        us = [self._u(x, y) for x, y in points]
        vs = [self._v(x, y) for x, y in points]
        span_u, span_v = max(max(us) - min(us), 1), max(max(vs) - min(vs), 1)
        self.k = min((width - 2 * pad) / span_u, (height - 2 * pad - z_room) / span_v)
        self.ox = (width - span_u * self.k) / 2 - min(us) * self.k
        self.oy = pad + (height - 2 * pad - z_room - span_v * self.k) / 2 - min(vs) * self.k

    def _u(self, x, y):
        return (x - y) * self.c

    def _v(self, x, y):
        return (x + y) * self.s

    def xy(self, x, y, z=0.0):
        return self._u(x, y) * self.k + self.ox, (self._v(x, y) + z) * self.k + self.oy

    def depth(self, x, y):
        return x + y  # larger = further away (drawn first)


def village_3d(scene, width, height):
    """Isometric view of the village: khasra parcels coloured by LULC land cover, houses extruded as small blocks
    (two-storey where the scene marks them), trees, the village road and the waste dump."""
    d = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=colors.HexColor("#eef4f8"), strokeColor=BORDER, strokeWidth=0.6))
    outline = scene.get("outline") or [p for parcel in scene["parcels"] for p in parcel["ring"]]
    span = max(scene["extent_m"])
    house_m = max(8.0, span / 120)          # exaggerated so houses stay visible at village scale
    iso = _Iso(outline, width, height, z_room=18)

    # Ground slab edge for depth, then parcels.
    slab = [iso.xy(x, y) for x, y in outline]
    d.add(Polygon([c for x, y in slab for c in (x, y - 5)], fillColor=colors.HexColor("#6d8f45"), strokeColor=None))
    d.add(Polygon([c for p in slab for c in p], fillColor=colors.HexColor("#c5e1a5"), strokeColor=None))
    for parcel in scene["parcels"]:
        pts = [c for x, y in parcel["ring"] for c in iso.xy(x, y)]
        if len(pts) >= 6:
            d.add(Polygon(pts, fillColor=USE_COLORS.get(parcel["use"], USE_COLORS["land"]),
                          strokeColor=colors.Color(0.3, 0.2, 0.15, alpha=0.35), strokeWidth=0.25))

    route = scene.get("route") or []
    if len(route) > 2:
        pts = [iso.xy(x, y) for x, y in route + route[:1]]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            d.add(Line(x0, y0, x1, y1, strokeColor=colors.HexColor("#78909c"), strokeWidth=1.6))

    # Objects back to front.
    objects = []
    houses = scene.get("houses_3d") or [{"pos": (x, y, 0), "stories": 1, "roof": "gable"} for x, y in scene.get("houses", [])]
    for h in houses:
        x, y = h["pos"][0], h["pos"][1]
        objects.append((iso.depth(x, y), "house", x, y, h))
    for x, y in scene.get("trees", []):
        objects.append((iso.depth(x, y), "tree", x, y, None))
    if scene.get("dump"):
        x, y = scene["dump"]
        objects.append((iso.depth(x, y), "dump", x, y, None))
    for _, kind, x, y, h in sorted(objects, key=lambda o: -o[0]):
        if kind == "house":
            _house(d, iso, x, y, house_m, h.get("stories", 1), h.get("roof", "gable"))
        elif kind == "tree":
            bx, by = iso.xy(x, y)
            r = max(2.2, house_m * 0.9 * iso.k)
            d.add(Line(bx, by, bx, by + r, strokeColor=colors.HexColor("#6d4c41"), strokeWidth=1))
            d.add(Circle(bx, by + r * 1.6, r, fillColor=colors.HexColor("#2e7d32"), strokeColor=colors.HexColor("#1b5e20"), strokeWidth=0.4))
        else:
            bx, by = iso.xy(x, y)
            r = max(4, house_m * 2.2 * iso.k)
            d.add(Polygon([bx - r, by, bx + r, by, bx, by + r * 0.8], fillColor=colors.HexColor("#795548"), strokeColor=None))
            d.add(String(bx, by + r + 2, "waste dump", fontName="Helvetica-Oblique", fontSize=6, fillColor=TEXT, textAnchor="middle"))

    # North arrow (north = +y, drawn up-right in this view).
    nx, ny = width - 26, height - 26
    tx, ty = iso.xy(0, 1)
    ox, oy = iso.xy(0, 0)
    ang = math.atan2(ty - oy, tx - ox)
    d.add(Line(nx, ny, nx + 12 * math.cos(ang), ny + 12 * math.sin(ang), strokeColor=colors.HexColor("#c62828"), strokeWidth=1.6))
    d.add(String(nx + 18 * math.cos(ang), ny + 18 * math.sin(ang) - 3, "N", fontName="Helvetica-Bold", fontSize=8,
                 fillColor=TEXT, textAnchor="middle"))
    d.add(String(6, 6, f"Village extent {fmt(scene['extent_m'][0] / 1000, 1)} × {fmt(scene['extent_m'][1] / 1000, 1)} km · "
                       f"house size exaggerated for visibility", fontName="Helvetica", fontSize=6.3, fillColor=MUTED))
    return d


def _house(d, iso, x, y, size, stories, roof):
    h = size * (1.6 if stories > 1 else 0.9)
    s = size / 2
    base = [(x - s, y - s), (x + s, y - s), (x + s, y + s), (x - s, y + s)]
    # Two visible walls (south and west faces), then the roof.
    for (ax, ay), (bx, by), shade in (((x - s, y - s), (x + s, y - s), WALL_LIGHT), ((x - s, y - s), (x - s, y + s), WALL_DARK)):
        pts = [*iso.xy(ax, ay), *iso.xy(bx, by), *iso.xy(bx, by, h), *iso.xy(ax, ay, h)]
        d.add(Polygon(pts, fillColor=shade, strokeColor=colors.Color(0, 0, 0, alpha=0.25), strokeWidth=0.2))
    if roof == "gable":
        ridge = h + size * 0.5
        d.add(Polygon([*iso.xy(x - s, y - s, h), *iso.xy(x + s, y - s, h), *iso.xy(x + s, y, ridge), *iso.xy(x - s, y, ridge)],
                      fillColor=ROOF, strokeColor=None))
        d.add(Polygon([*iso.xy(x - s, y + s, h), *iso.xy(x - s, y - s, h), *iso.xy(x - s, y, ridge)],
                      fillColor=_shade(ROOF, 0.8), strokeColor=None))
    else:
        d.add(Polygon([c for bx, by in base for c in iso.xy(bx, by, h)], fillColor=colors.HexColor("#b0a08a"),
                      strokeColor=colors.Color(0, 0, 0, alpha=0.25), strokeWidth=0.2))


def landcover_legend(width, uses):
    d = Drawing(width, 12)
    x = 0
    for use in uses:
        d.add(Rect(x, 2, 9, 7, fillColor=USE_COLORS[use], strokeColor=None))
        d.add(String(x + 12, 3, USE_LABELS[use], fontName="Helvetica", fontSize=6.8, fillColor=TEXT))
        x += 22 + len(USE_LABELS[use]) * 3.4
    return d


def emission_cell_map(grid, key, boundary, width, height, title):
    """One source's emission raster inside the village (t CO2e/ha/yr cells, legend classes from GeoServer)."""
    d = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=colors.white, strokeColor=BORDER, strokeWidth=0.5))
    w, s, e, n = grid["bounds"]
    view = (w, s, e, n)
    if boundary:
        from app.api.service.report_svc.pdf_parts import bounds
        bx0, by0, bx1, by1 = bounds([boundary])
        view = (min(w, bx0), min(s, by0), max(e, bx1), max(n, by1))
    proj = Projection(view, width, height - 14, pad=4)
    cols, rows = grid["width"], grid["height"]
    legend = grid["legends"][key]
    values = _values(grid, key)
    dx, dy = (e - w) / cols, (n - s) / rows
    for i, v in enumerate(values):
        if not grid["inside"][i] or v <= 0:
            continue
        entry = next((l for l in legend if v < l["quantity"]), legend[-1])
        if entry["opacity"] == 0:
            continue
        r, c = divmod(i, cols)
        x0, y1 = proj.xy(w + c * dx, n - r * dy)
        x1, y0 = proj.xy(w + (c + 1) * dx, n - (r + 1) * dy)
        d.add(Rect(x0, y0, x1 - x0, y1 - y0, fillColor=colors.HexColor(entry["color"]), strokeColor=None))
    if boundary:
        draw_geom(d, proj, boundary, fill=None, stroke=GREEN_900, width=0.9, clip=(0, 0, width, height - 14))
    total = sum(v * grid["cell_ha"][i // cols] for i, v in enumerate(values) if grid["inside"][i])
    d.add(String(4, height - 10, title, fontName="Helvetica-Bold", fontSize=7.2, fillColor=TEXT))
    d.add(String(width - 4, height - 10, f"{fmt(total, 1)} t", fontName="Helvetica", fontSize=7, fillColor=MUTED, textAnchor="end"))
    return d


def _values(grid, key):
    if key != "total":
        return grid["sources"][key]
    sources = list(grid["sources"].values())
    return [sum(vals) for vals in zip(*sources)]


def emission_legend(grid, key, width):
    d = Drawing(width, 14)
    x = 0
    for entry in grid["legends"][key]:
        if entry["opacity"] == 0:
            continue
        label = entry["label"].replace("&lt;", "<").replace("&gt;", ">")
        d.add(Rect(x, 3, 9, 7, fillColor=colors.HexColor(entry["color"]), strokeColor=None))
        d.add(String(x + 11, 4, label, fontName="Helvetica", fontSize=6.3, fillColor=TEXT))
        x += 16 + len(label) * 3.1
    return d


def scenario_bars(rows, baseline, width, height):
    """Horizontal bars of the village total under each scenario, with the survey total as a reference line."""
    d = Drawing(width, height)
    label_w, right = 120, 70
    bar_w = width - label_w - right
    top = max([baseline] + [t for _, t in rows]) or 1
    row_h = (height - 16) / max(len(rows), 1)
    for i, (name, total) in enumerate(rows):
        y = height - 12 - (i + 1) * row_h + row_h * 0.2
        color = GREEN_700 if total < baseline - 1e-6 else colors.HexColor("#c62828") if total > baseline + 1e-6 else colors.HexColor("#90a4ae")
        d.add(String(label_w - 6, y + row_h * 0.25, name, fontName="Helvetica", fontSize=7.2, fillColor=TEXT, textAnchor="end"))
        d.add(Rect(label_w, y, bar_w * total / top, row_h * 0.6, fillColor=color, strokeColor=None))
        change = (total / baseline - 1) * 100 if baseline else 0
        d.add(String(label_w + bar_w * total / top + 4, y + row_h * 0.18,
                     f"{fmt(total, 0)} t ({'+' if change > 0 else ''}{fmt(change, 0)}%)", fontName="Helvetica", fontSize=6.8, fillColor=TEXT))
    bx = label_w + bar_w * baseline / top
    d.add(Line(bx, 4, bx, height - 10, strokeColor=colors.HexColor("#37474f"), strokeWidth=0.8, strokeDashArray=[2, 2]))
    d.add(String(bx, height - 8, "survey total", fontName="Helvetica-Oblique", fontSize=6.3, fillColor=MUTED, textAnchor="middle"))
    return d


def plan_view(scene, width, height):
    """Top-down plan: khasra parcels by land cover and the estimated house positions."""
    d = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=colors.white, strokeColor=BORDER, strokeWidth=0.5))
    pts = [p for parcel in scene["parcels"] for p in parcel["ring"]]
    minx, miny = min(x for x, _ in pts), min(y for _, y in pts)
    maxx, maxy = max(x for x, _ in pts), max(y for _, y in pts)
    k = min((width - 12) / max(maxx - minx, 1), (height - 20) / max(maxy - miny, 1))
    ox = (width - (maxx - minx) * k) / 2 - minx * k
    oy = 6 + (height - 20 - (maxy - miny) * k) / 2 - miny * k
    for parcel in scene["parcels"]:
        ring = [c for x, y in parcel["ring"] for c in (x * k + ox, y * k + oy)]
        if len(ring) >= 6:
            d.add(Polygon(ring, fillColor=USE_COLORS.get(parcel["use"], USE_COLORS["land"]),
                          strokeColor=colors.Color(0.3, 0.2, 0.15, alpha=0.4), strokeWidth=0.2))
    for x, y in scene.get("houses", []):
        d.add(Rect(x * k + ox - 1.1, y * k + oy - 1.1, 2.2, 2.2, fillColor=ROOF, strokeColor=None))
    # 500 m scale bar
    bar = 500 * k
    if bar < width * 0.5:
        d.add(Line(8, 6, 8 + bar, 6, strokeColor=TEXT, strokeWidth=1.2))
        d.add(String(8 + bar / 2, 9, "500 m", fontName="Helvetica", fontSize=6, fillColor=TEXT, textAnchor="middle"))
    d.add(Line(width - 10, height - 22, width - 10, height - 10, strokeColor=colors.HexColor("#c62828"), strokeWidth=1.4))
    d.add(String(width - 18, height - 14, "N", fontName="Helvetica-Bold", fontSize=7, fillColor=TEXT, textAnchor="end"))
    return d
