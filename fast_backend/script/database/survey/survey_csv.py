import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import engine  # noqa: E402
from app.api.service.import_svc.excel_import import parse_village_row  # noqa: E402


def _read_csv(path):
    df = pd.read_csv(path, dtype=str, skipinitialspace=True, keep_default_na=False)
    df.columns = df.columns.str.strip()
    df = df.apply(lambda col: col.str.strip())
    return df.replace("", None)


def read_survey(village_file, survey_file=None):
    """Validated rows from separate village/location and survey CSVs, joined by village_code."""
    # Single-file support keeps older callers working while all database loaders use the split files.
    if survey_file is None:
        df = _read_csv(village_file)
    else:
        village_df, survey_df = _read_csv(village_file), _read_csv(survey_file)
        for label, frame in (("village", village_df), ("survey", survey_df)):
            if "village_code" not in frame.columns:
                raise ValueError(f"{label} CSV must contain village_code")
            if frame["village_code"].isna().any() or frame["village_code"].duplicated().any():
                raise ValueError(f"{label} CSV contains missing or duplicate village_code values")
        village_codes, survey_codes = set(village_df.village_code), set(survey_df.village_code)
        if village_codes != survey_codes:
            missing_survey = sorted(village_codes - survey_codes)[:5]
            missing_village = sorted(survey_codes - village_codes)[:5]
            raise ValueError(
                "Village and survey CSV village_code values do not match; "
                f"missing survey rows={missing_survey}, missing village rows={missing_village}"
            )
        overlap = (set(village_df.columns) & set(survey_df.columns)) - {"village_code"}
        if overlap:
            raise ValueError(f"CSV files have overlapping non-key columns: {sorted(overlap)}")
        df = village_df.merge(survey_df, on="village_code", how="inner", validate="one_to_one", sort=False)

    parsed = []
    for _, row in df.iterrows():
        village, records, _ = parse_village_row(row)
        parsed.append((village, {model.__tablename__: record for model, record in records.items()}))
    return parsed


def survey_table(village_file, survey_file, table_name):
    """One village parameter table from the survey CSV, linked to villages.id by census code."""
    rows = [
        {"village_code": village["village_code"], **records[table_name]}
        for village, records in read_survey(village_file, survey_file)
    ]
    village_ids = pd.read_sql("SELECT id AS village_id, village_code FROM villages", engine)
    return pd.DataFrame(rows).merge(village_ids, on="village_code").drop(columns="village_code")
