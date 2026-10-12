#!/bin/bash
# Database & GeoServer setup — run from the host once the services are up:
#   docker compose up -d
#   ./fast_backend/start.sh
#
# 1. deletes the existing migration files and autogenerates a fresh one from the models
# 2. applies it (alembic upgrade head) and creates the database views
# 3. pushes data into empty tables (media/run_all.py)
# 4. publishes vector layers and rasters to GeoServer
set -e

cd "$(dirname "$0")/.."   # project root (docker-compose.yml)
BACKEND="docker compose exec -T fast_backend"
PSQL="docker compose exec -T database sh -c 'psql -v ON_ERROR_STOP=1 -q -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'"

if ! docker compose ps --status running --services | grep -qx fast_backend; then
    echo "fast_backend is not running — start the services first: docker compose up -d"
    exit 1
fi

echo "Running backend setup commands..."
echo "==> Deleting existing migrations"
rm -rf fast_backend/alembic/versions/*.py fast_backend/alembic/versions/__pycache__
# Forget the applied revision (its file is gone); tables and data are untouched.
$BACKEND alembic stamp --purge base

echo "==> Generating and applying migration"
$BACKEND alembic revision --autogenerate -m "new update"
$BACKEND alembic upgrade head
eval "$PSQL" < database/views.sql

echo "==> Pushing data into the database"
$BACKEND python media/run_all.py

echo "==> Publishing layers to GeoServer"
$BACKEND python -m script.geoserver_publish
$BACKEND python -m script.geoserver_raster

echo "All tasks completed successfully."
