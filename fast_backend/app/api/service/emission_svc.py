from sqlalchemy.ext.asyncio import AsyncSession

from app.api.service.carbon_svc.carbon import get_emission_factors

# factor key -> display metadata for the Settings / Methodology table
FACTOR_TABLE = [
    ('lpg', 'Liquefied Petroleum Gas (LPG)', 'kg', 'kg CO2e / kg', 'IPCC 2006 Vol 2'),
    ('firewood', 'Biomass Firewood Burning', 'kg', 'kg CO2e / kg', 'MoEFCC / IPCC 2006'),
    ('electricity', 'Grid Electricity (UP/NEWNE Grid)', 'kWh', 'kg CO2 / kWh', 'CEA Baseline v20 2024'),
    ('petrol', 'Motorbike Petrol / Gasoline', 'Litre', 'kg CO2e / Litre', 'IPCC 2006 Vol 2'),
    ('waste', 'Rural Solid Waste Disposal', 'kg', 'kg CO2e / kg', 'IPCC 2006 FOD simplified'),
    ('cow', 'Dairy Cattle / Cows', 'head/year', 'kg CO2e / head / yr', 'IPCC 2006 Vol 4 Indian Cattle'),
    ('goat', 'Goats (Caprine)', 'head/year', 'kg CO2e / head / yr', 'IPCC 2006 Vol 4'),
    ('sheep', 'Sheep (Ovine)', 'head/year', 'kg CO2e / head / yr', 'IPCC 2006 Vol 4'),
]


class emission_svc:

    async def get_factor_table(db: AsyncSession):
        factors = await get_emission_factors(db)
        return [
            {'activity': activity, 'unit': unit, 'factor': factors[key], 'factor_unit': factor_unit, 'standard': standard}
            for key, activity, unit, factor_unit, standard in FACTOR_TABLE
        ]
