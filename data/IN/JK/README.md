# DIGIT Boundary Data - Jammu and Kashmir, India

## Overview

This directory contains DIGIT Boundary Service V2 compatible data for **Jammu and Kashmir** Union Territory, India.

- **ISO Code**: IN-JK
- **State Code**: IN_JK
- **Tenant ID**: in.jammuandkashmir
- **Level**: State (Union Territory)
- **Parent**: India (IN)
- **District Count**: 20

## Files

### boundaries-flat.json
Contains 21 boundary entities (1 state + 20 districts) with GeoJSON Point geometries representing centroids.

### boundary-relationships.json
Contains 21 hierarchical relationships defining parent-child connections in the ADMIN hierarchy.

### metadata.json
Generation metadata including sources, timestamps, and quality information.

## Districts

Jammu and Kashmir is divided into two administrative divisions with 20 districts:

### Jammu Division (10 districts)
1. Doda (IN_JK_DOD)
2. Jammu (IN_JK_JMU)
3. Kathua (IN_JK_KTH)
4. Kishtwar (IN_JK_KSH)
5. Poonch (IN_JK_PON)
6. Rajouri (IN_JK_RAJ)
7. Ramban (IN_JK_RMB)
8. Reasi (IN_JK_REA)
9. Samba (IN_JK_SMB)
10. Udhampur (IN_JK_UDP)

### Kashmir Division (10 districts)
1. Anantnag (IN_JK_ANG)
2. Bandipora (IN_JK_BDP)
3. Baramulla (IN_JK_BML)
4. Budgam (IN_JK_BDG)
5. Ganderbal (IN_JK_GBL)
6. Kulgam (IN_JK_KLG)
7. Kupwara (IN_JK_KUP)
8. Pulwama (IN_JK_PUL)
9. Shopian (IN_JK_SHP)
10. Srinagar (IN_JK_SRG)

## Data Sources

1. **Wikipedia - List of districts of Jammu and Kashmir**
   - https://en.wikipedia.org/wiki/List_of_districts_of_Jammu_and_Kashmir
   - Official district list

2. **Wikipedia - ISO 3166-2:IN**
   - https://en.wikipedia.org/wiki/ISO_3166-2:IN
   - ISO code verification

3. **GitHub - udit-001/india-maps-data**
   - https://github.com/udit-001/india-maps-data
   - GeoJSON boundary data with district geometries

4. **GitHub - kublaikhan1/GeoJson4Kashmir**
   - https://github.com/kublaikhan1/GeoJson4Kashmir
   - Additional Kashmir region data

## Code Conventions

- **State Code**: `IN_JK` (Country_State format)
- **District Codes**: `IN_JK_{ABBREV}` (e.g., IN_JK_SRG for Srinagar)
- **Tenant IDs**: Lowercase, dot-separated (e.g., `in.jammuandkashmir.srinagar`)
- **Coordinates**: Calculated centroids from official GeoJSON polygons

## Quality Assurance

✓ All 20 official districts included
✓ Coordinates calculated from authoritative GeoJSON data
✓ All codes follow DIGIT naming conventions
✓ Every boundary has a corresponding relationship entry
✓ All coordinates validated (lon: -180 to 180, lat: -90 to 90)
✓ JSON structure validated
✓ No invented or missing boundaries

## Generation Info

- **Generated**: 2026-02-26
- **Format**: DIGIT Boundary Service V2
- **Generator**: DIGIT Boundary Data Generation Agent

## Notes

Jammu and Kashmir became a Union Territory on October 31, 2019, following the Jammu and Kashmir Reorganisation Act. The administrative structure comprises 20 districts divided into two divisions: Jammu Division and Kashmir Division, with 10 districts each.
