import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import engine  # noqa: E402
from app.api.service.import_svc.excel_import import parse_village_row  # noqa: E402


def read_survey(survey_file):
    """Validated survey rows: (village core, {table name: record}) per village (same rules as the API import)."""
    df = pd.read_csv(survey_file, dtype={"village_code": str})
    parsed = []
    for _, row in df.iterrows():
        village, records, _ = parse_village_row(row)
        parsed.append((village, {model.__tablename__: record for model, record in records.items()}))
    return parsed


def survey_table(survey_file, table_name):
    """One village parameter table from the survey CSV, linked to villages.id by census code."""
    rows = [{"village_code": v["village_code"], **records[table_name]} for v, records in read_survey(survey_file)]
    village_ids = pd.read_sql("SELECT id AS village_id, village_code FROM villages", engine)
    return pd.DataFrame(rows).merge(village_ids, on="village_code").drop(columns="village_code")
