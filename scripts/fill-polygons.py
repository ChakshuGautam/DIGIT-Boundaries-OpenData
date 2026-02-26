#!/usr/bin/env python3
"""
Fill boundaries-polygons.geojson from datameet repos.

Sources:
  - datameet/shapefiles: country, state, district polygons
  - datameet/Municipal_Spatial_Data: city ward polygons
  - Subhash9325/GeoJson-Data-of-Indian-States: state polygons (higher detail)

Writes:
  data/IN/boundaries-polygons.geojson                — all state polygons
  data/IN/{STATE}/boundaries-polygons.geojson         — district polygons for that state
  data/IN/{STATE}/boundaries-polygons-state.geojson   — single state outline polygon
"""

import json
import os
import shutil
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DATAMEET_SHAPES = "/tmp/datameet-shapefiles"
DATAMEET_MUNICIPAL = "/tmp/datameet-municipal"
SUBHASH_STATES = "/tmp/indian_states.geojson"

# ---------------------------------------------------------------------------
# Datameet folder name → ISO 3166-2 state code
# ---------------------------------------------------------------------------
DATAMEET_TO_ISO = {
    "andamannicobarislands": "AN",
    "andhrapradesh": "AP",
    "arunachalpradesh": "AR",
    "assam": "AS",
    "bihar": "BR",
    "chandigarh": "CH",
    "chhattisgarh": "CT",
    "dadranagarhaveli": "DH",
    "damandiu": "DD",
    "delhi": "DL",
    "goa": "GA",
    "gujarat": "GJ",
    "haryana": "HR",
    "himachalpradesh": "HP",
    "jammukashmir": "JK",
    "jharkhand": "JH",
    "karnataka": "KA",
    "kerala": "KL",
    "lakshadweep": "LD",
    "madhyapradesh": "MP",
    "maharashtra": "MH",
    "manipur": "MN",
    "meghalaya": "ML",
    "mizoram": "MZ",
    "nagaland": "NL",
    "odisha": "OR",
    "puducherry": "PY",
    "punjab": "PB",
    "rajasthan": "RJ",
    "sikkim": "SK",
    "tamilnadu": "TN",
    "telangana": "TG",
    "tripura": "TR",
    "uttarakhand": "UT",
    "uttarpradesh": "UP",
    "westbengal": "WB",
}

# Subhash9325 state names → ISO codes
SUBHASH_TO_ISO = {
    "Andaman and Nicobar": "AN",
    "Andhra Pradesh": "AP",
    "Arunachal Pradesh": "AR",
    "Assam": "AS",
    "Bihar": "BR",
    "Chandigarh": "CH",
    "Chhattisgarh": "CT",
    "Dadra and Nagar Haveli": "DH",
    "Daman and Diu": "DD",
    "Delhi": "DL",
    "Goa": "GA",
    "Gujarat": "GJ",
    "Haryana": "HR",
    "Himachal Pradesh": "HP",
    "Jammu and Kashmir": "JK",
    "Jharkhand": "JH",
    "Karnataka": "KA",
    "Kerala": "KL",
    "Lakshadweep": "LD",
    "Madhya Pradesh": "MP",
    "Maharashtra": "MH",
    "Manipur": "MN",
    "Meghalaya": "ML",
    "Mizoram": "MZ",
    "Nagaland": "NL",
    "Orissa": "OR",
    "Odisha": "OR",
    "Puducherry": "PY",
    "Punjab": "PB",
    "Rajasthan": "RJ",
    "Sikkim": "SK",
    "Tamil Nadu": "TN",
    "Telangana": "TG",
    "Tripura": "TR",
    "Uttaranchal": "UT",
    "Uttarakhand": "UT",
    "Uttar Pradesh": "UP",
    "West Bengal": "WB",
}

# datameet/Municipal_Spatial_Data city → (state_code, city_code, ward_file)
MUNICIPAL_CITIES = {
    "Ahmedabad":     ("GJ", "AMD", "Wards.geojson"),
    "Bangalore":     ("KA", "BLR", "BBMP.geojson"),
    "Bhopal":        ("MP", "BPL", "Bhopal_wards.geojson"),
    "Bhubaneswar":   ("OR", "BBR", "Wards.GeoJSON"),
    "Bodh_Gaya":     ("BR", "BGY", "Bodh_Gaya_Wards.geojson"),
    "Chandigarh":    ("CH", "CHD", "Chandigarh_Wards.geojson"),
    "Chennai":       ("TN", "CHN", "Wards.geojson"),
    "Coimbatore":    ("TN", "CBE", "Cbe2011Wards.geojson"),
    "Delhi":         ("DL", "DEL", "Delhi_Wards.geojson"),
    "Faridabad":     ("HR", "FBD", "Faridabad_Wards.geojson"),
    "Hyderabad":     ("TG", "HYD", "ghmc-wards.geojson"),
    "Jaipur":        ("RJ", "JPR", "Jaipur_Wards.geojson"),
    "Kanpur":        ("UP", "KNP", "Kanpur_wards.geojson"),
    "Katihar":       ("BR", "KTH", "Katihar_Wards.geojson"),
    "Kishangarh":    ("RJ", "KSG", "Kishangarh_Wards.geojson"),
    "Kolkata":       ("WB", "KOL", "kolkata.geojson"),
    "Lucknow":       ("UP", "LKO", "Lucknow_ward_boundary.geojson"),
    "Mumbai":        ("MH", "MUM", "BMC_Wards.geojson"),
    "NMMC":          ("MH", "NMC", "NMC_ElectoralWards.geojson"),
    "PCMC":          ("MH", "PCM", "pcmc-electoral-wards.geojson"),
    "Pune":          ("MH", "PNE", "pune-electoral-wards_2022.geojson"),
    "Purnia":        ("BR", "PRN", "Purnia_Wards.geojson"),
    "Vadodara":      ("GJ", "VAD", "vardodara_wards.geojson"),
    "Vijayawada":    ("AP", "VJA", "Vijayawada_Wards.geojson"),
}

stats = {"country": 0, "state_outline": 0, "district": 0, "city_ward": 0, "skipped": 0}


def write_geojson(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f)
    size = os.path.getsize(path) / 1024
    unit = "KB" if size < 1024 else "MB"
    val = size if size < 1024 else size / 1024
    print(f"  -> {os.path.relpath(path, DATA_DIR)} ({val:.1f} {unit})")


def fill_country_polygons():
    """Copy all-states polygon to data/IN/boundaries-polygons.geojson"""
    src = os.path.join(DATAMEET_SHAPES, "india", "state_ut", "india_state.json")
    if not os.path.exists(src):
        print("SKIP: india_state.json not found")
        return
    with open(src) as f:
        data = json.load(f)
    dest = os.path.join(DATA_DIR, "IN", "boundaries-polygons.geojson")
    write_geojson(dest, data)
    stats["country"] += 1
    print(f"  Country: {len(data['features'])} state polygons")


def fill_state_outlines():
    """Extract individual state outlines from Subhash9325 or datameet."""
    # Try Subhash9325 first (higher detail)
    if os.path.exists(SUBHASH_STATES):
        with open(SUBHASH_STATES) as f:
            data = json.load(f)
        for feat in data["features"]:
            name = feat["properties"].get("NAME_1", "")
            iso = SUBHASH_TO_ISO.get(name)
            if not iso:
                print(f"  WARN: no ISO mapping for Subhash state '{name}'")
                continue
            state_dir = os.path.join(DATA_DIR, "IN", iso)
            if not os.path.isdir(state_dir):
                continue
            dest = os.path.join(state_dir, "boundaries-polygons-state.geojson")
            single = {"type": "FeatureCollection", "features": [feat]}
            write_geojson(dest, single)
            stats["state_outline"] += 1
    else:
        # Fallback: extract from datameet india_state.json
        src = os.path.join(DATAMEET_SHAPES, "india", "state_ut", "india_state.json")
        if not os.path.exists(src):
            return
        with open(src) as f:
            data = json.load(f)
        # datameet state names → ISO mapping via reverse lookup
        dm_name_to_iso = {
            "Andaman & Nicobar Island": "AN",
            "Andhra Pradesh": "AP",
            "Arunanchal Pradesh": "AR",
            "Assam": "AS",
            "Bihar": "BR",
            "Chandigarh": "CH",
            "Chhattisgarh": "CT",
            "Dadara & Nagar Havelli": "DH",
            "Daman & Diu": "DD",
            "Goa": "GA",
            "Gujarat": "GJ",
            "Haryana": "HR",
            "Himachal Pradesh": "HP",
            "Jammu & Kashmir": "JK",
            "Jharkhand": "JH",
            "Karnataka": "KA",
            "Kerala": "KL",
            "Lakshadweep": "LD",
            "Madhya Pradesh": "MP",
            "Maharashtra": "MH",
            "Manipur": "MN",
            "Meghalaya": "ML",
            "Mizoram": "MZ",
            "NCT of Delhi": "DL",
            "Nagaland": "NL",
            "Odisha": "OR",
            "Puducherry": "PY",
            "Punjab": "PB",
            "Rajasthan": "RJ",
            "Sikkim": "SK",
            "Tamil Nadu": "TN",
            "Telangana": "TG",
            "Tripura": "TR",
            "Uttar Pradesh": "UP",
            "Uttarakhand": "UT",
            "West Bengal": "WB",
        }
        for feat in data["features"]:
            name = feat["properties"].get("ST_NM", "")
            iso = dm_name_to_iso.get(name)
            if not iso:
                continue
            state_dir = os.path.join(DATA_DIR, "IN", iso)
            if not os.path.isdir(state_dir):
                continue
            dest = os.path.join(state_dir, "boundaries-polygons-state.geojson")
            single = {"type": "FeatureCollection", "features": [feat]}
            write_geojson(dest, single)
            stats["state_outline"] += 1


def fill_district_polygons():
    """Copy per-state district polygons into state directories."""
    for folder_name, iso in DATAMEET_TO_ISO.items():
        state_dir = os.path.join(DATA_DIR, "IN", iso)
        if not os.path.isdir(state_dir):
            stats["skipped"] += 1
            continue

        # Look for district geojson in datameet
        district_dir = os.path.join(DATAMEET_SHAPES, "state_ut", folder_name, "district")
        if not os.path.isdir(district_dir):
            continue

        # Find the .json file
        json_files = [f for f in os.listdir(district_dir) if f.endswith(".json")]
        if not json_files:
            continue

        src = os.path.join(district_dir, json_files[0])
        with open(src) as f:
            data = json.load(f)

        dest = os.path.join(state_dir, "boundaries-polygons.geojson")
        write_geojson(dest, data)
        n = len(data.get("features", []))
        stats["district"] += 1
        print(f"  {iso}: {n} district polygons")


def fill_city_ward_polygons():
    """Copy city ward polygons from Municipal_Spatial_Data."""
    if not os.path.isdir(DATAMEET_MUNICIPAL):
        print("SKIP: Municipal_Spatial_Data not cloned")
        return

    for city_folder, (state_code, city_code, ward_file) in MUNICIPAL_CITIES.items():
        src = os.path.join(DATAMEET_MUNICIPAL, city_folder, ward_file)
        if not os.path.exists(src):
            print(f"  SKIP: {city_folder}/{ward_file} not found")
            stats["skipped"] += 1
            continue

        try:
            with open(src) as f:
                data = json.load(f)
        except json.JSONDecodeError:
            print(f"  SKIP: {city_folder}/{ward_file} invalid JSON")
            stats["skipped"] += 1
            continue

        # Save to data/IN/{STATE}/{CITY}/boundaries-polygons-wards.geojson
        city_dir = os.path.join(DATA_DIR, "IN", state_code, city_code)
        os.makedirs(city_dir, exist_ok=True)
        dest = os.path.join(city_dir, "boundaries-polygons-wards.geojson")
        write_geojson(dest, data)
        n = len(data.get("features", []))
        stats["city_ward"] += 1
        print(f"  {city_folder} ({state_code}/{city_code}): {n} ward polygons")

        # Also copy boundary file if available
        for bname in [
            f"{city_folder}_Boundary.geojson",
            f"{city_folder.lower()}_Boundary.geojson",
            "ghmc-area.geojson",
            "CMA.geojson",
            "KCH_Corporation_Boundary.geojson",
            "BMC Boundary.GeoJSON",
        ]:
            bsrc = os.path.join(DATAMEET_MUNICIPAL, city_folder, bname)
            if os.path.exists(bsrc):
                try:
                    with open(bsrc) as f:
                        bdata = json.load(f)
                    bdest = os.path.join(city_dir, "boundaries-polygons-boundary.geojson")
                    write_geojson(bdest, bdata)
                    print(f"    + boundary polygon")
                except json.JSONDecodeError:
                    pass
                break


def main():
    print("=" * 60)
    print("Filling polygon data from datameet repos")
    print("=" * 60)

    print("\n1. Country-level (all state polygons):")
    fill_country_polygons()

    print("\n2. State outlines (individual state polygons):")
    fill_state_outlines()

    print("\n3. District polygons (per state):")
    fill_district_polygons()

    print("\n4. City ward polygons:")
    fill_city_ward_polygons()

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Country polygons:  {stats['country']}")
    print(f"  State outlines:    {stats['state_outline']}")
    print(f"  District polygons: {stats['district']}")
    print(f"  City ward files:   {stats['city_ward']}")
    print(f"  Skipped:           {stats['skipped']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
