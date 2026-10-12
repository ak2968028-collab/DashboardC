import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import EXCEL_FILE, engine, table_has_rows  # noqa: E402
from survey_excel import survey_table  # noqa: E402

# Table name and Excel file
TABLE_NAME = 'land_use'


def load_excel_to_db():
    try:
        if table_has_rows(TABLE_NAME):
            print(f"{TABLE_NAME} already has data, skipping.")
            return
        # Read the survey Excel columns for this table (validated, linked to villages.id)
        df = survey_table(EXCEL_FILE, TABLE_NAME)

        # Store data in the database
        df.to_sql(TABLE_NAME, engine, if_exists='append', index=False)
        print(f"Data from {EXCEL_FILE} has been successfully inserted into {TABLE_NAME}.")

    except Exception as e:
        print("An error occurred:", e)
        sys.exit(1)


if __name__ == "__main__":
    load_excel_to_db()
