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
    # assistant-created rasters are short-lived and never appear in the user-upload workspace
    GEOSERVER_ASSISTANT_TEMP_WORKSPACE: str = "assistant_temp"

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Website-only API access control (public dashboard needs no user login, but direct API scraping is blocked)
    WEBSITE_API_KEY: str = "varanasi-slcr-web-gateway-2026"
    ALLOWED_WEBSITE_HOSTS: list[str] = [
        "localhost:3000",
        "127.0.0.1:3000",
        "localhost:8000",
        "127.0.0.1:8000",
        "*.vercel.app",
        "*.slcrdss.xyz",
        "slcrdss.xyz",
    ]
    ENABLE_API_DOCS: bool = True

    # AI assistant (local LLM served by Ollama; the model must support tool calling, e.g. llama3.1:8b)
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    # Optional embedding model for the knowledge base (e.g. nomic-embed-text); keyword search (BM25) only when unset.
    OLLAMA_EMBED_MODEL: str | None = None
    OLLAMA_NUM_CTX: int = 8192
    OLLAMA_TIMEOUT: float = 300.0

    # auth (set SECRET_KEY in .fastdb.env / the environment for any shared deployment)
    SECRET_KEY: str = "change-me-varanasi-dashboard-dev-secret"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 12 * 60

    # media/: the source data is loaded into the database / GeoServer by the scripts in script/; the API itself only
    # keeps its own files here (assistant images in temp/, uploaded areas in chat_areas/, the users.csv backup).
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
        """Login accounts loaded by script/database/users/users.py; rewritten by the API on every account change."""
        return self.MEDIA_DIR / "user" / "users.csv"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
