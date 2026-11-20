"""Tools the assistant's LLM can call. Each returns (result for the model, visuals for the chat UI).

Visuals are plain dicts the frontend renders:
  map   - choropleth of village values, optional highlighted / focused villages and an optional GeoServer WMS raster
  chart - bar or donut chart rows
  table - columns + rows
Results for the model are kept short (top rows, rounded numbers): llama3.1:8b runs with a small context window."""
import difflib
import re
from typing import Any

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.chat_svc.knowledge import knowledge_base
from app.api.service.geoserver_svc import factors as raster_factors
from app.api.service.geoserver_svc.emission_rasters import ALLOCATION, EMISSION_WORKSPACE, UNIT as RASTER_UNIT
from app.api.service.geoserver_svc.geoserver import RASTER_WORKSPACE, find_rasters, raster_title
from app.api.service.village_svc import village_svc
from app.conf.settings import settings
from app.database.crud.village.async_crud import Village_crud

# metric key -> (column, label, unit, colour ramp)
METRICS: dict[str, tuple[str, str, str, str]] = {
    "total_emissions": ("total_co2e_t_yr", "Total GHG emissions", "t CO2e/yr", "reds"),
    "per_capita_emissions": ("per_capita_co2e_kg_yr", "Per capita emissions", "kg CO2e/person/yr", "reds"),
    "energy_emissions": ("energy_total_co2e_t_yr", "Energy emissions", "t CO2e/yr", "oranges"),
    "lpg_emissions": ("lpg_co2e_t_yr", "LPG emissions", "t CO2e/yr", "oranges"),
    "firewood_emissions": ("firewood_co2e_t_yr", "Firewood emissions", "t CO2e/yr", "oranges"),
    "electricity_emissions": ("electricity_co2e_t_yr", "Electricity emissions", "t CO2e/yr", "blues"),
    "transport_emissions": ("transport_co2e_t_yr", "Transport emissions", "t CO2e/yr", "purples"),
    "waste_emissions": ("waste_co2e_t_yr", "Solid waste emissions", "t CO2e/yr", "browns"),
    "livestock_emissions": ("livestock_co2e_t_yr", "Livestock emissions", "t CO2e/yr", "browns"),
    "population": ("total_residents", "Population", "residents", "purples"),
    "households": ("total_households", "Households", "households", "purples"),
    "total_area": ("total_area_ha", "Total area", "ha", "greens"),
    "agricultural_area": ("agri_area_ha", "Agricultural area", "ha", "greens"),
    "builtup_area": ("builtup_area_ha", "Built-up area", "ha", "greys"),
    "water_area": ("total_water_area_ha", "Water body area", "ha", "blues"),
    "electricity_use": ("electricity_monthly_kwh", "Electricity use", "kWh/month", "blues"),
    "lpg_use": ("lpg_monthly_kg", "LPG use", "kg/month", "oranges"),
    "firewood_use": ("firewood_monthly_kg", "Firewood use", "kg/month", "oranges"),
    "petrol_use": ("petrol_monthly_litres", "Petrol use", "litres/month", "purples"),
    "motorbikes": ("motorbikes_count", "Motorbikes", "count", "purples"),
    "solid_waste": ("waste_monthly_kg", "Solid waste generated", "kg/month", "browns"),
    "livestock": ("total_livestock", "Livestock", "head", "browns"),
    "cows": ("cows_count", "Cows", "head", "browns"),
}
ALIASES = {
    "emissions": "total_emissions", "emission": "total_emissions", "carbon": "total_emissions", "co2": "total_emissions",
    "total": "total_emissions", "per_capita": "per_capita_emissions", "residents": "population",
    "energy": "energy_emissions", "transport": "transport_emissions", "waste": "waste_emissions",
    "electricity": "electricity_use", "lpg": "lpg_use", "firewood": "firewood_use", "petrol": "petrol_use",
    "agriculture": "agricultural_area", "area": "total_area", "cattle": "cows",
}
SECTORS = [("LPG", "lpg_co2e_t_yr"), ("Firewood", "firewood_co2e_t_yr"), ("Electricity", "electricity_co2e_t_yr"),
           ("Transport", "transport_co2e_t_yr"), ("Waste", "waste_co2e_t_yr"), ("Livestock", "livestock_co2e_t_yr")]
ANIMATION_SOURCES = {name: (f"{name.lower()}_emissions", f"emission_{name.lower()}")
                     for name in ("LPG", "Firewood", "Electricity", "Transport", "Waste", "Livestock", "Total")}
PROFILE_FIELDS = ["total_residents", "total_households", "total_area_ha", "agri_area_ha", "electricity_monthly_kwh",
                  "lpg_monthly_kg", "firewood_monthly_kg", "petrol_monthly_litres", "waste_monthly_kg",
                  "cows_count", "goats_count", "sheep_count", "total_co2e_t_yr", "per_capita_co2e_kg_yr",
                  *[c for _, c in SECTORS]]


def raster_catalog() -> dict[str, dict]:
    """Raster layers the assistant can show: emission rasters plus the curated condition rasters."""
    out = {f"emission_{k}": {"layer": f"{EMISSION_WORKSPACE}:emission_{k}", "workspace": EMISSION_WORKSPACE,
                             "title": f"Emission raster – {title}", "unit": RASTER_UNIT}
           for k, (title, _, _) in ALLOCATION.items()}
    for tif, _ in find_rasters():
        out[tif.stem] = {"layer": f"{RASTER_WORKSPACE}:{tif.stem}", "workspace": RASTER_WORKSPACE,
                         "title": raster_title(tif.stem), "unit": None}
    return out


def _r(v: Any, nd: int = 1):
    return round(float(v), nd) if isinstance(v, (int, float)) else v


def _metric(name: str | None) -> str:
    key = re.sub(r"[^a-z_]", "_", (name or "total_emissions").lower()).strip("_")
    if key in METRICS:
        return key
    if key in ALIASES:
        return ALIASES[key]
    close = difflib.get_close_matches(key, list(METRICS) + list(ALIASES), n=1, cutoff=0.5)
    return ALIASES.get(close[0], close[0]) if close else "total_emissions"


def _as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [s.strip() for s in re.split(r",|\band\b", value) if s.strip()]
    return [str(v).strip() for v in value if str(v).strip()]


class Toolbox:
    """Executes tool calls against the dashboard database for one chat request."""

    def __init__(self, db: AsyncSession, area: tuple[dict, object] | None = None):
        self.db = db
        self._villages: list[dict] | None = None
        # Vector area the user uploaded in the chat: (metadata, WGS84 shapely geometry), see area.py.
        self.area = area

    async def villages(self) -> list[dict]:
        if self._villages is None:
            self._villages = await Village_crud(self.db).get_records()
        return self._villages

    async def _resolve(self, names: list[str]) -> tuple[list[dict], list[str]]:
        """Villages by census code or (fuzzy) name; returns (found, not found)."""
        vs = await self.villages()
        by_code = {v["village_code"]: v for v in vs}
        by_name: dict[str, dict] = {}
        for v in vs:
            by_name.setdefault(v["village_name"].lower(), v)
        found, missing = [], []
        for n in names:
            key = n.lower().removesuffix(" village").strip()
            v = by_code.get(n) or by_name.get(key)
            if v is None:
                close = difflib.get_close_matches(key, list(by_name), n=1, cutoff=0.75)
                v = by_name[close[0]] if close else None
            (found.append(v) if v else missing.append(n))
        return found, missing

    async def _block(self, block: str | None) -> str | None:
        if not block or block.lower() in {"all", "all blocks", "district", "varanasi"}:
            return None
        blocks = sorted({v["block_name"] for v in await self.villages()})
        exact = {b.lower(): b for b in blocks}
        if block.lower() in exact:
            return exact[block.lower()]
        close = difflib.get_close_matches(block.lower(), list(exact), n=1, cutoff=0.6)
        if not close:
            raise ValueError(f"Unknown block '{block}'. Blocks: {', '.join(blocks)}")
        return exact[close[0]]

    def _map(self, metric: str, villages: list[dict], title: str, highlight=(), focus=(), raster=None, area=None) -> dict:
        col, label, unit, ramp = METRICS[metric]
        return {
            "kind": "map", "title": title,
            "metric": {"key": metric, "label": label, "unit": unit, "ramp": ramp},
            "values": {v["village_code"]: _r(v.get(col) or 0, 2) for v in villages},
            "names": {v["village_code"]: v["village_name"] for v in villages},
            "highlight": list(highlight), "focus": list(focus), "raster": raster,
            "area": area,  # GeoJSON outline of an uploaded area, drawn on top
        }

    # ---------- tools ----------

    async def get_village_profile(self, villages=None, **_) -> tuple[dict, list[dict]]:
        found, missing = await self._resolve(_as_list(villages)[:5])
        if not found:
            hint = await self.find_villages(_as_list(villages)[0] if _as_list(villages) else "")
            return {"error": f"No village matched {missing}.", "suggestions": hint[0].get("matches")}, []
        result = {"villages": [{"name": v["village_name"], "code": v["village_code"], "block": v["block_name"],
                                **{k: _r(v.get(k)) for k in PROFILE_FIELDS}} for v in found],
                  "units": "emissions in t CO2e/yr, per capita in kg CO2e/yr, areas in ha, use per month"}
        if missing:
            result["not_found"] = missing
        codes = [v["village_code"] for v in found]
        visuals = [self._map("total_emissions", await self.villages(), "Selected villages – total emissions",
                             highlight=codes, focus=codes)]
        if len(found) == 1:
            v = found[0]
            visuals.append({"kind": "chart", "chart": "donut", "title": f"{v['village_name']} – emissions by source (t CO2e/yr)",
                            "data": [{"name": s, "value": _r(v.get(c) or 0, 2)} for s, c in SECTORS if v.get(c)]})
        else:
            visuals.append({"kind": "chart", "chart": "bar", "title": "Emissions by source (t CO2e/yr)", "category": "name",
                            "series": [{"key": s, "name": s} for s, _ in SECTORS],
                            "data": [{"name": v["village_name"], **{s: _r(v.get(c) or 0, 2) for s, c in SECTORS}} for v in found]})
        visuals.append({"kind": "table", "title": "Village profile",
                        "columns": [{"key": "field", "label": "Indicator"}] +
                                   [{"key": v["village_code"], "label": v["village_name"], "numeric": True} for v in found],
                        "rows": [{"field": k, **{v["village_code"]: _r(v.get(k)) for v in found}} for k in PROFILE_FIELDS]})
        return result, visuals

    async def find_villages(self, name="", block=None, **_) -> tuple[dict, list[dict]]:
        vs = await self.villages()
        blk = await self._block(block)
        pool = [v for v in vs if not blk or v["block_name"] == blk]
        names = {v["village_name"].lower(): v for v in pool}
        q = str(name or "").lower().strip()
        hits = [v for k, v in names.items() if q and q in k] or \
            [names[k] for k in difflib.get_close_matches(q, list(names), n=8, cutoff=0.5)]
        hits = hits[:10]
        return {"matches": [{"name": v["village_name"], "code": v["village_code"], "block": v["block_name"]} for v in hits]}, \
            ([self._map("total_emissions", vs, f"Villages matching “{name}”", highlight=[v["village_code"] for v in hits],
                        focus=[v["village_code"] for v in hits])] if hits else [])

    async def rank_villages(self, metric="total_emissions", order="highest", limit=10, block=None, **_):
        key = _metric(metric)
        col, label, unit, _ramp = METRICS[key]
        blk = await self._block(block)
        pool = [v for v in await self.villages() if (not blk or v["block_name"] == blk) and v.get(col) is not None]
        lowest = str(order).lower().startswith(("low", "asc", "min", "least", "small", "bottom"))
        pool.sort(key=lambda v: float(v[col]), reverse=not lowest)
        n = max(1, min(int(limit or 10), 25))
        top = pool[:n]
        rows = [{"rank": i + 1, "name": v["village_name"], "code": v["village_code"], "block": v["block_name"],
                 "value": _r(v[col], 2)} for i, v in enumerate(top)]
        scope = blk or "Varanasi district"
        title = f"{'Lowest' if lowest else 'Highest'} {n} villages by {label} – {scope}"
        visuals = [
            self._map(key, pool, title, highlight=[v["village_code"] for v in top], focus=[v["village_code"] for v in top]),
            {"kind": "chart", "chart": "bar", "title": f"{title} ({unit})", "category": "name", "horizontal": True,
             "series": [{"key": "value", "name": label}], "data": [{"name": r["name"], "value": r["value"]} for r in rows]},
            {"kind": "table", "title": title, "columns": [
                {"key": "rank", "label": "#", "numeric": True}, {"key": "name", "label": "Village"},
                {"key": "block", "label": "Block"}, {"key": "value", "label": f"{label} ({unit})", "numeric": True}],
             "rows": rows},
        ]
        return {"metric": label, "unit": unit, "scope": scope, "villages_ranked": len(pool), "top": rows[:10]}, visuals

    async def map_metric(self, metric="total_emissions", block=None, **_):
        key = _metric(metric)
        col, label, unit, _ramp = METRICS[key]
        blk = await self._block(block)
        pool = [v for v in await self.villages() if not blk or v["block_name"] == blk]
        vals = sorted((float(v.get(col) or 0), v["village_name"]) for v in pool)
        if not vals:
            return {"error": "No villages in that area"}, []
        total = sum(x for x, _ in vals)
        result = {"metric": label, "unit": unit, "scope": blk or "Varanasi district", "villages": len(vals),
                  "min": _r(vals[0][0]), "max": _r(vals[-1][0]), "mean": _r(total / len(vals)), "sum": _r(total),
                  "highest": [n for _, n in vals[-3:][::-1]], "lowest": [n for _, n in vals[:3]]}
        focus = [v["village_code"] for v in pool] if blk else []
        return result, [self._map(key, pool, f"{label} ({unit}) – {result['scope']}", focus=focus)]

    async def district_overview(self, **_):
        s = await village_svc.get_summary(self.db)
        blocks = s.get("block_emissions") or []
        sectors = s.get("sector_emissions") or []
        totals = {k: v for k, v in s.items() if k not in ("block_emissions", "sector_emissions")}
        result = {"totals": {k: _r(v) for k, v in totals.items()},
                  "blocks": [{"block": b["block_name"], "t_co2e_yr": _r(b["total_co2e_t_yr"])} for b in blocks],
                  "sectors": [{"sector": x["sector"], "t_co2e_yr": _r(x["co2e_t_yr"])} for x in sectors]}
        visuals = [
            self._map("total_emissions", await self.villages(), "Varanasi district – total emissions by village"),
            {"kind": "chart", "chart": "bar", "title": "Emissions by block (t CO2e/yr)", "category": "name",
             "series": [{"key": "value", "name": "t CO2e/yr"}],
             "data": [{"name": b["block"], "value": b["t_co2e_yr"]} for b in result["blocks"]]},
            {"kind": "chart", "chart": "donut", "title": "Emissions by sector (t CO2e/yr)",
             "data": [{"name": x["sector"], "value": x["t_co2e_yr"]} for x in result["sectors"] if x["t_co2e_yr"]]},
        ]
        return result, visuals

    async def show_raster(self, layer="emission_total", village=None, **_):
        catalog = raster_catalog()
        key = str(layer or "emission_total").lower().split(":")[-1].replace(" ", "_")
        if key not in catalog:
            if f"emission_{key}" in catalog:
                key = f"emission_{key}"
            else:
                close = difflib.get_close_matches(key, list(catalog), n=1, cutoff=0.4)
                if not close:
                    return {"error": f"Unknown raster '{layer}'", "available": list(catalog)}, []
                key = close[0]
        info = catalog[key]
        raster = {"name": key, **info}
        result: dict = {"raster": info["title"], "layer": info["layer"], "unit": info["unit"]}
        if not settings.GEOSERVER_URL:
            result["note"] = "GeoServer is not configured; the layer may not draw."
        found = []
        if village:
            found, missing = await self._resolve(_as_list(village)[:1])
            if missing:
                result["not_found"] = missing
        focus = [v["village_code"] for v in found]
        if found:
            v = found[0]
            try:
                stats = await run_in_threadpool(raster_factors.village_stats, info["layer"], v["village_code"])
                result["village"] = v["village_name"]
                result["village_stats"] = {
                    "min": _r(stats["min"], 3), "max": _r(stats["max"], 3), "mean": _r(stats["mean"], 3),
                    "total": _r(stats["total"], 1), "classes": stats["classes"][:6], "covered": stats["covered"]}
                raster["stats"] = result["village_stats"]
            except HTTPException as e:
                result["village_stats_error"] = e.detail
            except Exception as e:  # GeoServer unreachable
                result["village_stats_error"] = str(e)[:200]
        title = info["title"] + (f" – {found[0]['village_name']}" if found else "")
        vis = self._map("total_emissions", await self.villages(), title, highlight=focus, focus=focus, raster=raster)
        vis["values"] = {}  # draw the raster with outlines only, no choropleth underneath
        return result, [vis]

    async def analyze_area(self, metric="total_emissions", raster=None, **_):
        """Clips the village data (and optionally a raster) to the uploaded vector area; thematic map of the villages."""
        from app.api.service.chat_svc import area as areas  # area imports geopandas; only load it when used

        if not self.area:
            return {"error": "No area uploaded. Ask the user to attach a vector file (GeoJSON, KML/KMZ, zipped "
                             "shapefile or GeoPackage) with the paperclip button."}, []
        meta, geom = self.area
        key = _metric(metric)
        col, label, unit, _ramp = METRICS[key]
        shares = await run_in_threadpool(areas.village_shares, geom)
        by_code = {v["village_code"]: v for v in await self.villages()}
        inside = [(by_code[c], s) for c, s in shares.items() if c in by_code]
        outline = areas.outline_geojson(geom)
        result: dict = {"area": meta["name"], "area_ha": meta["area_ha"], "features": meta["features"],
                        "share_inside_district_pct": meta["inside_district_pct"], "villages_overlapping": len(inside),
                        "villages_fully_inside": sum(1 for _, s in inside if s >= 0.95)}
        if meta.get("buffered_m"):
            result["note"] = f"Points/lines in the file were buffered by {meta['buffered_m']} m to make an area."

        if inside:
            # Village totals scaled by the share of the village inside the area (assumes an even spread).
            def est(column):
                return sum(float(v.get(column) or 0) * s for v, s in inside)
            pop, total = est("total_residents"), est("total_co2e_t_yr")
            result["estimated_inside"] = {
                "population": round(pop), "households": round(est("total_households")),
                "total_co2e_t_yr": _r(total), "per_capita_co2e_kg_yr": _r(total * 1000 / pop) if pop else None,
                "by_source_t_co2e_yr": {name: _r(est(c)) for name, c in SECTORS},
                "livestock_head": round(est("total_livestock")), "agri_area_ha": _r(est("agri_area_ha")),
            }
            ranked = sorted(inside, key=lambda vs: -float(vs[0].get(col) or 0))
            result[f"villages_by_{key}"] = [{"name": v["village_name"], "block": v["block_name"],
                                            "share_inside_pct": round(100 * s), "value": _r(v.get(col), 2)}
                                           for v, s in ranked[:10]]
            # Highest villages INSIDE the area for the main indicators, so one call answers "which village in my area…".
            result["highest_in_area"] = {
                f"{METRICS[m][1]} ({METRICS[m][2]})": [
                    f"{v['village_name']} {_r(v.get(METRICS[m][0]), 1)}"
                    for v, _ in sorted(inside, key=lambda vs, c=METRICS[m][0]: -float(vs[0].get(c) or 0))[:3]]
                for m in ("total_emissions", "per_capita_emissions", "energy_emissions", "transport_emissions",
                          "waste_emissions", "livestock_emissions", "population") if m != key}

        raster_vis = None
        if raster:
            catalog = raster_catalog()
            rkey = str(raster).lower().split(":")[-1]
            rkey = rkey if rkey in catalog else f"emission_{rkey}" if f"emission_{rkey}" in catalog else \
                (difflib.get_close_matches(rkey, list(catalog), n=1, cutoff=0.4) or [None])[0]
            if rkey:
                info = catalog[rkey]
                raster_vis = {"name": rkey, **info, "clip": areas.clip_wkt(geom)}
                try:
                    st = await run_in_threadpool(raster_factors.geometry_stats, info["layer"], geom)
                    u = info["unit"] or "raster value"
                    result["clipped_raster"] = {
                        "layer": info["title"], "covered": st["covered"],
                        f"mean_inside ({u})": _r(st["mean"], 3), f"max_inside ({u})": _r(st["max"], 3),
                        **({"raster_total_inside_area (t CO2e/yr)": _r(st["total"], 1)} if st["total"] is not None else {}),
                        "legend_class_share_pct": {c["label"]: c["share_pct"] for c in st["classes"][:6]},
                    }
                    raster_vis["stats"] = {"min": st["min"], "max": st["max"], "mean": st["mean"], "total": st["total"],
                                           "covered": st["covered"], "classes": st["classes"][:6]}
                except HTTPException as e:
                    result["raster_error"] = e.detail
                except Exception as e:  # GeoServer unreachable
                    result["raster_error"] = str(e)[:200]
            else:
                result["raster_error"] = f"Unknown raster '{raster}'"

        codes = [v["village_code"] for v, _ in inside]
        title = f"{label} ({unit}) – villages in {meta['name']}" + (f" + {raster_vis['title']}" if raster_vis else "")
        vis = self._map(key, [v for v, _ in inside], title, focus=codes, raster=raster_vis, area=outline)
        visuals = [vis]
        if inside and result["estimated_inside"]["total_co2e_t_yr"]:
            visuals.append({"kind": "chart", "chart": "donut", "title": f"Estimated emissions inside {meta['name']} (t CO2e/yr)",
                            "data": [{"name": n, "value": v} for n, v in result["estimated_inside"]["by_source_t_co2e_yr"].items() if v]})
            visuals.append({"kind": "table", "title": f"Villages overlapping {meta['name']}", "columns": [
                {"key": "name", "label": "Village"}, {"key": "block", "label": "Block"},
                {"key": "share", "label": "% inside", "numeric": True}, {"key": "value", "label": f"{label} ({unit})", "numeric": True}],
                "rows": [{"name": v["village_name"], "block": v["block_name"], "share": round(100 * s),
                          "value": _r(v.get(col), 2)} for v, s in sorted(inside, key=lambda vs: -vs[1])]})
        return result, visuals

    async def make_animation(self, kind="emission_rasters", **_):
        """Video (animated GIF, + MP4 when available) cycling through the emission sources, for the district or the
        uploaded area: one frame per source raster, or one thematic map per sector."""
        from app.api.service.chat_svc import media

        catalog = raster_catalog()
        area_outline, clip, focus, pool = None, None, [], await self.villages()
        scope = "Varanasi district"
        if self.area:
            from app.api.service.chat_svc import area as areas
            meta, geom = self.area
            shares = await run_in_threadpool(areas.village_shares, geom)
            focus = [c for c in shares]
            pool = [v for v in pool if v["village_code"] in shares]
            area_outline, clip, scope = areas.outline_geojson(geom), areas.clip_wkt(geom), meta["name"]
        thematic = "thematic" in str(kind).lower() or "sector" in str(kind).lower()
        frames = []
        # source name -> (metric key for the thematic map, emission raster name)
        for name, (metric_key, rkey) in ANIMATION_SOURCES.items():
            if thematic:
                v = self._map(metric_key, pool, "", focus=focus, area=area_outline)
            elif rkey in catalog:
                v = {"kind": "map", "values": {}, "highlight": [], "focus": focus, "area": area_outline,
                     "raster": {"name": rkey, **catalog[rkey], "clip": clip}}
            else:
                continue
            frames.append((v, f"{name} emissions – {scope}" + ("" if thematic else " (t CO2e/ha/yr)")))
        out = await run_in_threadpool(media.animate, frames)
        title = f"Emissions by source – {scope}"
        # No URLs for the model: it would turn them into made-up links; the chat shows the player and download links.
        return ({"video_created": True, "format": "MP4 + animated GIF" if out["mp4"] else "animated GIF",
                 "frames": out["frames"], "frame_order": list(ANIMATION_SOURCES), "scope": scope,
                 "note": "The video is already shown in the chat with Open / Download links. Do not write any URL or "
                         "markdown link; just describe what the video shows."},
                [{"kind": "media", "media": "video", "title": title, "url": out["mp4"] or out["gif"],
                  "gif": out["gif"], "mp4": out["mp4"]}])

    async def search_knowledge(self, query="", **_):
        hits = await knowledge_base.search(self.db, str(query), k=4)
        return {"passages": [{"title": h["title"], "text": h["text"], "source": h["source"]} for h in hits]
                or "No matching passages."}, []

    async def run(self, name: str, args: dict) -> tuple[dict, list[dict]]:
        fn = getattr(self, name, None) if name in TOOL_NAMES else None
        if fn is None:
            return {"error": f"Unknown tool {name}. Available: {', '.join(TOOL_NAMES)}"}, []
        # Small models fill optional arguments with placeholders ("null", "none", "") instead of leaving them out.
        args = {k: v for k, v in (args or {}).items()
                if v is not None and not (isinstance(v, str) and v.strip().lower() in {"", "null", "none", "n/a", "all"})}
        # Named villages passed to a district-wide tool (e.g. rank_villages to "compare A and B") mean a comparison.
        if name in ("rank_villages", "map_metric", "district_overview") and (args.get("villages") or args.get("village")):
            fn = self.get_village_profile
            args = {"villages": args.get("villages") or args.get("village")}
        try:
            return await fn(**args)
        except ValueError as e:
            return {"error": str(e)}, []


METRIC_ENUM = sorted(METRICS)


def tool_specs(has_area: bool = False) -> list[dict]:
    rasters = raster_catalog()

    def spec(name, description, props=None, required=()):
        return {"type": "function", "function": {"name": name, "description": description, "parameters": {
            "type": "object", "properties": props or {}, "required": list(required)}}}

    block = {"type": "string", "description": "Optional block name to limit to, e.g. 'Pindra'. Omit for the whole district."}
    metric = {"type": "string", "enum": METRIC_ENUM, "description": "Indicator to use."}
    return [
        spec("get_village_profile",
             "Full data (population, land, energy, waste, livestock, emissions by source) for one to five villages, "
             "shown on the map. Use for questions about specific villages or comparing villages.",
             {"villages": {"type": "array", "items": {"type": "string"}, "description": "Village names or census codes"}},
             ["villages"]),
        spec("find_villages", "Search village names (spelling help) and show them on the map.",
             {"name": {"type": "string", "description": "Full or partial village name"}, "block": block}, ["name"]),
        spec("rank_villages",
             "Top or bottom villages by an indicator, highlighted on a map with a chart. Use for 'which village has the "
             "most/least ...', 'top 10 ...'.",
             {"metric": metric, "order": {"type": "string", "enum": ["highest", "lowest"]},
              "limit": {"type": "integer", "description": "How many villages (default 10, max 25)"}, "block": block},
             ["metric"]),
        spec("map_metric",
             "Colour every village on the map by an indicator (choropleth) and return min/max/mean. Use for 'show/map ...'.",
             {"metric": metric, "block": block}, ["metric"]),
        spec("district_overview",
             "Varanasi district totals: villages, population, total and per capita emissions, emissions by block and by sector."),
        spec("show_raster",
             "Display a GeoServer raster layer on the map (emission density rasters in t CO2e/ha/yr, land use LULC, "
             "population, groundwater suitability ...). If a village is given, zoom to it and return the raster statistics "
             "inside its boundary.",
             {"layer": {"type": "string", "enum": list(rasters),
                        "description": "; ".join(f"{k}: {v['title']}" for k, v in rasters.items())},
              "village": {"type": "string", "description": "Optional village name or code"}},
             ["layer"]),
        spec("search_knowledge",
             "Search the methodology, emission factors, formulas, data sources, mitigation options and project blog. "
             "Use for 'how is ... calculated', 'what is the emission factor of ...', 'how to reduce ...'.",
             {"query": {"type": "string"}}, ["query"]),
        spec("make_animation",
             "Make a video / animation (saved as a file with a download link) that cycles through the emission sources: "
             "kind 'emission_rasters' (one emission density raster per source) or 'thematic_sectors' (villages coloured "
             "by each sector's emissions). Uses the uploaded area if there is one, else the whole district.",
             {"kind": {"type": "string", "enum": ["emission_rasters", "thematic_sectors"]}}),
    ] + ([
        spec("analyze_area",
             "Clip the dashboard data to the vector area the user uploaded: overlapping villages, estimated population "
             "and emissions inside it, a thematic map of those villages coloured by an indicator, and optionally a raster "
             "clipped to the area with its statistics (raster total inside the area). Use for any question about the "
             "uploaded area / 'my area' / 'this boundary' / 'inside' / 'clip'.",
             {"metric": {**metric, "description": "Indicator for the thematic map (default total_emissions)"},
              "raster": {"type": "string", "enum": list(rasters),
                         "description": "Optional raster to clip to the area and summarise"}}),
    ] if has_area else [])


TOOL_NAMES = ["get_village_profile", "find_villages", "rank_villages", "map_metric", "district_overview",
              "show_raster", "search_knowledge", "analyze_area", "make_animation"]
