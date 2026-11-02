# ====================================================================
# app/api/service/report_svc/pdf_parts.py
# Building blocks for the village PDF reports: styles, page header / footer with the project logos,
# the cover banner, KPI tiles, boundary maps drawn from PostGIS GeoJSON, and charts (ReportLab only).
# ====================================================================
import math
from datetime import datetime
from pathlib import Path

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Flowable, Paragraph, Table, TableStyle

ASSETS = Path(__file__).parent / "assets"

GREEN_900 = colors.HexColor("#1b5e20")
GREEN_700 = colors.HexColor("#2e7d32")
GREEN_50 = colors.HexColor("#e8f5e9")
GREEN_25 = colors.HexColor("#f1f8e9")
TEXT = colors.HexColor("#263238")
MUTED = colors.HexColor("#546e7a")
BORDER = colors.HexColor("#cfd8dc")
HIGHLIGHT = colors.HexColor("#d32f2f")

# Same order as SECTOR_COLUMNS in the village CRUD.
SECTOR_COLORS = {
    "LPG Energy": colors.HexColor("#1e88e5"),
    "Firewood Energy": colors.HexColor("#8d6e63"),
    "Electricity Energy": colors.HexColor("#fbc02d"),
    "Transport (Petrol)": colors.HexColor("#8e24aa"),
    "Solid Waste": colors.HexColor("#00897b"),
    "Livestock Enteric": colors.HexColor("#e64a19"),
}
# Per-capita emission classes on the district map (dashboard "reds" scale).
CHOROPLETH = [colors.HexColor(c) for c in ("#fee5d9", "#fcae91", "#fb6a4a", "#de2d26", "#a50f15")]
NO_DATA = colors.HexColor("#eceff1")

# ---------- Text styles ----------

STYLES = {
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=GREEN_900, spaceBefore=10, spaceAfter=5),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=GREEN_700, spaceBefore=7, spaceAfter=3),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12.5, textColor=TEXT, spaceAfter=5),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9, leading=12.5, textColor=TEXT, leftIndent=12,
                             bulletIndent=2, spaceAfter=2),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=7.5, leading=10, textColor=MUTED, spaceAfter=3),
    "caption": ParagraphStyle("caption", fontName="Helvetica-Oblique", fontSize=7.5, leading=10, textColor=MUTED,
                              alignment=TA_CENTER, spaceBefore=2, spaceAfter=6),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8, leading=10, textColor=TEXT),
    "cell_b": ParagraphStyle("cell_b", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=TEXT),
    "callout": ParagraphStyle("callout", fontName="Helvetica", fontSize=9, leading=12.5, textColor=GREEN_900),
}


def P(text, style="body"):
    return Paragraph(text, STYLES[style])


def bullets(items, style="bullet"):
    return [Paragraph(item, STYLES[style], bulletText="•") for item in items]


def fmt(value, decimals=0):
    return f"{(value or 0):,.{decimals}f}"


def data_table(rows, widths, header=True, total_rows=0, align_right_from=None):
    """Grid table; strings are wrapped in paragraphs, the header row and last `total_rows` rows are bold."""
    body = []
    for i, row in enumerate(rows):
        bold = (header and i == 0) or (total_rows and i >= len(rows) - total_rows)
        body.append([c if isinstance(c, Flowable) else Paragraph(str(c), STYLES["cell_b" if bold else "cell"]) for c in row])
    table = Table(body, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), GREEN_50))
    if total_rows:
        style.append(("BACKGROUND", (0, -total_rows), (-1, -1), GREEN_25))
    table.setStyle(TableStyle(style))
    return table


def callout(text, background=GREEN_50, border=GREEN_700):
    table = Table([[Paragraph(text, STYLES["callout"])]], colWidths=["100%"])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("LINEBEFORE", (0, 0), (0, -1), 3, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def kpi_tiles(items, width):
    """Row of KPI tiles: [(label, value, sub)]."""
    value_style = ParagraphStyle("kv", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=GREEN_900)
    label_style = ParagraphStyle("kl", fontName="Helvetica-Bold", fontSize=6.5, leading=8, textColor=MUTED)
    cells = [[Paragraph(label.upper(), label_style), Paragraph(value, value_style), Paragraph(sub, STYLES["small"])]
             for label, value, sub in items]
    table = Table([cells], colWidths=[width / len(items)] * len(items))
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("LINEABOVE", (0, 0), (-1, 0), 2.5, GREEN_700),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


# ---------- Images, page decoration & cover ----------

def image(name):
    return ImageReader(str(ASSETS / name))


class PageDecor:
    """Logos header and footer drawn on every page."""

    def __init__(self, report_label: str, village_label: str):
        self.report_label, self.village_label = report_label, village_label
        self.generated = datetime.now().strftime("%d %b %Y, %H:%M")
        self.seal, self.iit, self.slcr = image("iitbhu_seal.png"), image("iit_logo.png"), image("slcr_logo.png")

    def __call__(self, canvas, doc):
        w, h = doc.pagesize
        left, right = doc.leftMargin, w - doc.rightMargin
        top = h - 18
        canvas.saveState()
        canvas.drawImage(self.seal, left, top - 30, width=30, height=30, mask="auto")
        canvas.drawImage(self.iit, left + 36, top - 26, width=88, height=88 * 147 / 600, mask="auto")
        canvas.drawImage(self.slcr, right - 62, top - 29, width=62, height=62 * 210 / 450, mask="auto")
        canvas.setFillColor(GREEN_900)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawCentredString(w / 2 + 10, top - 12, "VILLAGE ENVIRONMENT & CARBON DASHBOARD")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(w / 2 + 10, top - 22, "Varanasi District, Uttar Pradesh  ·  IIT (BHU) Varanasi  ·  Smart Lab on Clean Rivers")
        canvas.setStrokeColor(GREEN_700)
        canvas.setLineWidth(1.2)
        canvas.line(left, top - 35, right, top - 35)

        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(left, 30, right, 30)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(left, 20, f"{self.report_label}  ·  {self.village_label}")
        canvas.drawCentredString(w / 2, 20, f"Generated {self.generated}")
        canvas.drawRightString(right, 20, f"Page {doc.page}")
        canvas.restoreState()


class Banner(Flowable):
    """Forest photo cover band with the report type, village name and location."""

    def __init__(self, width, eyebrow, title, subtitle, height=150):
        super().__init__()
        self.width, self.height = width, height
        self.eyebrow, self.title, self.subtitle = eyebrow, title, subtitle
        self.photo, self.icon = image("forest_banner.jpg"), image("co2_icon.png")

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c, w, h = self.canv, self.width, self.height
        iw, ih = self.photo.getSize()
        scale = max(w / iw, h / ih)  # cover the band, cropping the photo
        path = c.beginPath()
        path.roundRect(0, 0, w, h, 8)
        c.saveState()
        c.clipPath(path, stroke=0, fill=0)
        c.drawImage(self.photo, (w - iw * scale) / 2, (h - ih * scale) / 2, iw * scale, ih * scale)
        c.setFillColor(colors.Color(0.04, 0.16, 0.06, alpha=0.62))
        c.rect(0, 0, w, h, stroke=0, fill=1)
        c.restoreState()

        c.setFillColor(colors.HexColor("#a5d6a7"))
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(20, h - 30, self.eyebrow.upper())
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(20, h - 60, self.title)
        c.setFont("Helvetica", 9.5)
        for i, line in enumerate(self.subtitle):
            c.drawString(20, h - 82 - i * 13, line)
        c.setFillColor(colors.white)
        c.circle(w - 62, h / 2, 40, stroke=0, fill=1)
        c.drawImage(self.icon, w - 98, h / 2 - 36, 72, 72, mask="auto")


class PhotoStrip(Flowable):
    """Full-width photo cropped to a band, with a caption overlay."""

    def __init__(self, width, name, caption, height=110):
        super().__init__()
        self.width, self.height, self.photo, self.caption = width, height, image(name), caption

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c, w, h = self.canv, self.width, self.height
        iw, ih = self.photo.getSize()
        scale = max(w / iw, h / ih)
        path = c.beginPath()
        path.roundRect(0, 0, w, h, 6)
        c.saveState()
        c.clipPath(path, stroke=0, fill=0)
        c.drawImage(self.photo, (w - iw * scale) / 2, (h - ih * scale) / 2, iw * scale, ih * scale)
        c.setFillColor(colors.Color(0, 0, 0, alpha=0.45))
        c.rect(0, 0, w, 20, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Oblique", 7.5)
        c.drawString(10, 7, self.caption)
        c.restoreState()


# ---------- Maps ----------

def rings(geom):
    """Exterior rings of a GeoJSON Polygon / MultiPolygon."""
    if not geom:
        return []
    polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [poly[0] for poly in polygons if poly]


def bounds(geoms):
    xs, ys = [], []
    for geom in geoms:
        for ring in rings(geom):
            xs += [p[0] for p in ring]
            ys += [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


class Projection:
    """Lon/lat to drawing points (equirectangular, x scaled by cos(latitude)), fitted into a box."""

    def __init__(self, bbox, width, height, pad=8):
        minx, miny, maxx, maxy = bbox
        self.kx = math.cos(math.radians((miny + maxy) / 2))
        span_x, span_y = max((maxx - minx) * self.kx, 1e-9), max(maxy - miny, 1e-9)
        self.scale = min((width - 2 * pad) / span_x, (height - 2 * pad) / span_y)
        self.ox = (width - span_x * self.scale) / 2 - minx * self.kx * self.scale
        self.oy = (height - span_y * self.scale) / 2 - miny * self.scale
        self.bbox = bbox

    def xy(self, lon, lat):
        return lon * self.kx * self.scale + self.ox, lat * self.scale + self.oy

    def km_to_points(self, km):
        return km / 111.32 * self.scale  # 1° of latitude ≈ 111.32 km

    def intersects(self, geom):
        minx, miny, maxx, maxy = bounds([geom])
        bx0, by0, bx1, by1 = self.bbox
        return not (maxx < bx0 or minx > bx1 or maxy < by0 or miny > by1)


def clip_ring(points, box):
    """Sutherland-Hodgman clip of a ring [(x, y)] to box (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    edges = [
        (lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= y0, lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)),
        (lambda p: p[1] <= y1, lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1)),
    ]
    for inside, cross in edges:
        if not points:
            break
        out, prev = [], points[-1]
        for cur in points:
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
            prev = cur
        points = out
    return points


def draw_geom(drawing, proj, geom, fill=None, stroke=None, width=0.5, clip=None):
    """Adds the polygon rings; `clip` (x0, y0, x1, y1) trims them to a drawing-space box."""
    for ring in rings(geom):
        pts = [proj.xy(lon, lat) for lon, lat in ring]
        if clip:
            pts = clip_ring(pts, clip)
        if len(pts) < 3:
            continue
        drawing.add(Polygon([c for p in pts for c in p], fillColor=fill, strokeColor=stroke, strokeWidth=width,
                            strokeLineJoin=1))


def _frame(drawing, width, height):
    drawing.add(Rect(0, 0, width, height, fillColor=colors.HexColor("#fbfdfb"), strokeColor=BORDER, strokeWidth=0.6))


def north_arrow(drawing, x, y):
    drawing.add(Polygon([x, y + 16, x - 5, y, x, y + 4, x + 5, y], fillColor=TEXT, strokeColor=TEXT, strokeWidth=0.5))
    drawing.add(String(x, y + 19, "N", fontName="Helvetica-Bold", fontSize=7, fillColor=TEXT, textAnchor="middle"))


def scale_bar(drawing, proj, x, y, max_width):
    """Scale bar with a round length (km) that fits in max_width points."""
    km = next((k for k in (20, 10, 5, 2, 1, 0.5, 0.2, 0.1) if proj.km_to_points(k) <= max_width), 0.1)
    length = proj.km_to_points(km)
    drawing.add(Rect(x, y, length / 2, 3, fillColor=TEXT, strokeColor=TEXT, strokeWidth=0.4))
    drawing.add(Rect(x + length / 2, y, length / 2, 3, fillColor=colors.white, strokeColor=TEXT, strokeWidth=0.4))
    label = f"{km:g} km" if km >= 1 else f"{km * 1000:g} m"
    drawing.add(String(x, y + 6, "0", fontName="Helvetica", fontSize=6, fillColor=TEXT))
    drawing.add(String(x + length, y + 6, label, fontName="Helvetica", fontSize=6, fillColor=TEXT, textAnchor="middle"))


def location_map(layers, width, height):
    """District with block boundaries and every village; the report village filled and ringed in red."""
    d = Drawing(width, height)
    _frame(d, width, height)
    proj = Projection(bounds([layers["district"]]), width, height - 14, pad=10)
    draw_geom(d, proj, layers["district"], fill=GREEN_25, stroke=None)
    for v in layers["villages"]:
        draw_geom(d, proj, v["geom"], fill=None, stroke=colors.HexColor("#b8c8bc"), width=0.2)
    for b in layers["blocks"]:
        draw_geom(d, proj, b["geom"], fill=None, stroke=GREEN_700, width=0.9)
    draw_geom(d, proj, layers["district"], fill=None, stroke=GREEN_900, width=1.4)
    for b in layers["blocks"]:
        x, y = proj.xy(*b["label"])
        name = b["name"].split(" (")[0]
        d.add(String(x, y, name, fontName="Helvetica-Bold", fontSize=6, fillColor=GREEN_900, textAnchor="middle"))
    village = layers["village"]
    if village:
        draw_geom(d, proj, village["geom"], fill=HIGHLIGHT, stroke=HIGHLIGHT, width=0.6)
        x, y = proj.xy(village["x"], village["y"])
        d.add(Circle(x, y, 9, fillColor=None, strokeColor=HIGHLIGHT, strokeWidth=1.4))
    north_arrow(d, width - 16, height - 34)
    scale_bar(d, proj, 10, 10, width * 0.3)
    _legend(d, width, height, [(HIGHLIGHT, "This village"), (GREEN_700, "Block boundary"),
                               (colors.HexColor("#b8c8bc"), "Other villages")])
    return d


def village_map(layers, width, height, name):
    """Close-up of the village boundary with neighbouring village outlines."""
    d = Drawing(width, height)
    _frame(d, width, height)
    village = layers["village"]
    minx, miny, maxx, maxy = bounds([village["geom"]])
    dx, dy = (maxx - minx) * 0.35, (maxy - miny) * 0.35
    proj = Projection((minx - dx, miny - dy, maxx + dx, maxy + dy), width, height - 14, pad=4)
    box = (0, 0, width, height - 14)
    for v in layers["villages"]:
        if v["code"] != layers.get("village_code") and proj.intersects(v["geom"]):
            draw_geom(d, proj, v["geom"], fill=colors.HexColor("#f5f7f5"), stroke=colors.HexColor("#9fb3a5"),
                      width=0.5, clip=box)
    draw_geom(d, proj, village["geom"], fill=colors.Color(0.18, 0.49, 0.2, alpha=0.35), stroke=GREEN_900, width=1.6, clip=box)
    x, y = proj.xy(village["x"], village["y"])
    d.add(String(x, y - 3, name, fontName="Helvetica-Bold", fontSize=8, fillColor=GREEN_900, textAnchor="middle"))
    north_arrow(d, width - 16, height - 40)
    scale_bar(d, proj, 10, 10, width * 0.35)
    d.add(Rect(0, 0, width, height - 14, fillColor=None, strokeColor=BORDER, strokeWidth=0.6))
    d.add(String(6, height - 10, f"Mapped boundary area: {fmt(village['area_ha'], 1)} ha", fontName="Helvetica",
                 fontSize=6.5, fillColor=MUTED))
    return d


def class_breaks(values, classes=5):
    """Quantile breaks (upper bounds) for the choropleth."""
    values = sorted(v for v in values if v is not None)
    if not values:
        return []
    return [values[min(len(values) - 1, int(len(values) * (i + 1) / classes) - 1)] for i in range(classes)]


def choropleth_map(layers, width, height):
    """Every village coloured by per-capita emission class; the report village outlined."""
    d = Drawing(width, height)
    _frame(d, width, height)
    proj = Projection(bounds([layers["district"]]), width - 110, height, pad=10)
    breaks = class_breaks([v["per_capita"] for v in layers["villages"]])
    for v in layers["villages"]:
        value = v["per_capita"]
        cls = next((i for i, b in enumerate(breaks) if value is not None and value <= b), None)
        draw_geom(d, proj, v["geom"], fill=CHOROPLETH[cls] if cls is not None else NO_DATA,
                  stroke=colors.white, width=0.15)
    for b in layers["blocks"]:
        draw_geom(d, proj, b["geom"], fill=None, stroke=colors.HexColor("#455a64"), width=0.6)
    village = layers["village"]
    if village:
        draw_geom(d, proj, village["geom"], fill=None, stroke=colors.HexColor("#0d47a1"), width=1.6)
        x, y = proj.xy(village["x"], village["y"])
        d.add(Circle(x, y, 9, fillColor=None, strokeColor=colors.HexColor("#0d47a1"), strokeWidth=1.2))
    # Legend
    lx, ly = width - 102, height - 30
    d.add(String(lx, ly + 8, "kg CO2e / person / yr", fontName="Helvetica-Bold", fontSize=6.5, fillColor=TEXT))
    lower = min((v["per_capita"] for v in layers["villages"] if v["per_capita"] is not None), default=0)
    for i, upper in enumerate(breaks):
        y = ly - 6 - i * 13
        d.add(Rect(lx, y, 12, 9, fillColor=CHOROPLETH[i], strokeColor=BORDER, strokeWidth=0.3))
        d.add(String(lx + 16, y + 2, f"{fmt(lower)} – {fmt(upper)}", fontName="Helvetica", fontSize=6.5, fillColor=TEXT))
        lower = upper
    y = ly - 6 - len(breaks) * 13
    d.add(Rect(lx, y, 12, 9, fillColor=None, strokeColor=colors.HexColor("#0d47a1"), strokeWidth=1.4))
    d.add(String(lx + 16, y + 2, "This village", fontName="Helvetica", fontSize=6.5, fillColor=TEXT))
    d.add(String(lx, y - 14, "Classes: equal village counts", fontName="Helvetica-Oblique", fontSize=5.5, fillColor=MUTED))
    d.add(String(lx, y - 21, "(quintiles of 1,334 villages)", fontName="Helvetica-Oblique", fontSize=5.5, fillColor=MUTED))
    north_arrow(d, lx + 6, 30)
    scale_bar(d, proj, 10, 10, width * 0.25)
    return d


def _legend(d, width, height, items):
    x = 8
    for color, label in items:
        d.add(Rect(x, height - 10, 9, 6, fillColor=color, strokeColor=None))
        d.add(String(x + 12, height - 10, label, fontName="Helvetica", fontSize=6.5, fillColor=TEXT))
        x += 16 + len(label) * 3.3


# ---------- Charts ----------

def sector_pie(shares, width, height):
    """Pie of sector emissions [(sector, t)] with a legend on the right."""
    d = Drawing(width, height)
    data = [(s, t) for s, t in shares if t > 0]
    total = sum(t for _, t in data) or 1
    pie = Pie()
    size = min(height - 10, width * 0.45)
    pie.x, pie.y, pie.width, pie.height = 6, (height - size) / 2, size, size
    pie.data = [t for _, t in data] or [1]
    pie.labels = None
    pie.slices.strokeColor = colors.white
    pie.slices.strokeWidth = 1
    for i, (sector, _) in enumerate(data):
        pie.slices[i].fillColor = SECTOR_COLORS.get(sector, MUTED)
    d.add(pie)
    lx = size + 22
    for i, (sector, t) in enumerate(data):
        y = height - 18 - i * 16
        d.add(Rect(lx, y, 10, 10, fillColor=SECTOR_COLORS.get(sector, MUTED), strokeColor=None))
        d.add(String(lx + 15, y + 2, sector, fontName="Helvetica", fontSize=7.5, fillColor=TEXT))
        d.add(String(width - 4, y + 2, f"{t / total * 100:.1f}%", fontName="Helvetica-Bold", fontSize=7.5,
                     fillColor=TEXT, textAnchor="end"))
    return d


def comparison_bars(rows, width, height, series_labels):
    """Grouped horizontal bars: rows = [(category, [value per series])]."""
    d = Drawing(width, height)
    chart = HorizontalBarChart()
    chart.x, chart.y, chart.width, chart.height = 92, 22, width - 110, height - 40
    order = list(reversed(range(len(series_labels))))  # series 0 is drawn lowest in each group
    chart.data = [[r[1][i] for r in reversed(rows)] for i in order]
    chart.categoryAxis.categoryNames = [r[0] for r in reversed(rows)]
    chart.categoryAxis.labels.fontName, chart.categoryAxis.labels.fontSize = "Helvetica", 7
    chart.categoryAxis.labels.dx = -4
    chart.valueAxis.labels.fontName, chart.valueAxis.labels.fontSize = "Helvetica", 6.5
    chart.valueAxis.valueMin = 0
    chart.valueAxis.visibleGrid = True
    chart.valueAxis.gridStrokeColor = colors.HexColor("#eceff1")
    chart.barSpacing, chart.groupSpacing = 1, 6
    palette = [GREEN_900, colors.HexColor("#81c784"), colors.HexColor("#b0bec5")]
    for bar, i in enumerate(order):
        chart.bars[bar].fillColor = palette[i % len(palette)]
        chart.bars[bar].strokeColor = None
    d.add(chart)
    x = 92
    for i, label in enumerate(series_labels):
        d.add(Rect(x, height - 10, 9, 7, fillColor=palette[i % len(palette)], strokeColor=None))
        d.add(String(x + 12, height - 9, label, fontName="Helvetica", fontSize=7, fillColor=TEXT))
        x += 20 + len(label) * 3.6
    d.add(String(width - 4, 4, "kg CO2e per person per year", fontName="Helvetica-Oblique", fontSize=6.5,
                 fillColor=MUTED, textAnchor="end"))
    return d


def land_bar(parts, width, height=26, total=None):
    """Single stacked bar of land use shares [(label, ha, color)]; shares are of `total` (default: sum of parts)."""
    d = Drawing(width, height)
    total = max(total or 0, sum(ha for _, ha, _ in parts)) or 1
    x = 0
    for label, ha, color in parts:
        w = width * ha / total
        if w <= 0:
            continue
        d.add(Rect(x, 10, w, 14, fillColor=color, strokeColor=colors.white, strokeWidth=0.6))
        if w > 34:
            d.add(String(x + w / 2, 14, f"{ha / total * 100:.0f}%", fontName="Helvetica-Bold", fontSize=6.5,
                         fillColor=colors.white, textAnchor="middle"))
        x += w
    lx = 0
    for label, ha, color in parts:
        d.add(Rect(lx, 0, 7, 6, fillColor=color, strokeColor=None))
        d.add(String(lx + 9, 0, label, fontName="Helvetica", fontSize=6.2, fillColor=TEXT))
        lx += 14 + len(label) * 3.1
    return d


def hline(width):
    d = Drawing(width, 6)
    d.add(Line(0, 3, width, 3, strokeColor=BORDER, strokeWidth=0.6))
    return d
