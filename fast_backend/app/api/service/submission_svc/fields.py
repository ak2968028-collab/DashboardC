# Survey attributes a village supervisor can submit, grouped by dashboard section.
# Totals marked derived are recomputed from their parts on approval, not entered.
from app.database.models import (
    Demographics, EnergyConsumption, LandUse, LivestockPopulation, TransportActivity, WasteManagement, WaterResources,
)

# (key, label, unit, integer?)
SECTIONS = [
    ("Demography", Demographics, [
        ("total_residents", "Total residents", "persons", True),
        ("total_households", "Total households", "households", True),
        ("total_male", "Male population", "persons", True),
        ("total_female", "Female population", "persons", True),
    ]),
    ("Land Use", LandUse, [
        ("total_area_ha", "Total village area", "ha", False),
        ("builtup_area_ha", "Built-up area", "ha", False),
        ("agri_area_ha", "Agricultural area", "ha", False),
        ("forest_area_ha", "Forest area", "ha", False),
        ("barren_area_ha", "Barren / unculturable land", "ha", False),
        ("culturable_waste_ha", "Culturable waste land", "ha", False),
        ("fallow_land_ha", "Fallow land", "ha", False),
    ]),
    ("Water Resources", WaterResources, [
        ("pond_area_ha", "Pond area", "ha", False),
        ("river_area_ha", "River area", "ha", False),
        ("canal_area_ha", "Canal area", "ha", False),
        ("well_irrig_area_ha", "Well-irrigated area", "ha", False),
        ("other_water_ha", "Other water bodies", "ha", False),
    ]),
    ("Energy", EnergyConsumption, [
        ("lpg_monthly_kg", "LPG used", "kg / month", False),
        ("firewood_monthly_kg", "Firewood used", "kg / month", False),
        ("electricity_monthly_kwh", "Electricity used", "kWh / month", False),
    ]),
    ("Waste", WasteManagement, [
        ("waste_monthly_kg", "Solid waste generated", "kg / month", False),
    ]),
    ("Transport", TransportActivity, [
        ("motorbikes_count", "Motorbikes", "count", True),
        ("petrol_monthly_litres", "Petrol used", "litres / month", False),
    ]),
    ("Livestock", LivestockPopulation, [
        ("cows_count", "Cows / cattle", "head", True),
        ("goats_count", "Goats", "head", True),
        ("sheep_count", "Sheep", "head", True),
    ]),
]

FIELDS = [
    {"key": key, "label": label, "unit": unit, "section": section, "integer": integer}
    for section, _, fields in SECTIONS for key, label, unit, integer in fields
]
FIELD_KEYS = [f["key"] for f in FIELDS]
INTEGER_KEYS = {f["key"] for f in FIELDS if f["integer"]}

# Fields required before a village that is not yet on the dashboard can be added.
REQUIRED_FOR_NEW_VILLAGE = ["total_residents", "total_area_ha"]


def with_derived(values: dict) -> dict:
    """Adds the totals the dashboard stores alongside the entered values."""
    v = {k: values.get(k) or 0 for k in FIELD_KEYS}
    v["remaining_area_ha"] = max(0.0, v["total_area_ha"] - (v["builtup_area_ha"] + v["agri_area_ha"] + v["forest_area_ha"]))
    v["total_water_area_ha"] = v["pond_area_ha"] + v["river_area_ha"] + v["canal_area_ha"] + v["other_water_ha"]
    v["total_livestock"] = v["cows_count"] + v["goats_count"] + v["sheep_count"]
    return v


def record_rows(village_id: int, values: dict) -> dict:
    """{model: row} for every village parameter table, from complete (derived) values."""
    derived = {LandUse: ["remaining_area_ha"], WaterResources: ["total_water_area_ha"], LivestockPopulation: ["total_livestock"]}
    return {
        model: {"village_id": village_id, **{k: values[k] for k, *_ in fields}, **{k: values[k] for k in derived.get(model, [])}}
        for _, model, fields in SECTIONS
    }
