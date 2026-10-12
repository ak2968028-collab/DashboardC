# VARANASI DISTRICT — VILLAGE ENVIRONMENT & CARBON DASHBOARD

### *M.Tech Thesis Research Project*
**Village-Level Environmental Resource Assessment and Carbon Emission Modeling in Varanasi District, Uttar Pradesh, India**

---

## 🌿 1. Overview
This application is a specialized Geographic Information System (GIS) and Environmental Database Dashboard built specifically for **Varanasi District** and its **1,334 revenue villages**.

The system integrates:
* **Spatial Cadastral Boundaries** from the **Survey of India (SOI)**
* **Census 2011 & Field Survey Database** (demographics, land use, water bodies, household energy, transportation, municipal solid waste, and livestock)
* **IPCC Tier-1 & Central Electricity Authority (CEA) GHG Accounting Models**
* **Interactive Web GIS (Leaflet)** with synchronized village selectors and thematic choropleth layers
* **Comparative Analytics & Ranking** across all Community Development Blocks
* **Academic PDF Reporting** (ReportLab) adhering to MoEFCC reporting standards

---

## 🏛️ 2. Administrative Hierarchy & Coverage
* **Country:** India
* **State:** Uttar Pradesh
* **District:** Varanasi (`dtcode: 187`)
* **Community Development Blocks (8 Blocks + Sadar Peri-Urban):**
  1. Arajiline (220 villages)
  2. Pindra (191 villages)
  3. Sevapuri (185 villages)
  4. Harahua (173 villages)
  5. Cholapur (148 villages)
  6. Baragaon (139 villages)
  7. Chiraigaon (133 villages)
  8. Kashi Vidyapeeth (106 villages)
  9. Sadar Peri-Urban / ULB (39 mauzas)
* **Total Village Polygons:** **1,334 features**

---

## 📂 3. Project Directory Structure
```text
mtech-thesis/
│
├── docker-compose.yml             # fast_backend + database + frontend + geoserver
├── del.sh                         # Full clean of this project's Docker containers, volumes, images & caches
├── .env.example                   # Ports & credentials overrides
│
├── fast_backend/                  # FastAPI backend (Python)
│   ├── app/
│   │   ├── main.py                # FastAPI app (docs at /docs)
│   │   ├── conf/                  # settings.py (env vars), logging
│   │   ├── database/
│   │   │   ├── config/            # session.py (async engine), dependency.py (db_read / db_write)
│   │   │   ├── models/            # SQLAlchemy models: village.py, emission.py, spatial.py (PostGIS)
│   │   │   └── crud/              # Database queries per area (village, emission, spatial)
│   │   └── api/
│   │       ├── routes/            # Endpoints: villages, district, emissions, data_io, geo
│   │       ├── schema/            # Pydantic request / response models
│   │       └── service/           # carbon_svc (IPCC model), report_svc (PDF), import_svc (Excel),
│   │                              # geoserver_svc (layer publishing), village_svc, emission_svc
│   ├── alembic/                   # Database migrations (alembic.ini alongside)
│   │   └── versions/
│   ├── script/
│   │   ├── geoserver_publish.py   # Publishes PostGIS vector layers & SLD styles to GeoServer
│   │   └── geoserver_raster.py    # Uploads media/Rasters GeoTIFFs to GeoServer with their SLDs
│   ├── media/
│   │   ├── run_all.py             # Runs the loader scripts below in order
│   │   ├── scripts/               # One loader per table (read file -> df.to_sql), skips filled tables
│   │   │   ├── db_connection.py   # DB connection details (from POSTGRES_* env vars)
│   │   │   ├── masters/           # emission_factors.py
│   │   │   ├── survey/            # villages.py, demographics.py, land_use.py, ... (village_data.xlsx)
│   │   │   ├── emissions/         # village_emissions.py (IPCC Tier-1 model)
│   │   │   └── boundaries/        # district / block / village polygons -> PostGIS
│   │   ├── data/raw/              # village_data.xlsx (1,334 villages), VARANASI_VILL.gpkg (SOI cadastral)
│   │   ├── data/processed/        # District, block & village GeoJSON
│   │   ├── config/                # emission_factors.csv (IPCC & CEA)
│   │   ├── geoserver/             # SLD styles for the vector layers
│   │   └── Rasters/               # files/<group>/*.tif + SLD/<group>/*.sld (same file names)
│   ├── start.sh                   # Setup: migrations, data, GeoServer (run after docker compose up)
│   ├── Dockerfile, gunicorn.conf.py, requirements.txt
│   └── .fastdb.env.example        # Settings for running outside Docker
│
├── database/
│   ├── init-databases.sql         # Enables PostGIS on first start
│   └── views.sql                  # villages_carbon view (applied by start.sh)
│
└── frontend/                      # Next.js dashboard (React + Recharts + Leaflet)
    ├── Dockerfile
    └── src/app/                   # One folder per dashboard page
```

---

## 🔬 4. Methodology & Accounting Standards
The application enforces a rigorous distinction between:
1. **Observed Survey / Census Data**: Physical measurements (kg LPG, kWh electricity, hectares of cropped land, head count of livestock).
2. **Derived Output**: Mathematical greenhouse gas emissions ($t\text{CO}_2\text{e/year}$) computed via:

$$\text{Emissions } (\text{t CO}_2\text{e/year}) = \frac{\text{Annual Activity Data} \times \text{Emission Factor}}{1000}$$

### Emission Factor Reference Standards:
* **Grid Electricity:** $0.820 \text{ kg CO}_2/\text{kWh}$ (*Central Electricity Authority CEA CO2 Baseline Database for Indian Power Sector Version 20.0, 2024*).
* **LPG Domestic:** $2.984 \text{ kg CO}_2\text{e/kg}$ (*IPCC 2006 Guidelines for National GHG Inventories, Vol 2 Energy*).
* **Biomass Firewood:** $1.747 \text{ kg CO}_2\text{e/kg}$ (*MoEFCC & IPCC Biomass default combustion baseline*).
* **2-Wheeler Petrol:** $2.310 \text{ kg CO}_2\text{e/Litre}$ (*IPCC 2006 Mobile Road Transport*).
* **Rural Solid Waste:** $0.450 \text{ kg CO}_2\text{e/kg}$ (*IPCC 2006 First Order Decay model simplified default*).
* **Dairy Cattle / Cows:** $980.0 \text{ kg CO}_2\text{e/head/yr}$ (*IPCC 2006 Vol 4 AFOLU Indian Cattle Enteric + Manure*).
* **Goats & Sheep:** $145.6 \text{ kg CO}_2\text{e/head/yr}$ (*IPCC 2006 Vol 4 AFOLU Small Ruminants*).

---

## 🚀 5. Running the Dashboard

### With Docker (recommended)
```bash
docker compose up -d --build      # 1. start the services (database starts empty)
./fast_backend/start.sh           # 2. migrations + data + GeoServer layers
```
This starts four services:

| Service | Image | URL |
|---|---|---|
| `fast_backend` | FastAPI backend | `http://localhost:8000/docs` (interactive API docs) |
| `database` | PostgreSQL 17 + PostGIS 3.5 | `localhost:5432` (user / password / database: `varanasi`) |
| `frontend` | Next.js dashboard | `http://localhost:3000` |
| `geoserver` | GeoServer 2.28 (WMS / WFS) | `http://localhost:8080/geoserver` (login `admin` / `geoserver`) |

`docker compose up` only runs the services. `fast_backend/start.sh` (run from the host, like SLCR's) then:
1. deletes the existing Alembic migration files (and clears Alembic's applied-revision record with `alembic stamp --purge base`;
   tables and data are kept), then autogenerates a fresh migration from the models (`alembic revision --autogenerate`),
2. applies it (`alembic upgrade head`) and creates the views in `database/views.sql`,
3. pushes data with `media/run_all.py` — each loader fills its table from `media/data/raw/village_data.xlsx`,
   `emission_factors.csv` or the boundary GeoJSON; tables that already have data are skipped,
4. publishes the vector layers (workspace `varanasi`) and the rasters (workspace `varanasi_raster`) to GeoServer.

Re-running it is safe: after a model change it migrates the tables, and existing data and rasters are kept.

| Layer | Contents | Style |
|---|---|---|
| `varanasi:villages_carbon` | Village polygons + live activity data & emissions (view) | Carbon choropleth (`media/geoserver/varanasi_carbon.sld`) |
| `varanasi:village_boundaries` | Village polygons | Default |
| `varanasi:block_boundaries` | Block polygons | Dashed outline |
| `varanasi:district_boundary` | District polygon | Dashed outline |

The rasters also appear on the dashboard's **Village Map** as `Raster: …` overlays in the layer control (with their
legend), served through the frontend's `/geoserver` proxy.

Every GeoTIFF in `media/Rasters/files/<group>/` is published as `varanasi_raster:<file name>`, styled with
`media/Rasters/SLD/<group>/<file name>.sld`. To add a raster, drop the `.tif` and its `.sld` there and run
`docker compose exec fast_backend python -m script.geoserver_raster` (add `--replace` to re-upload changed files).

Add them to QGIS via *Layer → Add WMS/WFS Layer* with `http://localhost:8080/geoserver/varanasi/wms` (or `/wfs`).
Data lives in the `varanasi_pgdata` and `varanasi_geoserver` Docker volumes; `docker compose down -v` wipes them so the next start reloads all data and re-uploads the rasters.

To wipe everything and start over: `./del.sh` (asks for confirmation; `-y` skips it) removes this project's containers,
volumes, images, the Docker build cache and local caches — then run the two commands above again.

Ports and credentials can be changed with a `.env` file (see `.env.example`), e.g. `WEB_PORT=3100 docker compose up -d --build` if port 3000 is in use.

### Without Docker (development)
```bash
# PostgreSQL + PostGIS only (port 5432)
docker compose up -d database

# Terminal 1 — FastAPI backend (port 8000; settings from fast_backend/.fastdb.env)
cd fast_backend
cp .fastdb.env.example .fastdb.env
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
python media/run_all.py
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Next.js frontend (port 3000, proxies /api to port 8000)
cd frontend
npm install
npm run dev
```

### Database Migrations (Alembic)
After changing a model in `fast_backend/app/database/models/`, run `./fast_backend/start.sh` again — it regenerates the
migration in `fast_backend/alembic/versions/` (the folder is mounted into the container) and applies it.
Views are not tracked by Alembic; change them in `database/views.sql`.

### Main API Endpoints
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/blocks` | Block names |
| GET | `/api/villages?block=` | All villages with activity data & emissions |
| GET | `/api/villages/{code}` | Full record for one village |
| GET | `/api/villages/{code}/report.pdf` | Academic PDF report |
| GET | `/api/villages/{code}/export.csv` | Village record as CSV |
| GET | `/api/summary` | District KPIs, block & sector emissions |
| GET | `/api/emission-factors` | Active emission factors |
| POST | `/api/emissions/recompute` | Recalculate all village emissions |
| POST | `/api/import/excel` | Upload survey `.xlsx` (then recomputes) |
| GET | `/api/export/excel` | Download full database as Excel |
| GET | `/api/geo/{district\|blocks\|villages}` | Boundary GeoJSON |
