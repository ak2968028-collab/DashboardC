import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import MEDIA_DIR, engine, table_has_rows  # noqa: E402

# Table name and CSV file
TABLE_NAME = 'emission_factors'
CSV_FILE = os.path.join(MEDIA_DIR, "config", "emission_factors.csv")


def load_csv_to_db():
    try:
        if table_has_rows(TABLE_NAME):
            print(f"{TABLE_NAME} already has data, skipping.")
            return
        # Read the CSV file
        df = pd.read_csv(CSV_FILE)
        df = df.rename(columns={'factor_id': 'id', 'CO2e_factor': 'co2e_factor',
                                'reference': 'reference_source', 'year': 'publication_year'})

        # Store data in the database
        df.to_sql(TABLE_NAME, engine, if_exists='append', index=False)
        print(f"Data from {CSV_FILE} has been successfully inserted into {TABLE_NAME}.")

    except Exception as e:
        print("An error occurred:", e)
        sys.exit(1)


if __name__ == "__main__":
    load_csv_to_db()
