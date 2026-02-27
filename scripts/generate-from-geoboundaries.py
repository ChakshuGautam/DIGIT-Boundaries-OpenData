#!/usr/bin/env python3
"""
Generate DIGIT boundary files for Kenya and Ethiopia from geoBoundaries data.

Uses point-in-polygon (ray casting) to determine parent-child relationships
since geoBoundaries doesn't encode hierarchy in the data.

Sources:
  - geoBoundaries (wmgeolab): ADM1/ADM2/ADM3 polygons, ODbL license
"""

import json
import os
import re
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

# ---------------------------------------------------------------------------
# Country configs
# ---------------------------------------------------------------------------
COUNTRIES = {
    "KE": {
        "name": "Kenya",
        "iso3": "KEN",
        "data_dir": "/tmp/kenya-boundaries",
        "tenant": "kenya",
        "levels": {
            "adm1": {"type": "County", "file": "adm1.geojson"},
            "adm2": {"type": "Sub-County", "file": "adm2.geojson"},
            "adm3": {"type": "Ward", "file": "adm3.geojson"},
        },
    },
    "ET": {
        "name": "Ethiopia",
        "iso3": "ETH",
        "data_dir": "/tmp/ethiopia-boundaries",
        "tenant": "ethiopia",
        "levels": {
            "adm1": {"type": "Region", "file": "adm1.geojson"},
            "adm2": {"type": "Zone", "file": "adm2.geojson"},
            "adm3": {"type": "Woreda", "file": "adm3.geojson"},
        },
    },
}


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

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


def point_in_polygon(point, polygon_coords):
    """Ray casting algorithm for point-in-polygon test."""
    x, y = point
    # Test against each ring (first is outer, rest are holes)
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
    """Test if a point is inside a GeoJSON geometry."""
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
    """Generate a boundary code from parent code and name."""
    clean = re.sub(r'\s+', ' ', name.strip())
    words = clean.split()
    if len(words) == 1:
        abbr = words[0][:4].upper()
    elif len(words) == 2:
        abbr = (words[0][:2] + words[1][:2]).upper()
    else:
        abbr = "".join(w[0] for w in words[:4]).upper()
    # Remove non-alphanumeric
    abbr = re.sub(r'[^A-Z0-9]', '', abbr)
    return f"{parent_code}_{abbr}"


def make_tenant(parent_tenant, name):
    """Generate tenant ID from name."""
    clean = re.sub(r'[^a-zA-Z\s]', '', name.strip().lower())
    clean = re.sub(r'\s+', '', clean)
    return f"{parent_tenant}.{clean}"


# ---------------------------------------------------------------------------
# Parent assignment via spatial containment
# ---------------------------------------------------------------------------

def assign_parents(child_features, parent_features):
    """Assign each child to its parent using point-in-polygon."""
    # Pre-compute child centroids
    children_with_centroids = []
    for feat in child_features:
        c = centroid(feat["geometry"])
        children_with_centroids.append((feat, c))

    # Map child index → parent index
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

    # For unassigned, find nearest parent centroid
    if unassigned:
        parent_centroids = [centroid(f["geometry"]) for f in parent_features]
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
            child_name = child_features[ci]["properties"]["shapeName"]
            parent_name = parent_features[best_pi]["properties"]["shapeName"]
            print(f"    WARN: '{child_name}' assigned to nearest '{parent_name}' (centroid outside all parents)")

    return assignments


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------

def generate_country(iso2, config):
    """Generate DIGIT files for a country."""
    name = config["name"]
    iso3 = config["iso3"]
    tenant = config["tenant"]
    data_dir = config["data_dir"]
    levels = config["levels"]

    print(f"\n{'=' * 60}")
    print(f"Generating {name} ({iso2})")
    print(f"{'=' * 60}")

    # Load all levels
    level_data = {}
    for level_key, level_info in levels.items():
        path = os.path.join(data_dir, level_info["file"])
        if not os.path.exists(path):
            print(f"  SKIP {level_key}: {path} not found")
            continue
        with open(path) as f:
            level_data[level_key] = json.load(f)
        print(f"  Loaded {level_key}: {len(level_data[level_key]['features'])} features")

    if "adm1" not in level_data:
        print(f"  ERROR: No ADM1 data for {name}")
        return

    adm1_features = level_data["adm1"]["features"]

    # --- Country-level files ---
    country_dir = os.path.join(DATA_DIR, iso2)
    os.makedirs(country_dir, exist_ok=True)

    # Country centroid from ADM1 centroids
    adm1_centroids = [centroid(f["geometry"]) for f in adm1_features]
    country_centroid = [
        round(sum(c[0] for c in adm1_centroids) / len(adm1_centroids), 6),
        round(sum(c[1] for c in adm1_centroids) / len(adm1_centroids), 6),
    ]

    country_code = iso2
    country_tenant = f"{tenant}"

    # Build ADM1 (state-level) boundaries
    boundaries = [{"code": country_code, "tenantId": country_tenant, "geometry": {"type": "Point", "coordinates": country_centroid}}]
    relationships = [{"tenantId": country_tenant, "code": country_code, "hierarchyType": "ADMIN", "boundaryType": "Country", "parent": None}]

    used_codes = {country_code}
    adm1_code_map = {}  # index → code
    adm1_tenant_map = {}  # index → tenant

    for i, feat in enumerate(adm1_features):
        feat_name = feat["properties"]["shapeName"]
        feat_iso = feat["properties"].get("shapeISO", "")
        c = adm1_centroids[i]

        # Use ISO code suffix if available
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

        t = make_tenant(country_tenant, feat_name)
        adm1_tenant_map[i] = t

        boundaries.append({"code": code, "tenantId": t, "geometry": {"type": "Point", "coordinates": c}})
        relationships.append({
            "tenantId": t, "code": code, "hierarchyType": "ADMIN",
            "boundaryType": levels["adm1"]["type"], "parent": country_code
        })

    # Write country-level files
    with open(os.path.join(country_dir, "boundaries-flat.json"), "w") as f:
        json.dump(boundaries, f, indent=2)
    with open(os.path.join(country_dir, "boundary-relationships.json"), "w") as f:
        json.dump(relationships, f, indent=2)

    hierarchy = {
        "tenantId": country_tenant,
        "moduleName": "module-common",
        "hierarchyType": [
            {
                "type": "ADMIN",
                "levels": [
                    {"level": 0, "boundaryType": "Country"},
                    {"level": 1, "boundaryType": levels["adm1"]["type"]},
                ]
            }
        ]
    }
    if "adm2" in levels:
        hierarchy["hierarchyType"][0]["levels"].append({"level": 2, "boundaryType": levels["adm2"]["type"]})
    if "adm3" in levels:
        hierarchy["hierarchyType"][0]["levels"].append({"level": 3, "boundaryType": levels["adm3"]["type"]})

    with open(os.path.join(country_dir, "hierarchy-definition.json"), "w") as f:
        json.dump(hierarchy, f, indent=2)

    metadata = {
        "name": name, "code": country_code, "level": "country",
        "isoCode": iso2, "parentCode": None, "tenantId": country_tenant,
        "generatedAt": NOW,
        "sources": [{
            "name": f"geoBoundaries - {name} Administrative Boundaries",
            "url": f"https://www.geoboundaries.org/index.html#getdata",
            "license": "ODbL",
            "accessedAt": NOW
        }]
    }
    with open(os.path.join(country_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    # Save country-level polygon
    with open(os.path.join(country_dir, "boundaries-polygons.geojson"), "w") as f:
        json.dump(level_data["adm1"], f)

    print(f"  Country: {len(adm1_features)} {levels['adm1']['type'].lower()}s")

    # --- ADM1-level (state/county/region) directories ---
    if "adm2" in level_data:
        adm2_features = level_data["adm2"]["features"]
        print(f"\n  Assigning {len(adm2_features)} {levels['adm2']['type'].lower()}s to {levels['adm1']['type'].lower()}s...")
        adm2_to_adm1 = assign_parents(adm2_features, adm1_features)

        # Group ADM2 by ADM1
        adm1_children = {}
        for ci, pi in adm2_to_adm1.items():
            adm1_children.setdefault(pi, []).append(ci)

        adm2_code_map = {}
        adm2_tenant_map = {}

        for pi, child_indices in sorted(adm1_children.items()):
            adm1_code = adm1_code_map[pi]
            adm1_tenant = adm1_tenant_map[pi]
            adm1_name = adm1_features[pi]["properties"]["shapeName"]
            state_dir = os.path.join(country_dir, adm1_code.replace(f"{iso2}_", ""))
            os.makedirs(state_dir, exist_ok=True)

            s_boundaries = [{"code": adm1_code, "tenantId": adm1_tenant, "geometry": {"type": "Point", "coordinates": adm1_centroids[pi]}}]
            s_relationships = [{"tenantId": adm1_tenant, "code": adm1_code, "hierarchyType": "ADMIN", "boundaryType": levels["adm1"]["type"], "parent": country_code}]
            s_used = {adm1_code}
            s_polygon_features = []

            for ci in child_indices:
                feat = adm2_features[ci]
                feat_name = feat["properties"]["shapeName"]
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
                    "boundaryType": levels["adm2"]["type"], "parent": adm1_code
                })
                s_polygon_features.append(feat)

            with open(os.path.join(state_dir, "boundaries-flat.json"), "w") as f:
                json.dump(s_boundaries, f, indent=2)
            with open(os.path.join(state_dir, "boundary-relationships.json"), "w") as f:
                json.dump(s_relationships, f, indent=2)

            s_meta = {
                "name": adm1_name, "code": adm1_code, "level": levels["adm1"]["type"].lower(),
                "isoCode": adm1_features[pi]["properties"].get("shapeISO", f"{iso2}-{adm1_code.replace(f'{iso2}_','')}"),
                "parentCode": country_code, "tenantId": adm1_tenant,
                "generatedAt": NOW,
                "sources": [{
                    "name": f"geoBoundaries - {name} Administrative Boundaries",
                    "url": f"https://www.geoboundaries.org/index.html#getdata",
                    "license": "ODbL",
                    "accessedAt": NOW
                }]
            }
            with open(os.path.join(state_dir, "metadata.json"), "w") as f:
                json.dump(s_meta, f, indent=2)

            # Save district polygons
            polygon_fc = {"type": "FeatureCollection", "features": s_polygon_features}
            with open(os.path.join(state_dir, "boundaries-polygons.geojson"), "w") as f:
                json.dump(polygon_fc, f)

            # Save state outline polygon
            state_outline = {"type": "FeatureCollection", "features": [adm1_features[pi]]}
            with open(os.path.join(state_dir, "boundaries-polygons-state.geojson"), "w") as f:
                json.dump(state_outline, f)

            print(f"    {adm1_code} {adm1_name}: {len(child_indices)} {levels['adm2']['type'].lower()}s")

    # --- ADM3 (ward/woreda) assignment ---
    if "adm3" in level_data and "adm2" in level_data:
        adm3_features = level_data["adm3"]["features"]
        print(f"\n  Assigning {len(adm3_features)} {levels['adm3']['type'].lower()}s to {levels['adm2']['type'].lower()}s...")
        adm3_to_adm2 = assign_parents(adm3_features, adm2_features)

        # Group ADM3 by ADM1 (via ADM2)
        adm1_adm3_count = {}
        adm2_children = {}
        for ci, pi in adm3_to_adm2.items():
            adm2_children.setdefault(pi, []).append(ci)
            # Find which ADM1 this ADM2 belongs to
            adm1_idx = adm2_to_adm1.get(pi, 0)
            adm1_adm3_count[adm1_idx] = adm1_adm3_count.get(adm1_idx, 0) + 1

        # Update each ADM1 directory: add ADM3 entries to boundaries
        for pi_adm1, child_adm2_indices in sorted(adm1_children.items()):
            adm1_code = adm1_code_map[pi_adm1]
            adm1_name = adm1_features[pi_adm1]["properties"]["shapeName"]
            state_dir = os.path.join(country_dir, adm1_code.replace(f"{iso2}_", ""))

            # Read existing boundaries/relationships
            with open(os.path.join(state_dir, "boundaries-flat.json")) as f:
                s_boundaries = json.load(f)
            with open(os.path.join(state_dir, "boundary-relationships.json")) as f:
                s_relationships = json.load(f)

            s_used = {b["code"] for b in s_boundaries}
            adm3_count = 0

            for ci_adm2 in child_adm2_indices:
                adm2_code = adm2_code_map.get(ci_adm2)
                adm2_tenant_val = adm2_tenant_map.get(ci_adm2)
                if not adm2_code:
                    continue

                for ci_adm3 in adm2_children.get(ci_adm2, []):
                    feat = adm3_features[ci_adm3]
                    feat_name = feat["properties"]["shapeName"]
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
                        "boundaryType": levels["adm3"]["type"], "parent": adm2_code
                    })
                    adm3_count += 1

            with open(os.path.join(state_dir, "boundaries-flat.json"), "w") as f:
                json.dump(s_boundaries, f, indent=2)
            with open(os.path.join(state_dir, "boundary-relationships.json"), "w") as f:
                json.dump(s_relationships, f, indent=2)

            if adm3_count:
                print(f"    {adm1_code} {adm1_name}: +{adm3_count} {levels['adm3']['type'].lower()}s")

    total_adm1 = len(adm1_features) if "adm1" in level_data else 0
    total_adm2 = len(level_data["adm2"]["features"]) if "adm2" in level_data else 0
    total_adm3 = len(level_data["adm3"]["features"]) if "adm3" in level_data else 0
    print(f"\n  Summary: {total_adm1} {levels['adm1']['type']}s, {total_adm2} {levels['adm2']['type']}s, {total_adm3} {levels['adm3']['type']}s")


def main():
    for iso2, config in COUNTRIES.items():
        generate_country(iso2, config)

    print(f"\n{'=' * 60}")
    print("Done!")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
