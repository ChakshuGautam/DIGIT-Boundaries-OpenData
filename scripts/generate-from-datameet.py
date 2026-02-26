#!/usr/bin/env python3
"""
Generate DIGIT boundary files for ALL Indian states directly from datameet shapefiles.
No AI agent needed — extracts centroids from polygons.

Takes ~10 seconds for all 35 states.
"""

import json
import os
import re
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DATAMEET_SHAPES = "/tmp/datameet-shapefiles"

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

# ---------------------------------------------------------------------------
# Mappings
# ---------------------------------------------------------------------------

# datameet folder → ISO state code
FOLDER_TO_ISO = {
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

# ISO code → (full name, tenantId segment)
STATE_INFO = {
    "AN": ("Andaman and Nicobar Islands", "andamanandnicobarislands"),
    "AP": ("Andhra Pradesh", "andhrapradesh"),
    "AR": ("Arunachal Pradesh", "arunachalpradesh"),
    "AS": ("Assam", "assam"),
    "BR": ("Bihar", "bihar"),
    "CH": ("Chandigarh", "chandigarh"),
    "CT": ("Chhattisgarh", "chhattisgarh"),
    "DD": ("Daman and Diu", "damananddiu"),
    "DH": ("Dadra and Nagar Haveli and Daman and Diu", "dadraandnagarhaveliandamananddiu"),
    "DL": ("Delhi", "delhi"),
    "GA": ("Goa", "goa"),
    "GJ": ("Gujarat", "gujarat"),
    "HR": ("Haryana", "haryana"),
    "HP": ("Himachal Pradesh", "himachalpradesh"),
    "JK": ("Jammu and Kashmir", "jammuandkashmir"),
    "JH": ("Jharkhand", "jharkhand"),
    "KA": ("Karnataka", "karnataka"),
    "KL": ("Kerala", "kerala"),
    "LA": ("Ladakh", "ladakh"),
    "LD": ("Lakshadweep", "lakshadweep"),
    "MP": ("Madhya Pradesh", "madhyapradesh"),
    "MH": ("Maharashtra", "maharashtra"),
    "MN": ("Manipur", "manipur"),
    "ML": ("Meghalaya", "meghalaya"),
    "MZ": ("Mizoram", "mizoram"),
    "NL": ("Nagaland", "nagaland"),
    "OR": ("Odisha", "odisha"),
    "PY": ("Puducherry", "puducherry"),
    "PB": ("Punjab", "punjab"),
    "RJ": ("Rajasthan", "rajasthan"),
    "SK": ("Sikkim", "sikkim"),
    "TN": ("Tamil Nadu", "tamilnadu"),
    "TG": ("Telangana", "telangana"),
    "TR": ("Tripura", "tripura"),
    "UT": ("Uttarakhand", "uttarakhand"),
    "UP": ("Uttar Pradesh", "uttarpradesh"),
    "WB": ("West Bengal", "westbengal"),
}


def centroid(geometry):
    """Compute centroid of a GeoJSON geometry (simple average of all coords)."""
    coords = []
    _extract_coords(geometry["coordinates"], geometry["type"], coords)
    if not coords:
        return [0, 0]
    lon = sum(c[0] for c in coords) / len(coords)
    lat = sum(c[1] for c in coords) / len(coords)
    return [round(lon, 6), round(lat, 6)]


def _extract_coords(data, geom_type, out):
    if geom_type == "Point":
        out.append(data)
    elif geom_type == "Polygon":
        for ring in data:
            out.extend(ring)
    elif geom_type == "MultiPolygon":
        for polygon in data:
            for ring in polygon:
                out.extend(ring)
    elif geom_type == "MultiPoint":
        out.extend(data)
    elif geom_type == "LineString":
        out.extend(data)
    elif geom_type == "MultiLineString":
        for line in data:
            out.extend(line)


def make_code(state_iso, district_name):
    """Generate a 2-4 letter district abbreviation."""
    name = district_name.strip()
    # Remove common suffixes/prefixes
    clean = re.sub(r'\s+', ' ', name)
    words = clean.split()

    if len(words) == 1:
        abbr = words[0][:3].upper()
    elif len(words) == 2:
        abbr = (words[0][0] + words[1][:2]).upper()
    else:
        abbr = "".join(w[0] for w in words[:3]).upper()

    return f"{state_iso}_{abbr}"


def make_tenant_id(state_tenant, district_name):
    """Generate tenant ID from district name."""
    clean = re.sub(r'[^a-zA-Z\s]', '', district_name.strip().lower())
    clean = re.sub(r'\s+', '', clean)
    return f"in.{state_tenant}.{clean}"


def generate_state(state_iso, state_name, state_tenant, districts_geojson):
    """Generate DIGIT files for a single state."""
    state_dir = os.path.join(DATA_DIR, "IN", state_iso)
    os.makedirs(state_dir, exist_ok=True)

    features = districts_geojson.get("features", [])
    if not features:
        return 0

    # Build boundaries-flat.json
    boundaries = []
    relationships = []
    used_codes = set()

    # State entry
    state_centroid = centroid(features[0]["geometry"])  # will recalc below
    all_lons, all_lats = [], []

    for feat in features:
        props = feat["properties"]
        district_name = props.get("district", props.get("DISTRICT", props.get("NAME_2", "Unknown")))
        if not district_name or district_name == "Unknown":
            # Try other property keys
            for k in props:
                if "name" in k.lower() or "dist" in k.lower():
                    district_name = props[k]
                    break

        c = centroid(feat["geometry"])
        all_lons.append(c[0])
        all_lats.append(c[1])

        code = make_code(state_iso, district_name)
        # Ensure unique
        base_code = code
        i = 2
        while code in used_codes:
            code = f"{base_code}{i}"
            i += 1
        used_codes.add(code)

        tenant = make_tenant_id(state_tenant, district_name)

        boundaries.append({
            "code": code,
            "tenantId": tenant,
            "geometry": {"type": "Point", "coordinates": c}
        })

        relationships.append({
            "tenantId": tenant,
            "code": code,
            "hierarchyType": "ADMIN",
            "boundaryType": "District",
            "parent": f"IN_{state_iso}" if len(state_iso) == 2 else state_iso
        })

    # State centroid = average of all district centroids
    if all_lons:
        state_centroid = [
            round(sum(all_lons) / len(all_lons), 6),
            round(sum(all_lats) / len(all_lats), 6)
        ]

    state_code = f"IN_{state_iso}"
    state_tenant_full = f"in.{state_tenant}"

    # Prepend state entry
    boundaries.insert(0, {
        "code": state_code,
        "tenantId": state_tenant_full,
        "geometry": {"type": "Point", "coordinates": state_centroid}
    })

    relationships.insert(0, {
        "tenantId": state_tenant_full,
        "code": state_code,
        "hierarchyType": "ADMIN",
        "boundaryType": "State",
        "parent": "IN"
    })

    # Write boundaries-flat.json
    with open(os.path.join(state_dir, "boundaries-flat.json"), "w") as f:
        json.dump(boundaries, f, indent=2)

    # Write boundary-relationships.json
    with open(os.path.join(state_dir, "boundary-relationships.json"), "w") as f:
        json.dump(relationships, f, indent=2)

    # Write metadata.json
    metadata = {
        "name": state_name,
        "code": state_code,
        "level": "state",
        "isoCode": f"IN-{state_iso}",
        "parentCode": "IN",
        "tenantId": state_tenant_full,
        "generatedAt": NOW,
        "sources": [
            {
                "name": "datameet/shapefiles - Indian District Boundaries",
                "url": "https://github.com/datameet/shapefiles",
                "accessedAt": NOW
            }
        ]
    }
    with open(os.path.join(state_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    return len(features)


def main():
    print("=" * 60)
    print("Generating DIGIT files from datameet shapefiles")
    print("=" * 60)

    total_states = 0
    total_districts = 0
    skipped_existing = 0
    skipped_nodata = 0

    for folder_name, state_iso in sorted(FOLDER_TO_ISO.items(), key=lambda x: x[1]):
        state_dir = os.path.join(DATA_DIR, "IN", state_iso)
        state_info = STATE_INFO.get(state_iso)
        if not state_info:
            print(f"  SKIP {state_iso}: no state info")
            skipped_nodata += 1
            continue

        state_name, state_tenant = state_info

        # Check if already has agent-generated data (with sources)
        meta_path = os.path.join(state_dir, "metadata.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path) as f:
                    meta = json.load(f)
                sources = meta.get("sources", [])
                # If has multiple sources (agent-generated), skip
                if len(sources) > 1:
                    print(f"  SKIP {state_iso} ({state_name}): already has agent-generated data")
                    skipped_existing += 1
                    continue
            except (json.JSONDecodeError, KeyError):
                pass

        # Find district GeoJSON
        district_dir = os.path.join(DATAMEET_SHAPES, "state_ut", folder_name, "district")
        if not os.path.isdir(district_dir):
            # Try all-India district file, filter by state
            all_districts = os.path.join(DATAMEET_SHAPES, "india", "district", "india_district.json")
            if os.path.exists(all_districts):
                with open(all_districts) as f:
                    all_data = json.load(f)
                # datameet state names in the all-india file
                dm_names = {
                    "AN": ["Andaman & Nicobar Island"],
                    "AP": ["Andhra Pradesh"],
                    "AR": ["Arunanchal Pradesh", "Arunachal Pradesh"],
                    "AS": ["Assam"],
                    "BR": ["Bihar"],
                    "CH": ["Chandigarh"],
                    "CT": ["Chhattisgarh"],
                    "DH": ["Dadara & Nagar Havelli"],
                    "DD": ["Daman & Diu"],
                    "DL": ["NCT of Delhi"],
                    "GA": ["Goa"],
                    "GJ": ["Gujarat"],
                    "HR": ["Haryana"],
                    "HP": ["Himachal Pradesh"],
                    "JK": ["Jammu & Kashmir"],
                    "JH": ["Jharkhand"],
                    "KA": ["Karnataka"],
                    "KL": ["Kerala"],
                    "LD": ["Lakshadweep"],
                    "MP": ["Madhya Pradesh"],
                    "MH": ["Maharashtra"],
                    "MN": ["Manipur"],
                    "ML": ["Meghalaya"],
                    "MZ": ["Mizoram"],
                    "NL": ["Nagaland"],
                    "OR": ["Odisha", "Orissa"],
                    "PY": ["Puducherry"],
                    "PB": ["Punjab"],
                    "RJ": ["Rajasthan"],
                    "SK": ["Sikkim"],
                    "TN": ["Tamil Nadu"],
                    "TG": ["Telangana"],
                    "TR": ["Tripura"],
                    "UT": ["Uttarakhand", "Uttaranchal"],
                    "UP": ["Uttar Pradesh"],
                    "WB": ["West Bengal"],
                }
                names = dm_names.get(state_iso, [])
                filtered = [f for f in all_data["features"] if f["properties"].get("st_nm", "") in names]
                if filtered:
                    districts_data = {"type": "FeatureCollection", "features": filtered}
                    n = generate_state(state_iso, state_name, state_tenant, districts_data)
                    print(f"  {state_iso} {state_name}: {n} districts (from all-india file)")
                    total_states += 1
                    total_districts += n
                    continue

            print(f"  SKIP {state_iso} ({state_name}): no district shapefile")
            skipped_nodata += 1
            continue

        # Read per-state district file
        json_files = [f for f in os.listdir(district_dir) if f.endswith(".json")]
        if not json_files:
            print(f"  SKIP {state_iso} ({state_name}): no JSON in district dir")
            skipped_nodata += 1
            continue

        with open(os.path.join(district_dir, json_files[0])) as f:
            districts_data = json.load(f)

        n = generate_state(state_iso, state_name, state_tenant, districts_data)
        print(f"  {state_iso} {state_name}: {n} districts")
        total_states += 1
        total_districts += n

    # Handle special cases not in datameet
    # Ladakh (LA) - not in datameet, part of old J&K
    # Telangana (TG) - only assembly constituencies in datameet, no districts

    print()
    print("=" * 60)
    print(f"Generated: {total_states} states, {total_districts} districts")
    print(f"Skipped (already has agent data): {skipped_existing}")
    print(f"Skipped (no datameet data): {skipped_nodata}")
    print("=" * 60)


if __name__ == "__main__":
    main()
