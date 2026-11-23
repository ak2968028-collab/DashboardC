#!/bin/bash
# Database & GeoServer setup — run from the host once the services are up:
#   docker compose up -d
#   ./fast_backend/start.sh
#
# 1. deletes the existing migration files and autogenerates a fresh one from the models
# 2. applies it (alembic upgrade head) and creates the database views
# 3. loads the source data from media/ into empty tables (script/load_database.py -> script/database/*)
# 4. publishes media/ data to GeoServer: vector layers (script/geoserver_publish.py: PostGIS layers, khasra parcels,
#    the India state base map), rasters and the DEM (script/geoserver_raster.py), then the emission rasters
set -e

cd "$(dirname "$0")/.."   # project root (docker-compose.yml)
BACKEND="docker compose exec -T fast_backend"
PSQL="docker compose exec -T database sh -c 'psql -v ON_ERROR_STOP=1 -q -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'"

if ! docker compose ps --status running --services | grep -qx fast_backend; then
    echo "fast_backend is not running — start the services first: docker compose up -d"
    exit 1
fi

# Wait until the database accepts connections (a first start initialises, restarts and may run recovery).
echo "==> Waiting for the database"
tries=0
until docker compose exec -T database sh -c 'pg_isready -q -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' </dev/null >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 90 ]; then
        echo "Database is not accepting connections after 3 minutes; check: docker compose logs database"
        exit 1
    fi
    sleep 2
done

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
$BACKEND python -m script.load_database

echo "==> Publishing layers to GeoServer"
# Census boundaries are used everywhere (cadastral boundaries are no longer generated or published).
$BACKEND python -m script.geoserver_publish
$BACKEND python -m script.geoserver_raster

echo "All tasks completed successfully."
