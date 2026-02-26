# Karnataka State Boundary Data

Generated boundary data for Karnataka state (India) in DIGIT Boundary Service V2 format.

## Overview

- **State Code**: `IN_KA`
- **ISO 3166-2**: `IN-KA`
- **Tenant ID**: `in.karnataka`
- **Parent**: India (`IN`)
- **Total Districts**: 31
- **Generated**: 2026-02-26

## Files

1. **boundaries-flat.json** - Contains 32 boundary entities (1 state + 31 districts) with GeoJSON Point geometries
2. **boundary-relationships.json** - Contains 32 parent-child relationships defining the administrative hierarchy
3. **metadata.json** - Generation metadata including sources and timestamps

## Districts Included

All 31 districts of Karnataka are included:

| # | District | Code | Tenant ID |
|---|----------|------|-----------|
| 1 | Bagalkote | IN_KA_BAG | in.karnataka.bagalkote |
| 2 | Ballari | IN_KA_BAL | in.karnataka.ballari |
| 3 | Belagavi | IN_KA_BEL | in.karnataka.belagavi |
| 4 | Bengaluru Rural | IN_KA_BLR_R | in.karnataka.bengalururural |
| 5 | Bengaluru Urban | IN_KA_BLR | in.karnataka.bengaluru |
| 6 | Bidar | IN_KA_BID | in.karnataka.bidar |
| 7 | Chamarajanagara | IN_KA_CHA | in.karnataka.chamarajanagara |
| 8 | Chikkaballapura | IN_KA_CHB | in.karnataka.chikkaballapura |
| 9 | Chikkamagaluru | IN_KA_CHM | in.karnataka.chikkamagaluru |
| 10 | Chitradurga | IN_KA_CHI | in.karnataka.chitradurga |
| 11 | Dakshina Kannada | IN_KA_DKA | in.karnataka.dakshinakannada |
| 12 | Davanagere | IN_KA_DAV | in.karnataka.davanagere |
| 13 | Dharwad | IN_KA_DHA | in.karnataka.dharwad |
| 14 | Gadag | IN_KA_GAD | in.karnataka.gadag |
| 15 | Hassan | IN_KA_HAS | in.karnataka.hassan |
| 16 | Haveri | IN_KA_HAV | in.karnataka.haveri |
| 17 | Kalaburagi | IN_KA_KAL | in.karnataka.kalaburagi |
| 18 | Kodagu | IN_KA_KOD | in.karnataka.kodagu |
| 19 | Kolar | IN_KA_KOL | in.karnataka.kolar |
| 20 | Koppal | IN_KA_KOP | in.karnataka.koppal |
| 21 | Mandya | IN_KA_MAN | in.karnataka.mandya |
| 22 | Mysuru | IN_KA_MYS | in.karnataka.mysuru |
| 23 | Raichur | IN_KA_RAI | in.karnataka.raichur |
| 24 | Ramanagara | IN_KA_RAM | in.karnataka.ramanagara |
| 25 | Shivamogga | IN_KA_SHI | in.karnataka.shivamogga |
| 26 | Tumakuru | IN_KA_TUM | in.karnataka.tumakuru |
| 27 | Udupi | IN_KA_UDU | in.karnataka.udupi |
| 28 | Uttara Kannada | IN_KA_UKA | in.karnataka.uttarakannada |
| 29 | Vijayanagara | IN_KA_VJN | in.karnataka.vijayanagara |
| 30 | Vijayapura | IN_KA_VIJ | in.karnataka.vijayapura |
| 31 | Yadgir | IN_KA_YAD | in.karnataka.yadgir |

## Data Sources

1. **List of districts of Karnataka - Wikipedia**
   - https://en.wikipedia.org/wiki/List_of_districts_of_Karnataka
   - Complete list of all 31 districts

2. **Karnataka Districts GeoJSON - GitHub**
   - https://github.com/adarshbiradar/maps-geojson
   - District boundary polygons and coordinates

3. **Latitude and Longitude of Karnataka Districts**
   - https://www.indiastatdistrictinfra.com/karnataka/all-districts/geographicaldata/latitudelongitudealtitude
   - District centroid coordinates

4. **Vijayanagara District Information**
   - https://latitude.to/map/in/india/cities/hospet
   - Coordinates for the 31st district (created in 2020)

## Validation

✓ All 32 boundaries have corresponding relationships
✓ All coordinates are valid (longitude: -180 to 180, latitude: -90 to 90)
✓ All district codes follow the pattern: IN_KA_{DISTRICT_ABBREV}
✓ All tenant IDs follow the pattern: in.karnataka.{district}
✓ Parent-child relationships properly structured
