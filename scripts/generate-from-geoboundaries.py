#!/usr/bin/env python3
"""
Generate DIGIT boundary files for ALL countries from geoBoundaries data.

Downloads ADM1/ADM2/ADM3 GeoJSON from geoBoundaries API and generates
DIGIT-compatible boundary hierarchy files. Uses point-in-polygon (ray casting)
to determine parent-child relationships.

Usage:
  python3 scripts/generate-from-geoboundaries.py                    # All countries
  python3 scripts/generate-from-geoboundaries.py KE ET              # Specific countries (ISO3)
  python3 scripts/generate-from-geoboundaries.py --skip IN KE ET    # Skip already-done countries

Prerequisites:
  python3 -c "
  import json, urllib.request
  metadata = {}
  for level in ['ADM0','ADM1','ADM2','ADM3']:
      url = f'https://www.geoboundaries.org/api/current/gbOpen/ALL/{level}/'
      with urllib.request.urlopen(url) as resp:
          data = json.loads(resp.read())
      for entry in data:
          iso3 = entry.get('boundaryISO','')
          if iso3 not in metadata: metadata[iso3] = {}
          metadata[iso3][level] = {'gjDownloadURL': entry.get('gjDownloadURL','')}
  with open('/tmp/geoboundaries-metadata.json','w') as f:
      json.dump(metadata, f, indent=2)
  print(f'Cached {len(metadata)} countries')
  "

Sources:
  - geoBoundaries (wmgeolab): ODbL license
  - https://www.geoboundaries.org/
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_DIR = "/tmp/geoboundaries-cache"
METADATA_FILE = "/tmp/geoboundaries-metadata.json"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

# ISO3 → ISO2 mapping (built from geoBoundaries shapeGroup field)
# We'll build this dynamically, but need a static fallback for common ones
ISO3_TO_ISO2 = {}

# ADM level type names per country (defaults, can be overridden)
DEFAULT_LEVEL_NAMES = {
    "adm1": "State",
    "adm2": "District",
    "adm3": "Sub-District",
}

# Country-specific level names
COUNTRY_LEVEL_NAMES = {
    "KEN": {"adm1": "County", "adm2": "Sub-County", "adm3": "Ward"},
    "ETH": {"adm1": "Region", "adm2": "Zone", "adm3": "Woreda"},
    "IND": {"adm1": "State", "adm2": "District", "adm3": "Sub-District"},
    "USA": {"adm1": "State", "adm2": "County", "adm3": "Township"},
    "GBR": {"adm1": "Country", "adm2": "County", "adm3": "District"},
    "NGA": {"adm1": "State", "adm2": "LGA", "adm3": "Ward"},
    "ZAF": {"adm1": "Province", "adm2": "District", "adm3": "Municipality"},
    "BRA": {"adm1": "State", "adm2": "Municipality"},
    "MEX": {"adm1": "State", "adm2": "Municipality"},
    "DEU": {"adm1": "State", "adm2": "District", "adm3": "Municipality"},
    "FRA": {"adm1": "Region", "adm2": "Department", "adm3": "Arrondissement"},
    "CHN": {"adm1": "Province", "adm2": "Prefecture", "adm3": "County"},
    "JPN": {"adm1": "Prefecture", "adm2": "City"},
    "AUS": {"adm1": "State", "adm2": "LGA"},
    "CAN": {"adm1": "Province", "adm2": "Census Division"},
    "PAK": {"adm1": "Province", "adm2": "District", "adm3": "Tehsil"},
    "BGD": {"adm1": "Division", "adm2": "District", "adm3": "Upazila"},
    "IDN": {"adm1": "Province", "adm2": "Regency", "adm3": "District"},
    "PHL": {"adm1": "Region", "adm2": "Province", "adm3": "Municipality"},
    "TZA": {"adm1": "Region", "adm2": "District", "adm3": "Ward"},
    "UGA": {"adm1": "Region", "adm2": "District", "adm3": "County"},
    "GHA": {"adm1": "Region", "adm2": "District"},
    "RWA": {"adm1": "Province", "adm2": "District", "adm3": "Sector"},
}


def load_iso3_to_iso2():
    """Build ISO3→ISO2 mapping from countries.ts or a static table."""
    global ISO3_TO_ISO2
    # Try to extract from src/countries.ts
    countries_file = os.path.join(os.path.dirname(__file__), "..", "src", "countries.ts")
    if os.path.exists(countries_file):
        with open(countries_file) as f:
            content = f.read()
        # Parse ["alpha2", "alpha3", "name"] tuples
        for m in re.finditer(r'\["(\w{2})",\s*"(\w{3})",\s*"([^"]+)"\]', content):
            ISO3_TO_ISO2[m.group(2)] = m.group(1)
    if not ISO3_TO_ISO2:
        # Minimal fallback
        ISO3_TO_ISO2.update({
            "KEN": "KE", "ETH": "ET", "IND": "IN", "USA": "US", "GBR": "GB",
            "NGA": "NG", "ZAF": "ZA", "BRA": "BR", "MEX": "MX",
        })


# ---------------------------------------------------------------------------
# Geometry helpers (same as before)
# ---------------------------------------------------------------------------

def centroid(geometry):
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


def point_in_polygon(point, polygon_coords):
    x, y = point
    inside = False
    for ring in polygon_coords:
        n = len(ring)
        j = n - 1
        for i in range(n):
            xi, yi = ring[i][0], ring[i][1]
            xj, yj = ring[j][0], ring[j][1]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
    return inside


def point_in_geometry(point, geometry):
    geom_type = geometry["type"]
    coords = geometry["coordinates"]
    if geom_type == "Polygon":
        return point_in_polygon(point, coords)
    elif geom_type == "MultiPolygon":
        return any(point_in_polygon(point, poly) for poly in coords)
    return False


# ---------------------------------------------------------------------------
# Name / code helpers
# ---------------------------------------------------------------------------

def make_code(parent_code, name):
    clean = re.sub(r'\s+', ' ', name.strip())
    words = clean.split()
    if len(words) == 1:
        abbr = words[0][:4].upper()
    elif len(words) == 2:
        abbr = (words[0][:2] + words[1][:2]).upper()
    else:
        abbr = "".join(w[0] for w in words[:4]).upper()
    abbr = re.sub(r'[^A-Z0-9]', '', abbr)
    if not abbr:
        abbr = "UNK"
    return f"{parent_code}_{abbr}"


def make_tenant(parent_tenant, name):
    clean = re.sub(r'[^a-zA-Z\s]', '', name.strip().lower())
    clean = re.sub(r'\s+', '', clean)
    if not clean:
        clean = "unknown"
    return f"{parent_tenant}.{clean}"


# ---------------------------------------------------------------------------
# Download helper
# ---------------------------------------------------------------------------

def download_geojson(url, cache_path):
    """Download GeoJSON with caching."""
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            return json.load(f)

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DIGIT-Boundaries/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        with open(cache_path, "w") as f:
            json.dump(data, f)
        return data
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as e:
        print(f"    WARN: Failed to download {url}: {e}")
        return None


# ---------------------------------------------------------------------------
# Parent assignment via spatial containment
# ---------------------------------------------------------------------------

def assign_parents(child_features, parent_features):
    children_with_centroids = [(feat, centroid(feat["geometry"])) for feat in child_features]
    parent_centroids = [centroid(f["geometry"]) for f in parent_features]

    assignments = {}
    unassigned = []

    for ci, (child_feat, child_centroid) in enumerate(children_with_centroids):
        found = False
        for pi, parent_feat in enumerate(parent_features):
            if point_in_geometry(child_centroid, parent_feat["geometry"]):
                assignments[ci] = pi
                found = True
                break
        if not found:
            unassigned.append(ci)

    # Nearest centroid fallback
    for ci in unassigned:
        _, child_c = children_with_centroids[ci]
        min_dist = float('inf')
        best_pi = 0
        for pi, pc in enumerate(parent_centroids):
            dist = (child_c[0] - pc[0]) ** 2 + (child_c[1] - pc[1]) ** 2
            if dist < min_dist:
                min_dist = dist
                best_pi = pi
        assignments[ci] = best_pi

    return assignments


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------

def generate_country(iso3, api_meta):
    """Generate DIGIT files for a single country."""
    iso2 = ISO3_TO_ISO2.get(iso3, "")
    if not iso2:
        # Try to get from the GeoJSON shapeGroup field later
        pass

    level_names = COUNTRY_LEVEL_NAMES.get(iso3, DEFAULT_LEVEL_NAMES)

    # Download available levels
    level_data = {}
    for adm_level in ["ADM1", "ADM2", "ADM3"]:
        if adm_level not in api_meta:
            continue
        url = api_meta[adm_level].get("gjDownloadURL", "")
        if not url:
            continue

        cache_path = os.path.join(CACHE_DIR, iso3, f"{adm_level.lower()}.geojson")
        data = download_geojson(url, cache_path)
        if data and "features" in data and len(data["features"]) > 0:
            level_data[adm_level.lower()] = data
            # Extract ISO2 from shapeGroup if not known
            if not iso2:
                iso2 = data["features"][0]["properties"].get("shapeGroup", "")

    if not iso2:
        print(f"  SKIP {iso3}: cannot determine ISO2 code")
        return None

    if "adm1" not in level_data:
        print(f"  SKIP {iso3} ({iso2}): no ADM1 data")
        return None

    country_name = api_meta.get("ADM1", {}).get("boundaryName", iso3)
    if not country_name or country_name == iso3:
        country_name = api_meta.get("ADM0", {}).get("boundaryName", iso3)
    tenant = country_name.lower().replace(" ", "").replace("'", "")
    tenant = re.sub(r'[^a-z]', '', tenant)

    adm1_features = level_data["adm1"]["features"]

    print(f"  {iso2} {country_name}: {len(adm1_features)} {level_names.get('adm1','ADM1')}s", end="")
    if "adm2" in level_data:
        print(f", {len(level_data['adm2']['features'])} {level_names.get('adm2','ADM2')}s", end="")
    if "adm3" in level_data:
        print(f", {len(level_data['adm3']['features'])} {level_names.get('adm3','ADM3')}s", end="")
    print()

    # --- Country-level files ---
    country_dir = os.path.join(DATA_DIR, iso2)
    os.makedirs(country_dir, exist_ok=True)

    adm1_centroids = [centroid(f["geometry"]) for f in adm1_features]
    country_centroid = [
        round(sum(c[0] for c in adm1_centroids) / len(adm1_centroids), 6),
        round(sum(c[1] for c in adm1_centroids) / len(adm1_centroids), 6),
    ]

    boundaries = [{"code": iso2, "tenantId": tenant, "geometry": {"type": "Point", "coordinates": country_centroid}}]
    relationships = [{"tenantId": tenant, "code": iso2, "hierarchyType": "ADMIN", "boundaryType": "Country", "parent": None}]

    used_codes = {iso2}
    adm1_code_map = {}
    adm1_tenant_map = {}

    for i, feat in enumerate(adm1_features):
        feat_name = feat["properties"].get("shapeName") or f"Region {i+1}"
        feat_iso = feat["properties"].get("shapeISO") or ""

        if feat_iso and "-" in feat_iso:
            code = f"{iso2}_{feat_iso.split('-')[1]}"
        else:
            code = make_code(iso2, feat_name)

        base_code = code
        j = 2
        while code in used_codes:
            code = f"{base_code}{j}"
            j += 1
        used_codes.add(code)
        adm1_code_map[i] = code

        t = make_tenant(tenant, feat_name)
        adm1_tenant_map[i] = t

        boundaries.append({"code": code, "tenantId": t, "geometry": {"type": "Point", "coordinates": adm1_centroids[i]}})
        relationships.append({
            "tenantId": t, "code": code, "hierarchyType": "ADMIN",
            "boundaryType": level_names.get("adm1", "State"), "parent": iso2
        })

    with open(os.path.join(country_dir, "boundaries-flat.json"), "w") as f:
        json.dump(boundaries, f, indent=2)
    with open(os.path.join(country_dir, "boundary-relationships.json"), "w") as f:
        json.dump(relationships, f, indent=2)

    # Hierarchy definition
    hier_levels = [
        {"level": 0, "boundaryType": "Country"},
        {"level": 1, "boundaryType": level_names.get("adm1", "State")},
    ]
    if "adm2" in level_data:
        hier_levels.append({"level": 2, "boundaryType": level_names.get("adm2", "District")})
    if "adm3" in level_data:
        hier_levels.append({"level": 3, "boundaryType": level_names.get("adm3", "Sub-District")})

    hierarchy = {
        "tenantId": tenant,
        "moduleName": "module-common",
        "hierarchyType": [{"type": "ADMIN", "levels": hier_levels}]
    }
    with open(os.path.join(country_dir, "hierarchy-definition.json"), "w") as f:
        json.dump(hierarchy, f, indent=2)

    metadata = {
        "name": country_name, "code": iso2, "level": "country",
        "isoCode": iso2, "iso3Code": iso3, "parentCode": None, "tenantId": tenant,
        "generatedAt": NOW,
        "sources": [{
            "name": f"geoBoundaries - {country_name} Administrative Boundaries",
            "url": "https://www.geoboundaries.org/index.html#getdata",
            "license": "ODbL",
            "accessedAt": NOW
        }]
    }
    with open(os.path.join(country_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    # Country-level polygons
    with open(os.path.join(country_dir, "boundaries-polygons.geojson"), "w") as f:
        json.dump(level_data["adm1"], f)

    stats = {"adm1": len(adm1_features), "adm2": 0, "adm3": 0}

    # --- ADM2 processing ---
    adm2_code_map = {}
    adm2_tenant_map = {}
    adm2_to_adm1 = {}
    adm1_children = {}

    if "adm2" in level_data:
        adm2_features = level_data["adm2"]["features"]
        adm2_to_adm1 = assign_parents(adm2_features, adm1_features)

        for ci, pi in adm2_to_adm1.items():
            adm1_children.setdefault(pi, []).append(ci)

        for pi, child_indices in sorted(adm1_children.items()):
            adm1_code = adm1_code_map[pi]
            adm1_tenant = adm1_tenant_map[pi]
            adm1_name = adm1_features[pi]["properties"].get("shapeName") or f"Region {pi+1}"
            state_dir = os.path.join(country_dir, adm1_code.replace(f"{iso2}_", ""))
            os.makedirs(state_dir, exist_ok=True)

            s_boundaries = [{"code": adm1_code, "tenantId": adm1_tenant, "geometry": {"type": "Point", "coordinates": adm1_centroids[pi]}}]
            s_relationships = [{"tenantId": adm1_tenant, "code": adm1_code, "hierarchyType": "ADMIN", "boundaryType": level_names.get("adm1", "State"), "parent": iso2}]
            s_used = {adm1_code}
            s_polygon_features = []

            for ci in child_indices:
                feat = adm2_features[ci]
                feat_name = feat["properties"].get("shapeName") or f"Area {ci+1}"
                c = centroid(feat["geometry"])

                code = make_code(adm1_code, feat_name)
                base = code
                j = 2
                while code in s_used:
                    code = f"{base}{j}"
                    j += 1
                s_used.add(code)
                adm2_code_map[ci] = code

                t = make_tenant(adm1_tenant, feat_name)
                adm2_tenant_map[ci] = t

                s_boundaries.append({"code": code, "tenantId": t, "geometry": {"type": "Point", "coordinates": c}})
                s_relationships.append({
                    "tenantId": t, "code": code, "hierarchyType": "ADMIN",
                    "boundaryType": level_names.get("adm2", "District"), "parent": adm1_code
                })
                s_polygon_features.append(feat)

            with open(os.path.join(state_dir, "boundaries-flat.json"), "w") as f:
                json.dump(s_boundaries, f, indent=2)
            with open(os.path.join(state_dir, "boundary-relationships.json"), "w") as f:
                json.dump(s_relationships, f, indent=2)

            s_meta = {
                "name": adm1_name, "code": adm1_code,
                "level": level_names.get("adm1", "state").lower(),
                "isoCode": adm1_features[pi]["properties"].get("shapeISO", f"{iso2}-{adm1_code.replace(f'{iso2}_', '')}"),
                "parentCode": iso2, "tenantId": adm1_tenant,
                "generatedAt": NOW,
                "sources": [{"name": f"geoBoundaries - {country_name}", "url": "https://www.geoboundaries.org/index.html#getdata", "license": "ODbL", "accessedAt": NOW}]
            }
            with open(os.path.join(state_dir, "metadata.json"), "w") as f:
                json.dump(s_meta, f, indent=2)

            polygon_fc = {"type": "FeatureCollection", "features": s_polygon_features}
            with open(os.path.join(state_dir, "boundaries-polygons.geojson"), "w") as f:
                json.dump(polygon_fc, f)

            state_outline = {"type": "FeatureCollection", "features": [adm1_features[pi]]}
            with open(os.path.join(state_dir, "boundaries-polygons-state.geojson"), "w") as f:
                json.dump(state_outline, f)

        stats["adm2"] = len(adm2_features)

    # --- ADM3 processing ---
    if "adm3" in level_data and "adm2" in level_data:
        adm3_features = level_data["adm3"]["features"]
        adm2_features = level_data["adm2"]["features"]
        adm3_to_adm2 = assign_parents(adm3_features, adm2_features)

        adm2_children = {}
        for ci, pi in adm3_to_adm2.items():
            adm2_children.setdefault(pi, []).append(ci)

        for pi_adm1, child_adm2_indices in sorted(adm1_children.items()):
            adm1_code = adm1_code_map[pi_adm1]
            state_dir = os.path.join(country_dir, adm1_code.replace(f"{iso2}_", ""))

            bf_path = os.path.join(state_dir, "boundaries-flat.json")
            br_path = os.path.join(state_dir, "boundary-relationships.json")
            if not os.path.exists(bf_path):
                continue

            with open(bf_path) as f:
                s_boundaries = json.load(f)
            with open(br_path) as f:
                s_relationships = json.load(f)

            s_used = {b["code"] for b in s_boundaries}

            for ci_adm2 in child_adm2_indices:
                adm2_code = adm2_code_map.get(ci_adm2)
                adm2_tenant_val = adm2_tenant_map.get(ci_adm2)
                if not adm2_code:
                    continue

                for ci_adm3 in adm2_children.get(ci_adm2, []):
                    feat = adm3_features[ci_adm3]
                    feat_name = feat["properties"].get("shapeName") or f"Area {ci+1}"
                    c = centroid(feat["geometry"])

                    code = make_code(adm2_code, feat_name)
                    base = code
                    j = 2
                    while code in s_used:
                        code = f"{base}{j}"
                        j += 1
                    s_used.add(code)

                    t = make_tenant(adm2_tenant_val, feat_name)

                    s_boundaries.append({"code": code, "tenantId": t, "geometry": {"type": "Point", "coordinates": c}})
                    s_relationships.append({
                        "tenantId": t, "code": code, "hierarchyType": "ADMIN",
                        "boundaryType": level_names.get("adm3", "Sub-District"), "parent": adm2_code
                    })

            with open(bf_path, "w") as f:
                json.dump(s_boundaries, f, indent=2)
            with open(br_path, "w") as f:
                json.dump(s_relationships, f, indent=2)

        stats["adm3"] = len(adm3_features)

    return stats


def main():
    load_iso3_to_iso2()

    # Load API metadata
    if not os.path.exists(METADATA_FILE):
        print(f"ERROR: {METADATA_FILE} not found. Run the cache command first (see docstring).")
        sys.exit(1)

    with open(METADATA_FILE) as f:
        all_metadata = json.load(f)

    # Parse args
    skip_set = set()
    only_set = set()
    args = sys.argv[1:]
    if "--skip" in args:
        skip_idx = args.index("--skip")
        skip_set = set(args[skip_idx + 1:])
        args = args[:skip_idx]
    if args:
        only_set = set(args)

    # Filter countries
    countries_to_process = []
    for iso3, meta in sorted(all_metadata.items()):
        if "ADM1" not in meta:
            continue
        iso2 = ISO3_TO_ISO2.get(iso3, "")
        if iso2 in skip_set or iso3 in skip_set:
            continue
        if only_set and iso3 not in only_set and iso2 not in only_set:
            continue
        countries_to_process.append((iso3, meta))

    print(f"{'=' * 60}")
    print(f"Generating DIGIT files from geoBoundaries")
    print(f"Countries to process: {len(countries_to_process)}")
    print(f"{'=' * 60}")

    total = {"countries": 0, "adm1": 0, "adm2": 0, "adm3": 0, "skipped": 0, "failed": 0}

    for i, (iso3, meta) in enumerate(countries_to_process):
        iso2 = ISO3_TO_ISO2.get(iso3, "")
        print(f"\n[{i+1}/{len(countries_to_process)}] {iso3} ({iso2 or '??'}):")

        try:
            stats = generate_country(iso3, meta)
            if stats:
                total["countries"] += 1
                total["adm1"] += stats["adm1"]
                total["adm2"] += stats["adm2"]
                total["adm3"] += stats["adm3"]
            else:
                total["skipped"] += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            total["failed"] += 1

    print(f"\n{'=' * 60}")
    print(f"Summary:")
    print(f"  Countries:  {total['countries']}")
    print(f"  ADM1:       {total['adm1']}")
    print(f"  ADM2:       {total['adm2']}")
    print(f"  ADM3:       {total['adm3']}")
    print(f"  Skipped:    {total['skipped']}")
    print(f"  Failed:     {total['failed']}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
