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

    def __init__(self, db: AsyncSession):
        self.db = db
        self._villages: list[dict] | None = None

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

    def _map(self, metric: str, villages: list[dict], title: str, highlight=(), focus=(), raster=None) -> dict:
        col, label, unit, ramp = METRICS[metric]
        return {
            "kind": "map", "title": title,
            "metric": {"key": metric, "label": label, "unit": unit, "ramp": ramp},
            "values": {v["village_code"]: _r(v.get(col) or 0, 2) for v in villages},
            "names": {v["village_code"]: v["village_name"] for v in villages},
            "highlight": list(highlight), "focus": list(focus), "raster": raster,
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
        try:
            return await fn(**args)
        except ValueError as e:
            return {"error": str(e)}, []


METRIC_ENUM = sorted(METRICS)


def tool_specs() -> list[dict]:
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
    ]


TOOL_NAMES = ["get_village_profile", "find_villages", "rank_villages", "map_metric", "district_overview",
              "show_raster", "search_knowledge"]
