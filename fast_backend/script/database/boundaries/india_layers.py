"""Loads the all-India census village layer in media/data/processed into PostGIS (WGS84), for GeoServer:

  india_villages    data/processed/Village_india/Village_india.shp   Census 2011 village polygons (Survey of India), ~654k

The shapefiles are read in chunks and written with COPY, so the 3 GB village file loads in minutes with little memory.
Chunk size and an optional simplification tolerance are set per layer (CHUNKING): keep chunks small for layers with
very detailed geometry, or a chunk can need many GB of memory.
Each table is only filled when empty, so re-running is safe.
Usage (from fast_backend/): python script/database/boundaries/india_layers.py [villages]"""
import io
import os
import sys
import time

import pyogrio
import shapely
from shapely.geometry import MultiLineString, MultiPolygon

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import MEDIA_DIR, engine  # noqa: E402

DATA = os.path.join(MEDIA_DIR, "data", "processed")
# table -> (features per chunk, simplify tolerance in degrees or None)
CHUNKING = {"india_villages": (25_000, None)}

# table: (shapefile, geometry type, [(source column, target column, SQL type)])
LAYERS = {
    "india_villages": (os.path.join(DATA, "Village_india", "Village_india.shp"), "MultiPolygon", [
        ("vlcode", "village_code", "text"), ("village", "village_name", "text"),
        ("block", "block_name", "text"), ("bkcode", "block_code", "text"),
        ("subdistric", "subdistrict_name", "text"), ("sdcode", "subdistrict_code", "text"),
        ("district", "district_name", "text"), ("dtcode", "district_code", "text"),
        ("state_name", "state_name", "text"), ("stcode", "state_code", "text"),
        ("total_urba", "rural_urban", "text"), ("total_popu", "population", "double precision"),
        ("total_hous", "households", "double precision"), ("total_male", "male", "double precision"),
        ("total_fema", "female", "double precision"), ("total_geog", "geographic_area_ha", "double precision"),
        ("forest_are", "forest_area_ha", "double precision"), ("net_area_s", "net_sown_area_ha", "double precision"),
        ("area_irrig", "irrigated_area_ha", "double precision"), ("src_agency", "source", "text"),
    ]),
}
INDEXES = {
    "india_villages": ["village_code", "district_code", "state_code", "subdistrict_code"],
}


def _multi(geom, kind):
    if geom is None or geom.is_empty:
        return None
    if kind == "MultiPolygon":
        if geom.geom_type == "Polygon":
            return MultiPolygon([geom])
        if geom.geom_type == "MultiPolygon":
            return geom
        polys = [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]
        return MultiPolygon(polys) if polys else None
    if geom.geom_type == "LineString":
        return MultiLineString([geom])
    return geom if geom.geom_type == "MultiLineString" else None


def _text(v):
    """A value for COPY's text format (tab-separated, \\N for NULL)."""
    if v is None or (isinstance(v, float) and v != v):
        return r"\N"
    s = str(v)
    if s.endswith(".0") and s[:-2].lstrip("-").isdigit():  # codes read as floats: 2403.0 -> 2403
        s = s[:-2]
    return s.replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")


def load(table):
    path, kind, columns = LAYERS[table]
    with engine.begin() as con:
        exists = con.exec_driver_sql(f"SELECT to_regclass('public.{table}') IS NOT NULL").scalar()
        if exists and con.exec_driver_sql(f"SELECT EXISTS (SELECT 1 FROM {table})").scalar():
            print(f"{table} already has data, skipping.")
            return
        cols_sql = ", ".join(f"{t} {typ}" for _, t, typ in columns)
        con.exec_driver_sql(f"DROP TABLE IF EXISTS {table}")
        con.exec_driver_sql(f"CREATE TABLE {table} (id serial PRIMARY KEY, {cols_sql}, geom geometry({kind}, 4326))")

    info = pyogrio.read_info(path)
    total, src_cols = info["features"], [s for s, _, _ in columns]
    chunk, tolerance = CHUNKING[table]
    print(f"{table}: {total:,} features from {os.path.basename(path)} ({info['crs']})", flush=True)
    target = ", ".join([t for _, t, _ in columns] + ["geom"])
    start, written = time.time(), 0
    raw = engine.raw_connection()
    try:
        for offset in range(0, total, chunk):
            gdf = pyogrio.read_dataframe(path, columns=src_cols, skip_features=offset, max_features=chunk,
                                         encoding="ISO-8859-1" if table == "india_villages" else None)
            gdf = gdf.to_crs(4326)
            if tolerance:
                gdf["geometry"] = gdf.geometry.simplify(tolerance, preserve_topology=True)
            geoms = [_multi(g, kind) for g in gdf.geometry]
            wkb = shapely.to_wkb(shapely.set_srid(geoms, 4326), hex=True, include_srid=True)
            buf = io.StringIO()
            for row, g in zip(gdf[src_cols].itertuples(index=False), wkb):
                if g is None:
                    continue
                buf.write("\t".join([_text(v) for v in row] + [g]) + "\n")
                written += 1
            buf.seek(0)
            with raw.cursor() as cur:
                cur.copy_expert(f"COPY {table} ({target}) FROM STDIN", buf)
            raw.commit()
            del gdf, geoms, wkb, buf
            done = min(offset + chunk, total)
            if done == total or (done // chunk) % max(1, 25_000 // chunk) == 0:
                print(f"  {done:,}/{total:,} ({100 * done / total:.0f}%) {time.time() - start:.0f}s", flush=True)
    finally:
        raw.close()

    with engine.begin() as con:
        con.exec_driver_sql(f"CREATE INDEX {table}_geom_idx ON {table} USING gist (geom)")
        for col in INDEXES[table]:
            con.exec_driver_sql(f"CREATE INDEX {table}_{col}_idx ON {table} ({col})")
        con.exec_driver_sql(f"ANALYZE {table}")
    print(f"{table}: {written:,} rows loaded in {time.time() - start:.0f}s", flush=True)


if __name__ == "__main__":
    wanted = [f"india_{a}" for a in sys.argv[1:]] or list(LAYERS)
    for name in wanted:
        load(name)
