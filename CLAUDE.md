# CLAUDE.md

## Project Overview

This repo generates DIGIT-compatible boundary hierarchy JSON files by scraping open data sources (Wikipedia, GeoNames, OSM). It uses the Claude Agent SDK (`query()` from `@anthropic-ai/claude-agent-sdk`) to orchestrate web research and file generation.

## Architecture

- **Agent pattern**: Single `query()` call per generation. The agent uses built-in tools (WebSearch, WebFetch, Write, Bash, Read) to research and produce output files. No MCP servers.
- **CLI entry point**: `src/index.ts` — parses args, delegates to agent or local commands (validate, list).
- **Output**: DIGIT Boundary Service V2 JSON files under `data/{ISO_CODE}/`.

## Commands

```bash
# Generate boundaries for a country
npx tsx src/index.ts --target "India" --level country

# Generate boundaries for a state
npx tsx src/index.ts --target "Karnataka, India" --level state

# Generate boundaries for a city
npx tsx src/index.ts --target "Bengaluru, Karnataka, India" --level city

# Validate generated data
npx tsx src/index.ts --validate IN/KA

# List all generated data
npx tsx src/index.ts --list

# Recursive crawl — all countries, depth 3
npx tsx src/index.ts --crawl

# Crawl single country
npx tsx src/index.ts --crawl --country IN

# Crawl with limited depth (1=country, 2=+state, 3=+city)
npx tsx src/index.ts --crawl --depth 2

# Dry run — show what would be generated
npx tsx src/index.ts --crawl --dry-run

# Show crawl progress
npx tsx src/index.ts --status
```

## Code Conventions

- **ISO codes**: ISO 3166-1 alpha-2 for countries (`IN`), ISO 3166-2 for states (`IN_KA`), deterministic abbreviation for lower levels (`IN_KA_BLR`).
- **Tenant IDs**: Dot-separated lowercase (`in.karnataka.bengaluru`).
- **Boundary codes**: Underscore-separated uppercase (`IN_KA_BLR`).

## Output Format (DIGIT Boundary Service V2)

Each level produces:
- `metadata.json` — Country/state/city metadata + data sources
- `hierarchy-definition.json` — Boundary type hierarchy (country-level only)
- `boundaries-flat.json` — All boundary entities as flat array
- `boundary-relationships.json` — Parent-child relationships

## Key Files

| File | Purpose |
|------|---------|
| `src/agent.ts` | Core agent — builds prompt, calls `query()`, parses output |
| `src/crawl.ts` | Recursive crawl orchestrator |
| `src/progress.ts` | Progress tracker (`data/progress.json`) |
| `src/discover.ts` | Child boundary discovery from relationships |
| `src/shapes.ts` | Polygon downloader (geoBoundaries / GADM) |
| `src/countries.ts` | ISO 3166-1 country list with alpha-2/alpha-3 codes |
| `src/status.ts` | Crawl progress display |
| `src/prompts/system-prompt.ts` | DIGIT format rules, source priorities |
| `src/prompts/scrape-*.ts` | Level-specific prompt templates |
| `src/helpers.ts` | SDK message parsing |
| `src/types.ts` | DIGIT boundary TypeScript interfaces |
| `src/catalog.ts` | Manages `data/catalog.json` |
| `src/validate.ts` | Post-generation validation |
| `data/catalog.json` | Index of all generated data |
| `data/progress.json` | Crawl progress state (resumable) |
