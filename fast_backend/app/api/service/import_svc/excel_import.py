# ====================================================================
# app/api/service/import_svc/excel_import.py
# Survey Excel import (API upload) and row validation shared with the loader scripts
# ====================================================================
import io

import pandas as pd
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.village.async_crud import Village_crud, Village_record_crud
from app.database.models import (
    Demographics, EnergyConsumption, LandUse, LivestockPopulation, TransportActivity, WasteManagement, WaterResources,
)

REQUIRED_COLUMNS = ['village_code', 'village_name', 'block_name', 'total_residents', 'total_area_ha']


def parse_village_row(row) -> tuple[dict, dict, str | None]:
    """Validates one Excel row; returns (village core, {model: record}, warning)."""
    vcode = str(row['village_code']).strip()
    vname = str(row['village_name']).strip()
    village = {
        'village_code': vcode,
        'village_name': vname,
        'block_name': str(row['block_name']).strip(),
        'subdistrict': str(row.get('subdistrict', 'Varanasi')).strip(),
        'latitude': float(row.get('latitude', 25.3)),
        'longitude': float(row.get('longitude', 82.9)),
    }

    # Validation checks
    pop = max(0, int(row.get('total_residents', 0)))
    hh = max(0, int(row.get('total_households', round(pop/6.0) if pop > 0 else 0)))
    tot_area = max(0.0, float(row.get('total_area_ha', 0.0)))
    builtup = max(0.0, float(row.get('builtup_area_ha', 0.0)))
    agri = max(0.0, float(row.get('agri_area_ha', 0.0)))
    warning = None
    if builtup + agri > tot_area * 1.05 and tot_area > 0:
        warning = f"Village {vname} ({vcode}): Built-up + Agri ({builtup + agri:.1f} ha) exceeds total area ({tot_area:.1f} ha)."

    def amount(col, default=0.0):
        return max(0.0, float(row.get(col, default)))

    def count(col, default=0):
        return max(0, int(row.get(col, default)))

    forest = amount('forest_area_ha')
    pond, river, canal = amount('pond_area_ha'), amount('river_area_ha'), amount('canal_area_ha')
    cows, goats, sheep = count('cows_count'), count('goats_count'), count('sheep_count')
    records = {
        Demographics: {
            'total_residents': pop, 'total_households': hh,
            'total_male': int(row.get('total_male', 0)), 'total_female': int(row.get('total_female', 0)),
        },
        LandUse: {
            'total_area_ha': tot_area, 'builtup_area_ha': builtup, 'agri_area_ha': agri, 'forest_area_ha': forest,
            'barren_area_ha': amount('barren_area_ha'), 'culturable_waste_ha': amount('culturable_waste_ha'),
            'fallow_land_ha': amount('fallow_land_ha'),
            'remaining_area_ha': amount('remaining_area_ha', max(0.0, tot_area - (builtup + agri + forest))),
        },
        WaterResources: {
            'pond_area_ha': pond, 'river_area_ha': river, 'canal_area_ha': canal,
            'well_irrig_area_ha': amount('well_irrig_area_ha'), 'other_water_ha': 0.0,
            'total_water_area_ha': amount('total_water_area_ha', pond + river + canal),
        },
        EnergyConsumption: {
            'lpg_monthly_kg': amount('lpg_monthly_kg'), 'firewood_monthly_kg': amount('firewood_monthly_kg'),
            'electricity_monthly_kwh': amount('electricity_monthly_kwh'),
        },
        WasteManagement: {'waste_monthly_kg': amount('waste_monthly_kg')},
        TransportActivity: {'motorbikes_count': count('motorbikes_count'), 'petrol_monthly_litres': amount('petrol_monthly_litres')},
        LivestockPopulation: {
            'cows_count': cows, 'goats_count': goats, 'sheep_count': sheep,
            'total_livestock': count('total_livestock', cows + goats + sheep),
        },
    }
    return village, records, warning


async def import_village_excel(db: AsyncSession, excel: str | bytes):
    """
    Imports Excel survey data (file path or file bytes) into the normalized village tables.
    Performs data integrity and range validation.
    """
    source = io.BytesIO(excel) if isinstance(excel, bytes) else excel
    df = await run_in_threadpool(pd.read_excel, source)
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing mandatory columns in Excel: {missing}")

    report = {'total_rows': len(df), 'inserted': 0, 'updated': 0, 'warnings': []}
    village_crud = Village_crud(db)
    record_rows = {}
    for _, row in df.iterrows():
        village, records, warning = parse_village_row(row)
        if warning:
            report['warnings'].append(warning)
        village_id, inserted = await village_crud.upsert_village(village)
        report['inserted' if inserted else 'updated'] += 1
        for model, record in records.items():
            record_rows.setdefault(model, []).append({'village_id': village_id, **record})

    for model, rows in record_rows.items():
        await Village_record_crud(db, model).upsert(rows)
    return report
