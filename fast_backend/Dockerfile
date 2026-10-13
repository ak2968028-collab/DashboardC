FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/home/app

RUN groupadd -g 1000 appuser && useradd -r -g appuser -u 1000 -m -d /home/appuser appuser

WORKDIR /home/app

COPY requirements.txt .
# Cache mount keeps downloaded wheels between builds, so changing requirements.txt
# only fetches the new/changed packages.
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000
CMD ["gunicorn", "app.main:app", "--config", "gunicorn.conf.py"]
