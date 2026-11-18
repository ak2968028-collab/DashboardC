# ====================================================================
# VARANASI DISTRICT — VILLAGE ENVIRONMENT & CARBON DASHBOARD
# REST API (FastAPI) serving the Next.js frontend
# ====================================================================
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.routes import app_router
from app.conf.logging.applog import logger
from app.conf.settings import settings
from app.database.config.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting application...")
    yield
    logger.info("Shutting down application...")
    await engine.dispose()


app = FastAPI(
    title="Varanasi Village Environment & Carbon API",
    description="Village-Level Environmental Resource Assessment and Carbon Emission Modeling",
    version="2.0.0",
    lifespan=lifespan,
)

# Streams (the assistant's NDJSON events) are left uncompressed so each event reaches the browser at once.
app.add_middleware(GZipMiddleware, minimum_size=1000, exclude_content_types=("text/event-stream", "application/x-ndjson"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok"}


app.include_router(app_router, prefix="/api")
