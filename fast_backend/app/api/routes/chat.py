from fastapi import APIRouter, File, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.api.schema.chat_schema import Chat_request
from app.api.service.chat_svc.agent import model_status, stream_answer

router = APIRouter()


@router.post("")
async def chat(body: Chat_request):
    """Asks the AI assistant (local Ollama LLM with database, map, raster, knowledge-base and area-clipping tools).
    Streams NDJSON events: status, tool, visual (map / chart / table), sources, token, error, done."""
    history = [t.model_dump() for t in body.history]
    area = None
    if body.area_id:
        from app.api.service.chat_svc.area import get_area
        area = await run_in_threadpool(get_area, body.area_id)
    return StreamingResponse(
        stream_answer(body.message.strip(), history, area),
        media_type="application/x-ndjson",
        # Stop proxies (nginx, Cloudflare) from buffering the stream.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/area")
async def upload_area(file: UploadFile = File(..., description="GeoJSON, KML/KMZ, zipped shapefile, GeoPackage or GML")):
    """Uploads a vector file the assistant can clip data and rasters to; returns its id, size and outline."""
    from app.api.service.chat_svc.area import save_upload
    return await run_in_threadpool(save_upload, file.filename or "", await file.read())


@router.get("/status")
async def chat_status():
    """Whether the language model is reachable."""
    return await model_status()
