FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/home/app

RUN groupadd -g 1000 appuser && useradd -r -g appuser -u 1000 -m -d /home/appuser appuser

WORKDIR /home/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000
CMD ["gunicorn", "app.main:app", "--config", "gunicorn.conf.py"]
