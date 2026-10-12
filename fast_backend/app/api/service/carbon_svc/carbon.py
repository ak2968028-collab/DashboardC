# ====================================================================
# app/api/service/carbon_svc/carbon.py
# Greenhouse Gas Accounting & Emission Modeling Service
# Based on IPCC 2006 Guidelines and CEA India Baseline v20
# ====================================================================
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.crud.emission.async_crud import Emission_factor_crud, Village_emissions_crud
from app.database.crud.village.async_crud import Village_crud

DEFAULT_FACTORS = {
    'lpg': 2.984,          # kg CO2e / kg LPG (IPCC 2006)
    'firewood': 1.747,     # kg CO2e / kg wood (IPCC 2006)
    'electricity': 0.820,  # kg CO2e / kWh (CEA India v20 2024)
    'petrol': 2.310,       # kg CO2e / litre (IPCC 2006 mobile combustion)
    'waste': 0.450,        # kg CO2e / kg MSW (IPCC rural solid waste)
    'cow': 980.0,          # kg CO2e / head / yr (enteric + manure, IPCC Indian cattle)
    'goat': 145.6,         # kg CO2e / head / yr (IPCC caprine)
    'sheep': 145.6         # kg CO2e / head / yr (IPCC ovine)
}

# Emission factor activity name (lower-case substring) -> factor key
ACTIVITY_KEYS = [
    ('lpg', 'lpg'), ('firewood', 'firewood'), ('electricity', 'electricity'), ('fuel', 'petrol'),
    ('petrol', 'petrol'), ('waste', 'waste'), ('cattle', 'cow'), ('cow', 'cow'), ('goat', 'goat'), ('sheep', 'sheep'),
]


def factors_from_rows(rows):
    """Maps (activity, emission_factor) rows onto the model's factor keys, falling back to defaults."""
    factors = DEFAULT_FACTORS.copy()
    for activity, value in rows:
        key = next((k for needle, k in ACTIVITY_KEYS if needle in str(activity).lower()), None)
        if key:
            factors[key] = float(value)
    return factors


async def get_emission_factors(db: AsyncSession):
    """Retrieves active emission factors from the database, falling back to defaults."""
    return factors_from_rows((f.activity, f.emission_factor) for f in await Emission_factor_crud(db).get_all())


def calculate_single_village(village_dict, factors=None):
    """
    Computes sectoral greenhouse gas emissions for a single village dictionary.
    Activity Data:
      LPG (kg/mo), Firewood (kg/mo), Electricity (kWh/mo)
      Petrol (L/mo), Solid Waste (kg/mo)
      Cows, Goats, Sheep (counts)
    Returns dictionary with all sectoral emissions in tonnes CO2e/year.
    """
    if factors is None:
        factors = DEFAULT_FACTORS
    
    # 1. Energy
    lpg_kg_yr = float(village_dict.get('lpg_monthly_kg', 0) or 0) * 12.0
    firewood_kg_yr = float(village_dict.get('firewood_monthly_kg', 0) or 0) * 12.0
    elec_kwh_yr = float(village_dict.get('electricity_monthly_kwh', 0) or 0) * 12.0
    
    lpg_t = (lpg_kg_yr * factors['lpg']) / 1000.0
    firewood_t = (firewood_kg_yr * factors['firewood']) / 1000.0
    elec_t = (elec_kwh_yr * factors['electricity']) / 1000.0
    energy_t = lpg_t + firewood_t + elec_t
    
    # 2. Transport
    petrol_l_yr = float(village_dict.get('petrol_monthly_litres', 0) or 0) * 12.0
    transport_t = (petrol_l_yr * factors['petrol']) / 1000.0
    
    # 3. Waste
    waste_kg_yr = float(village_dict.get('waste_monthly_kg', 0) or 0) * 12.0
    waste_t = (waste_kg_yr * factors['waste']) / 1000.0
    
    # 4. Livestock
    cows = float(village_dict.get('cows_count', 0) or 0)
    goats = float(village_dict.get('goats_count', 0) or 0)
    sheep = float(village_dict.get('sheep_count', 0) or 0)
    livestock_t = (cows * factors['cow'] + goats * factors['goat'] + sheep * factors['sheep']) / 1000.0
    
    # Total
    total_t = energy_t + transport_t + waste_t + livestock_t
    
    # Per Capita (kg CO2e / person / year)
    pop = float(village_dict.get('total_residents', 0) or 0)
    per_capita_kg = (total_t * 1000.0 / pop) if pop > 0 else 0.0
    
    return {
        'lpg_co2e_t_yr': round(lpg_t, 2),
        'firewood_co2e_t_yr': round(firewood_t, 2),
        'electricity_co2e_t_yr': round(elec_t, 2),
        'energy_total_co2e_t_yr': round(energy_t, 2),
        'transport_co2e_t_yr': round(transport_t, 2),
        'waste_co2e_t_yr': round(waste_t, 2),
        'livestock_co2e_t_yr': round(livestock_t, 2),
        'total_co2e_t_yr': round(total_t, 2),
        'per_capita_co2e_kg_yr': round(per_capita_kg, 2)
    }

async def recompute_and_save_all_emissions(db: AsyncSession):
    """Recomputes emissions for every village in the database and saves them."""
    factors = await get_emission_factors(db)
    emissions_list = []
    for row in await Village_crud(db).get_activity_data():
        calc = calculate_single_village(row, factors)
        calc['village_id'] = int(row['village_id'])
        emissions_list.append(calc)
    await Village_emissions_crud(db).upsert(emissions_list)
    return len(emissions_list)
