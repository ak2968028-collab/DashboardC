-- Views used by GeoServer, applied by fast_backend/start.sh after the Alembic migration.

-- Thematic village layer: polygons joined with live activity data & emissions.
CREATE OR REPLACE VIEW villages_carbon AS
SELECT b.village_code, v.village_name, v.block_name, v.subdistrict,
       d.total_residents, d.total_households,
       l.total_area_ha, l.agri_area_ha, l.builtup_area_ha,
       e.electricity_monthly_kwh, wm.waste_monthly_kg, lp.total_livestock,
       ve.energy_total_co2e_t_yr, ve.transport_co2e_t_yr, ve.waste_co2e_t_yr, ve.livestock_co2e_t_yr,
       ve.total_co2e_t_yr, ve.per_capita_co2e_kg_yr,
       b.geom
FROM village_boundaries b
LEFT JOIN villages v ON v.village_code = b.village_code
LEFT JOIN demographics d ON d.village_id = v.id
LEFT JOIN land_use l ON l.village_id = v.id
LEFT JOIN energy_consumption e ON e.village_id = v.id
LEFT JOIN waste_management wm ON wm.village_id = v.id
LEFT JOIN livestock_population lp ON lp.village_id = v.id
LEFT JOIN village_emissions ve ON ve.village_id = v.id;
