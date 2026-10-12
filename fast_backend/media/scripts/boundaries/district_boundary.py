import os
import sys

import geopandas as gpd
from shapely.geometry import MultiPolygon

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import MEDIA_DIR, engine, table_has_rows  # noqa: E402

# Table name and GeoJSON file
TABLE_NAME = 'district_boundary'
GEOJSON_FILE = os.path.join(MEDIA_DIR, "data", "processed", "varanasi_district.geojson")
KEY_COLUMN = 'district'


def load_geojson_to_db():
    try:
        if table_has_rows(TABLE_NAME):
            print(f"{TABLE_NAME} already has data, skipping.")
            return
        # Read the GeoJSON file (WGS84) as MultiPolygons
        gdf = gpd.read_file(GEOJSON_FILE).to_crs(4326)
        gdf[KEY_COLUMN] = gdf[KEY_COLUMN].astype(str).str.strip()
        gdf['geometry'] = gdf.geometry.apply(lambda g: MultiPolygon([g]) if g.geom_type == 'Polygon' else g)
        gdf = gdf[[KEY_COLUMN, 'geometry']].rename_geometry('geom')

        # Store data in the database (PostGIS)
        gdf.to_postgis(TABLE_NAME, engine, if_exists='append', index=False)
        print(f"Data from {GEOJSON_FILE} has been successfully inserted into {TABLE_NAME}.")

    except Exception as e:
        print("An error occurred:", e)
        sys.exit(1)


if __name__ == "__main__":
    load_geojson_to_db()
