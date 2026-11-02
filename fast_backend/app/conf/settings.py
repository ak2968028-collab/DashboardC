from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

BASE_DIR = Path(__file__).resolve().parents[2]  # fast_backend/


def get_db_url(drivername: str, settings: "Settings") -> str:
    return URL.create(
        drivername=drivername,
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        database=settings.POSTGRES_DB,
    ).render_as_string(hide_password=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".fastdb.env", extra="ignore")

    # postgres
    POSTGRES_DB: str = "varanasi"
    POSTGRES_USER: str = "varanasi"
    POSTGRES_PASSWORD: str = "varanasi"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    # geoserver (layers are only published when GEOSERVER_URL is set)
    GEOSERVER_URL: str | None = None
    GEOSERVER_USERNAME: str = "admin"
    GEOSERVER_PASSWORD: str = "geoserver"
    GEOSERVER_WORKSPACE: str = "varanasi"
    GEOSERVER_DATASTORE: str = "varanasi_postgis"
    GEOSERVER_RASTER_WORKSPACE: str = "varanasi_raster"
    # factor rasters uploaded from the dashboard (Carbon Lab), kept apart from the curated layers
    GEOSERVER_TEMP_WORKSPACE: str = "varanasi_temp"
    # carbon emission rasters generated from the village inventory + LULC
    GEOSERVER_EMISSION_WORKSPACE: str = "varanasi_emission"

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # auth (set SECRET_KEY in .fastdb.env / the environment for any shared deployment)
    SECRET_KEY: str = "change-me-varanasi-dashboard-dev-secret"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 12 * 60

    # media paths
    MEDIA_DIR: Path = BASE_DIR / "media"

    @property
    def DATABASE_URL(self) -> str:
        """Async URL used by the API."""
        return get_db_url("postgresql+asyncpg", self)

    @property
    def DATABASE_SYNC_URL(self) -> str:
        """Sync URL used by Alembic."""
        return get_db_url("postgresql+psycopg2", self)

    @property
    def USERS_CSV_PATH(self) -> Path:
        """Login accounts loaded by media/scripts/users/users.py; rewritten on every account change."""
        return self.MEDIA_DIR / "user" / "users.csv"

    @property
    def EXCEL_PATH(self) -> Path:
        return self.MEDIA_DIR / "data" / "raw" / "village_data.xlsx"

    @property
    def EMISSION_FACTORS_PATH(self) -> Path:
        return self.MEDIA_DIR / "config" / "emission_factors.csv"

    @property
    def GEOJSON_LAYERS(self) -> dict[str, Path]:
        processed = self.MEDIA_DIR / "data" / "processed"
        return {
            "district": processed / "varanasi_district.geojson",
            "blocks": processed / "varanasi_blocks.geojson",
            "villages": processed / "varanasi_villages_optimized.geojson",
        }

    @property
    def PARCELS_GPKG_PATH(self) -> Path:
        """Cadastral khasra parcels (UTM 44N) used to lay out each village in the Carbon Lab 3D view."""
        return self.MEDIA_DIR / "Smulation data" / "varanasi.gpkg"

    @property
    def CADASTRAL_BOUNDARIES_PATH(self) -> Path:
        """Village boundaries dissolved from the khasra parcels (script/cadastral_boundaries.py), WGS84."""
        return self.MEDIA_DIR / "data" / "processed" / "varanasi_villages_cadastral.geojson"

    @property
    def SLD_DIR(self) -> Path:
        return self.MEDIA_DIR / "geoserver"

    @property
    def RASTER_DIR(self) -> Path:
        """GeoTIFFs in Rasters/files/<group>/, styled by Rasters/SLD/<group>/<same name>.sld"""
        return self.MEDIA_DIR / "Rasters"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
