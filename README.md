# DIGIT-Boundaries-OpenData

Generate DIGIT-compatible boundary hierarchy JSON files from open data sources (Wikipedia, GeoNames, OSM) using a Claude AI agent.

## Quick Start

```bash
npm install

# Generate country-level boundaries for India
npx tsx src/index.ts --target "India" --level country

# Generate state-level boundaries
npx tsx src/index.ts --target "Karnataka, India" --level state

# Generate city-level boundaries
npx tsx src/index.ts --target "Bengaluru, Karnataka, India" --level city

# Validate generated data
npx tsx src/index.ts --validate IN/

# List all generated data
npx tsx src/index.ts --list
```

### Recursive Crawl

Crawl all ~249 countries recursively (country → state → city), with resumable progress:

```bash
# Full crawl — all countries, max depth 3
npx tsx src/index.ts --crawl

# Crawl a single country
npx tsx src/index.ts --crawl --country IN

# Country + state only (no city)
npx tsx src/index.ts --crawl --depth 2

# Preview what would be generated
npx tsx src/index.ts --crawl --dry-run

# Check progress
npx tsx src/index.ts --status
```

Priority countries (India, Ethiopia, Kenya) are processed first. Progress is saved to `data/progress.json` after each step — Ctrl+C to stop, re-run the same command to resume.

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable set

## Output Format

Generated files follow the [DIGIT Boundary Service V2](https://digit-discuss.atlassian.net/wiki/spaces/DD/pages/2313814017) API format:

- `boundaries-flat.json` — Flat array of boundary entities
- `boundary-relationships.json` — Parent-child boundary relationships
- `hierarchy-definition.json` — Boundary type hierarchy definition
- `metadata.json` — Sources and generation metadata

## Data Directory Structure

```
data/
├── catalog.json                    # Index of all generated data
├── progress.json                   # Crawl progress (resumable)
└── IN/                             # ISO 3166-1 alpha-2 country code
    ├── metadata.json
    ├── hierarchy-definition.json
    ├── boundaries-flat.json
    ├── boundary-relationships.json
    ├── boundaries-polygons.geojson  # Polygon shapes (geoBoundaries)
    ├── boundaries-polygons.shp.zip  # Shapefile ZIP
    └── KA/                          # ISO 3166-2 state code
        ├── metadata.json
        ├── boundaries-flat.json
        ├── boundary-relationships.json
        ├── boundaries-polygons.geojson
        ├── boundaries-polygons.shp.zip
        └── BLR/                     # City code
            ├── metadata.json
            ├── boundaries-flat.json
            └── boundary-relationships.json
```

## How It Works

The tool uses the Claude Agent SDK to orchestrate an AI agent that:

1. Searches open data sources (Wikipedia, GeoNames, OSM) for boundary data
2. Extracts administrative division hierarchies
3. Generates DIGIT-compatible JSON files
4. Validates the output against the DIGIT schema

The agent uses built-in tools (WebSearch, WebFetch, Write, Bash, Read) — no MCP servers required.
