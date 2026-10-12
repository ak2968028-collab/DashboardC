import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import engine, table_has_rows  # noqa: E402
from app.api.service.carbon_svc.carbon import calculate_single_village, factors_from_rows  # noqa: E402

# Table name (derived from the activity tables and emission factors already in the database)
TABLE_NAME = 'village_emissions'

ACTIVITY_QUERY = """
    SELECT v.id AS village_id, d.total_residents,
           e.lpg_monthly_kg, e.firewood_monthly_kg, e.electricity_monthly_kwh,
           wm.waste_monthly_kg, t.petrol_monthly_litres,
           lp.cows_count, lp.goats_count, lp.sheep_count
    FROM villages v
    LEFT JOIN demographics d ON d.village_id = v.id
    LEFT JOIN energy_consumption e ON e.village_id = v.id
    LEFT JOIN waste_management wm ON wm.village_id = v.id
    LEFT JOIN transport_activity t ON t.village_id = v.id
    LEFT JOIN livestock_population lp ON lp.village_id = v.id
"""


def load_emissions_to_db():
    try:
        if table_has_rows(TABLE_NAME):
            print(f"{TABLE_NAME} already has data, skipping.")
            return
        factors_df = pd.read_sql("SELECT activity, emission_factor FROM emission_factors", engine)
        factors = factors_from_rows(factors_df.itertuples(index=False))

        # IPCC Tier-1 emissions for every village
        activity = pd.read_sql(ACTIVITY_QUERY, engine)
        activity = activity.astype(object).where(activity.notna(), None)  # missing data -> 0 in the model
        df = pd.DataFrame([
            {'village_id': int(row['village_id']), **calculate_single_village(row, factors)}
            for row in activity.to_dict('records')
        ])

        # Store data in the database
        df.to_sql(TABLE_NAME, engine, if_exists='append', index=False)
        print(f"Emissions for {len(df)} villages have been successfully inserted into {TABLE_NAME}.")

    except Exception as e:
        print("An error occurred:", e)
        sys.exit(1)


if __name__ == "__main__":
    load_emissions_to_db()
