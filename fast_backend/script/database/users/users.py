import os
import sys

import pandas as pd
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_connection import MEDIA_DIR, engine  # noqa: E402
from app.api.service.auth_svc.security import hash_password  # noqa: E402

# Table name and CSV file
# Columns: username, password (plain text, stored hashed) or password_hash (written by the website),
# full_name, role (admin | supervisor), village_code (census code, supervisors only; leave empty so the
# supervisor picks it at login and uploads their Pradhan certificate for the admin to verify; a code given
# here counts as verified), is_active (optional, default true).
# The website rewrites this file whenever an account is added or changed (app/api/service/auth_svc/user_csv.py).
TABLE_NAME = 'users'
CSV_FILE = os.path.join(MEDIA_DIR, "user", "users.csv")
ROLES = {'admin', 'supervisor'}


def load_csv_to_db():
    """Adds users whose username is not in the database yet; existing accounts (and their passwords) are kept."""
    try:
        df = pd.read_csv(CSV_FILE, dtype=str).fillna('')
        df = df.apply(lambda col: col.str.strip())
        for column in ('password', 'password_hash', 'full_name', 'village_code', 'is_active'):
            if column not in df.columns:
                df[column] = ''
        with engine.begin() as connection:
            existing = set(connection.execute(text(f"SELECT username FROM {TABLE_NAME}")).scalars())
            taken = set(connection.execute(text(f"SELECT village_code FROM {TABLE_NAME} WHERE village_code IS NOT NULL")).scalars())
            census = set(connection.execute(
                text("SELECT village_code FROM census_villages WHERE village_code = ANY(:codes)"),
                {"codes": [c for c in df['village_code'] if c]}).scalars())

            rows, errors = [], []
            for i, r in df.iterrows():
                line = f"row {i + 2} ({r['username'] or 'no username'})"
                village = r['village_code'] if r['role'] == 'supervisor' and r['village_code'] else None
                if not r['username']:
                    errors.append(f"{line}: username is empty")
                elif r['username'] in existing:
                    print(f"{line}: already exists, skipping.")
                elif r['role'] not in ROLES:
                    errors.append(f"{line}: role must be admin or supervisor")
                elif r['password_hash'] and not r['password_hash'].startswith('scrypt$'):
                    errors.append(f"{line}: password_hash is not a hash written by the website")
                elif not r['password_hash'] and len(r['password']) < 6:
                    errors.append(f"{line}: password must be at least 6 characters")
                elif r['is_active'].lower() not in ('', 'true', 'false', 'yes', 'no', '1', '0'):
                    errors.append(f"{line}: is_active must be true or false")
                elif village and village not in census:
                    errors.append(f"{line}: village_code {village} is not a census village")
                elif village and village in taken:
                    errors.append(f"{line}: village {village} already has a supervisor")
                else:
                    supervisor = r['role'] == 'supervisor'
                    rows.append({'username': r['username'],
                                 'password_hash': r['password_hash'] or hash_password(r['password']),
                                 'is_active': r['is_active'].lower() not in ('false', 'no', '0'),
                                 'full_name': r['full_name'] or None, 'role': r['role'], 'village_code': village,
                                 # A village given here is assigned by the admin (verified); otherwise the
                                 # supervisor picks it at login and uploads the Pradhan certificate.
                                 'verification_status': ('verified' if village else 'unverified') if supervisor else None,
                                 'verified_at': pd.Timestamp.now() if village else None})
                    existing.add(r['username'])
                    if village:
                        taken.add(village)
            if errors:
                raise ValueError("fix users.csv and run again:\n  " + "\n  ".join(errors))

            # Store data in the database
            if rows:
                pd.DataFrame(rows).to_sql(TABLE_NAME, connection, if_exists='append', index=False)
        print(f"{len(rows)} users from {CSV_FILE} have been successfully inserted into {TABLE_NAME}.")

    except Exception as e:
        print("An error occurred:", e)
        sys.exit(1)


if __name__ == "__main__":
    load_csv_to_db()
