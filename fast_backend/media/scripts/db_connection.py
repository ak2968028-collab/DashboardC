import os
import sys

from sqlalchemy import create_engine, text

# Make the backend package (app.*) importable when a script is run directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Database connection details (from the environment, same variables as docker-compose / .fastdb.env)
DB_USER = os.getenv("POSTGRES_USER", "varanasi")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "varanasi")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "varanasi")

MEDIA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_FILE = os.path.join(MEDIA_DIR, "data", "raw", "village_data.xlsx")

# Create the database engine
engine = create_engine(f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}")


def table_has_rows(table_name):
    """Loaders only fill empty tables, so re-running them is safe."""
    with engine.connect() as connection:
        return connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {table_name})")).scalar()
