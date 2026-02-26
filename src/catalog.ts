/**
 * Catalog management — reads/updates data/catalog.json.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Catalog, CatalogEntry, BoundaryEntity, Metadata } from "./types.js";

const CATALOG_FILE = "catalog.json";

export async function readCatalog(dataDir: string): Promise<Catalog> {
  const catalogPath = path.join(dataDir, CATALOG_FILE);
  try {
    const raw = await fs.readFile(catalogPath, "utf-8");
    return JSON.parse(raw) as Catalog;
  } catch {
    return { version: "1.0", generated: [], lastUpdated: null };
  }
}

export async function writeCatalog(dataDir: string, catalog: Catalog): Promise<void> {
  const catalogPath = path.join(dataDir, CATALOG_FILE);
  await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf-8");
}

/**
 * Scan the data directory for generated boundary data and update the catalog.
 */
export async function updateCatalog(dataDir: string): Promise<Catalog> {
  const catalog = await readCatalog(dataDir);
  const entries: CatalogEntry[] = [];

  // Scan for country directories (2-letter codes)
  const topLevel = await fs.readdir(dataDir, { withFileTypes: true });

  for (const entry of topLevel) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    if (entry.name.length !== 2 || entry.name !== entry.name.toUpperCase()) continue;

    const countryDir = path.join(dataDir, entry.name);
    const countryEntry = await scanDirectory(countryDir, entry.name, "country");
    if (countryEntry) entries.push(countryEntry);

    // Scan for state directories
    const stateDirs = await fs.readdir(countryDir, { withFileTypes: true });
    for (const stateEntry of stateDirs) {
      if (!stateEntry.isDirectory()) continue;

      const stateDir = path.join(countryDir, stateEntry.name);
      const stateResult = await scanDirectory(
        stateDir,
        `${entry.name}/${stateEntry.name}`,
        "state",
      );
      if (stateResult) entries.push(stateResult);

      // Scan for city directories
      const cityDirs = await fs.readdir(stateDir, { withFileTypes: true });
      for (const cityEntry of cityDirs) {
        if (!cityEntry.isDirectory()) continue;

        const cityDir = path.join(stateDir, cityEntry.name);
        const cityResult = await scanDirectory(
          cityDir,
          `${entry.name}/${stateEntry.name}/${cityEntry.name}`,
          "city",
        );
        if (cityResult) entries.push(cityResult);
      }
    }
  }

  catalog.generated = entries;
  catalog.lastUpdated = new Date().toISOString();
  await writeCatalog(dataDir, catalog);
  return catalog;
}

async function scanDirectory(
  dir: string,
  relativePath: string,
  level: "country" | "state" | "city",
): Promise<CatalogEntry | null> {
  try {
    const metadataPath = path.join(dir, "metadata.json");
    const boundariesPath = path.join(dir, "boundaries-flat.json");

    const [metadataRaw, boundariesRaw] = await Promise.all([
      fs.readFile(metadataPath, "utf-8").catch(() => null),
      fs.readFile(boundariesPath, "utf-8").catch(() => null),
    ]);

    if (!metadataRaw || !boundariesRaw) return null;

    const metadata = JSON.parse(metadataRaw) as Metadata;
    const boundaries = JSON.parse(boundariesRaw) as BoundaryEntity[];

    return {
      code: metadata.code,
      name: metadata.name,
      level,
      path: relativePath,
      generatedAt: metadata.generatedAt,
      boundaryCount: boundaries.length,
    };
  } catch {
    return null;
  }
}

export function printCatalog(catalog: Catalog): void {
  if (catalog.generated.length === 0) {
    console.log("No boundary data generated yet.");
    console.log('Run: npx tsx src/index.ts --target "India" --level country');
    return;
  }

  console.log(`\nBoundary Data Catalog (${catalog.generated.length} entries)\n`);
  console.log("  Code       | Level   | Name                  | Boundaries | Generated");
  console.log("  -----------|---------|----------------------|------------|----------");

  for (const entry of catalog.generated) {
    const code = entry.code.padEnd(10);
    const level = entry.level.padEnd(7);
    const name = entry.name.substring(0, 21).padEnd(21);
    const count = String(entry.boundaryCount).padStart(10);
    const date = entry.generatedAt?.substring(0, 10) ?? "unknown";
    console.log(`  ${code} | ${level} | ${name} | ${count} | ${date}`);
  }

  console.log(`\nLast updated: ${catalog.lastUpdated ?? "never"}`);
}
