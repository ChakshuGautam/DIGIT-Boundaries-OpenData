# Andhra Pradesh - DIGIT Boundary Data

Generated on: 2026-02-26

## Overview

This directory contains DIGIT Boundary Service V2 compatible data for **Andhra Pradesh, India**.

- **State Code**: IN_AP
- **ISO Code**: IN-AP
- **Tenant ID**: in.andhrapradesh
- **Total Districts**: 28
- **Level**: State

## Files

### boundaries-flat.json
Contains 29 boundary entries:
- 1 State boundary (Andhra Pradesh)
- 28 District boundaries

Each entry includes:
- `code`: Unique identifier (e.g., IN_AP_GU for Guntur)
- `tenantId`: Dot-separated tenant identifier (e.g., in.andhrapradesh.guntur)
- `geometry`: GeoJSON Point with [longitude, latitude] coordinates

### boundary-relationships.json
Contains 29 relationship entries defining the administrative hierarchy:
- State → Country (IN_AP → IN)
- Districts → State (28 districts → IN_AP)

Each entry includes:
- `tenantId`: Same as in boundaries-flat.json
- `code`: Same as in boundaries-flat.json
- `hierarchyType`: "ADMIN" for all entries
- `boundaryType`: "State" or "District"
- `parent`: Code of the parent boundary

### metadata.json
Contains generation metadata including:
- State information (name, code, ISO code)
- Generation timestamp
- Data sources with access timestamps
- Notes about recent changes

## Districts (28)

As of January 1, 2026, Andhra Pradesh has 28 districts:

| # | District Name | Code | Headquarters | Coordinates |
|---|---------------|------|--------------|-------------|
| 1 | Alluri Sitharama Raju | IN_AP_AS | Paderu | 82.6632°E, 18.0792°N |
| 2 | Anakapalli | IN_AP_AK | Anakapalli | 82.7748°E, 17.6715°N |
| 3 | Ananthapuramu | IN_AP_AN | Ananthapuramu | 78.4180°E, 14.0127°N |
| 4 | Annamayya | IN_AP_AM | Madanapalle | 78.5015°E, 13.5558°N |
| 5 | Bapatla | IN_AP_BP | Bapatla | 80.4506°E, 15.9344°N |
| 6 | Chittoor | IN_AP_CH | Chittoor | 79.6481°E, 13.3250°N |
| 7 | Dr. B.R. Ambedkar Konaseema | IN_AP_KN | Amalapuram | 82.0033°E, 16.5777°N |
| 8 | East Godavari | IN_AP_EG | Rajamahendravaram | 81.7805°E, 17.0050°N |
| 9 | Eluru | IN_AP_EL | Eluru | 81.1154°E, 16.7104°N |
| 10 | Guntur | IN_AP_GU | Guntur | 80.4542°E, 16.2915°N |
| 11 | Kakinada | IN_AP_KK | Kakinada | 82.2351°E, 16.9437°N |
| 12 | Krishna | IN_AP_KR | Machilipatnam | 81.1348°E, 16.1817°N |
| 13 | Kurnool | IN_AP_KU | Kurnool | 78.0425°E, 15.8309°N |
| 14 | Markapuram | IN_AP_MK | Markapuram | 79.2289°E, 15.6645°N |
| 15 | Nandyal | IN_AP_NN | Nandyal | 78.4807°E, 15.4736°N |
| 16 | NTR | IN_AP_NT | Vijayawada | 80.6160°E, 16.5115°N |
| 17 | Palnadu | IN_AP_PL | Narasaraopet | 80.0473°E, 16.2389°N |
| 18 | Parvathipuram Manyam | IN_AP_PM | Parvathipuram | 83.4279°E, 18.7832°N |
| 19 | Polavaram | IN_AP_PV | Rampachodavaram | 81.7752°E, 17.4398°N |
| 20 | Prakasam | IN_AP_PR | Ongole | 80.0499°E, 15.5059°N |
| 21 | Srikakulam | IN_AP_SR | Srikakulam | 83.8939°E, 18.2949°N |
| 22 | Sri Potti Sriramulu Nellore | IN_AP_NE | Nellore | 79.9874°E, 14.4494°N |
| 23 | Sri Sathya Sai | IN_AP_SS | Puttaparthi | 77.8125°E, 14.1637°N |
| 24 | Tirupati | IN_AP_TR | Tirupati | 79.4232°E, 13.6316°N |
| 25 | Visakhapatnam | IN_AP_VS | Visakhapatnam | 83.2921°E, 17.6936°N |
| 26 | Vizianagaram | IN_AP_VZ | Vizianagaram | 83.4114°E, 18.1141°N |
| 27 | West Godavari | IN_AP_WG | Bhimavaram | 81.5273°E, 16.5428°N |
| 28 | YSR | IN_AP_CU | Kadapa | 78.8217°E, 14.4753°N |

## Recent Changes

### December 31, 2025 / January 1, 2026
- **Two new districts created**: Markapuram and Polavaram
- **Annamayya district reorganized**: Headquarters moved from Rayachoti to Madanapalle
- **Total districts increased**: From 26 to 28

## Data Sources

1. **Wikipedia - List of districts of Andhra Pradesh**
   - https://en.wikipedia.org/wiki/List_of_districts_of_Andhra_Pradesh
   - Primary source for district names and current reorganization information

2. **GitHub - iaseth/data-for-india**
   - https://github.com/iaseth/data-for-india
   - Source for district codes, headquarters, and demographic data

3. **OpenStreetMap Nominatim**
   - https://nominatim.openstreetmap.org
   - Geocoding service used to obtain latitude/longitude coordinates

4. **Government of India - Integrated Government Online Directory**
   - https://igod.gov.in/sg/AP/E042/organizations
   - Official government source for district information

## Code Conventions

### State Level
- **Code**: IN_AP (Country_State pattern)
- **Tenant ID**: in.andhrapradesh (lowercase, dot-separated)

### District Level
- **Code Pattern**: IN_AP_{2-LETTER_CODE}
  - Example: IN_AP_GU for Guntur
  - Example: IN_AP_MK for Markapuram
- **Tenant ID Pattern**: in.andhrapradesh.{district_name}
  - All lowercase, no spaces or special characters
  - Example: in.andhrapradesh.guntur
  - Example: in.andhrapradesh.allurisitharamaraju

## Validation

All data has been validated for:
- ✓ JSON syntax correctness
- ✓ Coordinate validity (longitude: -180 to 180, latitude: -90 to 90)
- ✓ Code uniqueness
- ✓ Tenant ID format (lowercase with dots)
- ✓ Hierarchy consistency
- ✓ Entry count match between files (29 boundaries = 29 relationships)

## Usage

These files are compatible with the DIGIT Boundary Service V2 and can be imported directly into DIGIT platform deployments for Andhra Pradesh.

---

Generated by: DIGIT Boundaries OpenData Generator  
Last Updated: 2026-02-26T08:51:34Z
