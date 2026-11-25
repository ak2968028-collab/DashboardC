# Loads all source data from media/ into the database by running the loaders in script/database/ in order.
# Each loader only fills an empty table, so this is safe to run on every start.
# Usage (from fast_backend/): python -m script.load_database
import os
import subprocess
import sys

base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database")


def run_scripts_in_sequence(script_list):
    """Runs the Python scripts in order, stopping at the first failure (later tables depend on earlier ones)."""
    for script in script_list:
        path = os.path.join(base_dir, script)
        if not os.path.exists(path):
            print(f"Error: Script {script} not found")
            sys.exit(1)

        print(f"Executing: {script}", flush=True)
        result = subprocess.run([sys.executable, path], capture_output=True, text=True)
        if result.stdout:
            print(result.stdout.strip(), flush=True)
        if result.stderr:
            print(result.stderr.strip(), flush=True)
        if result.returncode != 0:
            print(f"Script {script} failed with return code {result.returncode}")
            sys.exit(result.returncode)


if __name__ == "__main__":

    scripts_to_run = [
        # Reference data
        "masters/emission_factors.py",
        # Census 2011 location masters (media/locations)
        "locations/states.py",
        "locations/districts.py",
        "locations/subdistricts.py",
        "locations/villages.py",
        # Login accounts (media/user/users.csv)
        "users/users.py",
        # Split village/location and survey inputs (data/raw/village_locations.csv + village_survey.csv)
        "survey/villages.py",
        "survey/demographics.py",
        "survey/land_use.py",
        "survey/water_resources.py",
        "survey/energy_consumption.py",
        "survey/waste_management.py",
        "survey/transport_activity.py",
        "survey/livestock_population.py",
        # Derived GHG emissions
        "emissions/village_emissions.py",
        # Boundary polygons (PostGIS)
        "boundaries/district_boundary.py",
        "boundaries/block_boundaries.py",
        "boundaries/village_boundaries.py",
        # All-India census villages (a few minutes the first time)
        "boundaries/india_layers.py",
        # Research papers of the References page (media/Research_paper)
        "references/research_papers.py",
    ]

    run_scripts_in_sequence(scripts_to_run)
