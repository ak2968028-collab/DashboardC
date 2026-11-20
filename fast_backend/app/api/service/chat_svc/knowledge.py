"""Knowledge base for the AI assistant (the retrieval half of the RAG system).

Chunks come from the carbon methodology written below, the emission factor table, the emission-raster allocation
rules, the GeoServer layer descriptions and the published blog posts. Retrieval is BM25 keyword search; when
OLLAMA_EMBED_MODEL is set, the chunks are also embedded with Ollama and the two rankings are fused."""
import hashlib
import math
import re
import time
from collections import Counter
from dataclasses import dataclass, field

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.geoserver_svc import factors as raster_factors
from app.api.service.geoserver_svc.emission_rasters import ALLOCATION, EMISSION_WORKSPACE, UNIT as RASTER_UNIT
from app.conf.logging.applog import logger
from app.conf.settings import settings
from app.database.models import EmissionFactor
from app.database.models.blog import BlogPost

REFRESH_SECONDS = 300
CHUNK_WORDS = 160

METHODOLOGY = [
    ("Carbon model overview",
     "The dashboard estimates village greenhouse gas (GHG) emissions with an IPCC 2006 Tier-1 activity x emission "
     "factor model. Activity data comes from the village baseline survey (Census 2011 villages of Varanasi district, "
     "Uttar Pradesh). Emissions are reported in tonnes CO2-equivalent per year (t CO2e/yr) and per capita in "
     "kg CO2e per person per year. Sectors: household energy (LPG, firewood, grid electricity), transport "
     "(motorbike petrol), solid waste and livestock (enteric fermentation and manure)."),
    ("Energy emissions formula",
     "Energy emissions = LPG + firewood + electricity. LPG t CO2e/yr = LPG kg/month x 12 x 2.984 / 1000. "
     "Firewood t CO2e/yr = firewood kg/month x 12 x 1.747 / 1000. Electricity t CO2e/yr = kWh/month x 12 x 0.820 / 1000, "
     "using the CEA CO2 Baseline Database v20 grid factor for India. Firewood burnt in chulhas is often the largest "
     "household energy source in rural villages; switching to LPG, biogas or electric cooking lowers emissions."),
    ("Transport emissions formula",
     "Transport t CO2e/yr = petrol litres/month x 12 x 2.310 kg CO2e/litre / 1000 (IPCC 2006 mobile combustion). "
     "The survey records the number of motorbikes and the monthly petrol use of the village."),
    ("Waste emissions formula",
     "Solid waste t CO2e/yr = waste kg/month x 12 x 0.450 kg CO2e/kg / 1000. The factor is a simplified rural "
     "default of the IPCC First Order Decay method; methane (CH4) is converted with a GWP of 28."),
    ("Livestock emissions formula",
     "Livestock t CO2e/yr = (cows x 980 + goats x 145.6 + sheep x 145.6) kg CO2e/head/yr / 1000. The factors cover "
     "enteric fermentation and manure methane for Indian cattle, goats and sheep (IPCC 2006 Vol 4 AFOLU, GWP 28). "
     "Cattle are usually the largest livestock source."),
    ("Total and per capita emissions",
     "Total emissions = energy + transport + waste + livestock (t CO2e/yr). Per capita emissions = total x 1000 / "
     "residents, in kg CO2e per person per year. India's average per capita emission is roughly 1.9 t CO2e/yr; "
     "rural village household inventories are usually much lower."),
    ("Emission rasters",
     "Carbon emission rasters spread each village's yearly emissions over ~90 m cells inside its boundary, weighted by "
     "the LULC (land use / land cover) raster, so a village's cells add back up to its inventory total. Values are "
     f"densities in {RASTER_UNIT}. Rasters exist for the total and for each source; they are published on GeoServer "
     "and rebuilt every time emissions are recomputed."),
    ("Mitigation options",
     "Typical village mitigation measures: rooftop solar and solar pumps (cut grid electricity emissions), biogas "
     "plants from cattle dung (replace firewood and LPG and reduce manure methane), improved cookstoves, electric "
     "two-wheelers, composting and segregation of solid waste, better cattle feed to reduce enteric methane, and tree "
     "planting on culturable waste and fallow land. The Carbon Lab 3D page simulates such scenarios."),
    ("Dashboard pages",
     "Overview: district KPIs. Village Map: GIS map with village polygons and raster overlays. Sectors: demography, "
     "land and water, energy, transport, waste and livestock data per village. Carbon Emission: IPCC sector breakdown. "
     "Carbon Lab 3D: 3D village model and net-zero scenarios. Village Comparison and Village Ranking: benchmarking. "
     "Basic Report (free PDF) and Advanced Report (login) for Pradhans. Settings / Methodology: emission factors."),
    ("Data sources",
     "Village list, codes and population: Census of India 2011. Activity data: field baseline survey entered by village "
     "supervisors and approved by admins, or imported from Excel. Boundaries: Census 2011 village polygons (Survey "
     "of India), available for all of India on GeoServer, with Indian rivers and river catchments. Rasters: LULC, population, groundwater "
     "potential and recharge suitability layers, the DEM and the emission rasters, all served by GeoServer."),
]


@dataclass
class Chunk:
    title: str
    text: str
    source: str
    tokens: list[str] = field(default_factory=list)


_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = set("the a an of and or to in on for is are be by with as at from per this that it its into each which".split())
# Words in almost every question that don't say what it is about; ignored when scoring a query.
_QUERY_STOP = set("""village villages emission emissions show map display which what how why where who when do does did
have has had give me tell about top highest lowest most least many much all list please can could would i we you my our
is are was were there their them 10 5 3 per cent""".split())
_SYNONYMS = {w: "formula" for w in "calculate calculated calculation calculations compute computed estimated estimate".split()}
_SYNONYMS.update({"reduce": "mitigation", "lower": "mitigation", "cut": "mitigation", "cattle": "livestock", "cows": "cattle"})


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


def _split(title: str, text: str, source: str) -> list[Chunk]:
    words = text.split()
    parts = [" ".join(words[i:i + CHUNK_WORDS]) for i in range(0, max(len(words), 1), CHUNK_WORDS)] or [""]
    return [Chunk(title if len(parts) == 1 else f"{title} ({i + 1})", p, source) for i, p in enumerate(parts)]


class KnowledgeBase:
    def __init__(self):
        self.chunks: list[Chunk] = []
        self.df: Counter = Counter()
        self.avg_len = 1.0
        self.built_at = 0.0
        self._embeddings: dict[str, list[float]] = {}

    async def ensure(self, db: AsyncSession):
        if self.chunks and time.monotonic() - self.built_at < REFRESH_SECONDS:
            return
        chunks = [c for title, text in METHODOLOGY for c in _split(title, text, "methodology")]

        for f in (await db.execute(select(EmissionFactor))).scalars():
            chunks.append(Chunk(
                f"Emission factor: {f.activity}",
                f"{f.sector} sector, {f.activity} ({f.fuel_or_source}): {f.emission_factor} kg per {f.unit}, gas {f.gas}, "
                f"CO2e multiplier {f.co2e_factor}. Source: {f.reference_source or 'n/a'} ({f.publication_year or 'n/a'}).",
                "emission_factors"))

        for key, (title, column, weights) in ALLOCATION.items():
            basis = ", ".join(f"{label} {w:.0%}" for label, w in weights.items()) or "sum of all source rasters"
            chunks.append(Chunk(f"Emission raster: {title}",
                                f"Raster layer emission_{key} ({title}) maps inventory column {column} in {RASTER_UNIT}. "
                                f"Land cover weights: {basis}.", "rasters"))
        try:
            from fastapi.concurrency import run_in_threadpool
            for r in await run_in_threadpool(raster_factors.list_factors):
                # Emission rasters are already described by the allocation chunks above.
                if r.get("description") and r.get("workspace") != EMISSION_WORKSPACE:
                    chunks.append(Chunk(f"Map layer: {r['title']}", f"{r['layer']} ({r['group']}): {r['description']}",
                                        "rasters"))
        except Exception:  # GeoServer offline: methodology still works
            logger.warning("Assistant knowledge base: GeoServer layer descriptions unavailable")

        rows = await db.execute(select(BlogPost.title, BlogPost.body, BlogPost.slug).where(BlogPost.published.is_(True)))
        for title, body, slug in rows:
            chunks.extend(_split(f"Blog: {title}", re.sub(r"[#*_>`-]+", " ", body or ""), f"blog/{slug}"))

        for c in chunks:
            c.tokens = tokenize(f"{c.title} {c.text}")
        self.chunks = chunks
        self.df = Counter(t for c in chunks for t in set(c.tokens))
        self.avg_len = sum(len(c.tokens) for c in chunks) / max(len(chunks), 1)
        self.built_at = time.monotonic()

    def _bm25(self, query: str, k1=1.4, b=0.75) -> list[float]:
        q = [_SYNONYMS.get(t, t) for t in tokenize(query) if t not in _QUERY_STOP and not t.isdigit()]
        n = len(self.chunks)
        scores = []
        for c in self.chunks:
            tf = Counter(c.tokens)
            s = 0.0
            for t in q:
                if t in tf:
                    idf = math.log(1 + (n - self.df[t] + 0.5) / (self.df[t] + 0.5))
                    s += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(c.tokens) / self.avg_len))
            scores.append(s)
        return scores

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{settings.OLLAMA_URL}/api/embed",
                                  json={"model": settings.OLLAMA_EMBED_MODEL, "input": texts})
            r.raise_for_status()
            return r.json()["embeddings"]

    async def _semantic(self, query: str) -> list[float] | None:
        if not settings.OLLAMA_EMBED_MODEL:
            return None
        try:
            keys = [hashlib.sha1(f"{c.title}\n{c.text}".encode()).hexdigest() for c in self.chunks]
            missing = [i for i, k in enumerate(keys) if k not in self._embeddings]
            if missing:
                vectors = await self._embed([f"{self.chunks[i].title}. {self.chunks[i].text}" for i in missing])
                self._embeddings.update({keys[i]: v for i, v in zip(missing, vectors)})
            (qv,) = await self._embed([query])
            qn = math.sqrt(sum(x * x for x in qv)) or 1
            out = []
            for k in keys:
                v = self._embeddings[k]
                out.append(sum(a * b for a, b in zip(qv, v)) / (qn * (math.sqrt(sum(x * x for x in v)) or 1)))
            return out
        except Exception:
            logger.warning("Assistant knowledge base: embeddings unavailable, using keyword search only")
            return None

    async def search(self, db: AsyncSession, query: str, k: int = 4) -> list[dict]:
        await self.ensure(db)
        bm25 = self._bm25(query)
        semantic = await self._semantic(query)
        # Reciprocal rank fusion of the keyword and embedding rankings.
        fused = [0.0] * len(self.chunks)
        for scores in filter(None, [bm25, semantic]):
            order = sorted(range(len(scores)), key=lambda i: -scores[i])
            for rank, i in enumerate(order):
                if scores[i] > 0:
                    fused[i] += 1 / (60 + rank)
        best = sorted((i for i in range(len(fused)) if fused[i] > 0), key=lambda i: -fused[i])[:k]
        return [{"title": self.chunks[i].title, "text": self.chunks[i].text, "source": self.chunks[i].source,
                 "score": round(bm25[i], 2)} for i in best]


knowledge_base = KnowledgeBase()
