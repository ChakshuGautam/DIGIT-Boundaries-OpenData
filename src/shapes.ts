/**
 * Boundary polygon downloader — fetches GeoJSON + Shapefile from geoBoundaries.
 *
 * Primary: geoBoundaries API (CC-BY, global ADM0/ADM1/ADM2)
 * Fallback: GADM (for missing levels)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { alpha2ToAlpha3 } from "./countries.js";
import { logInfo, logWarn, logSuccess } from "./helpers.js";
import type { NodeLevel } from "./progress.js";

// ---------------------------------------------------------------------------
// Level → ADM mapping
// ---------------------------------------------------------------------------

const LEVEL_TO_ADM: Record<NodeLevel, string> = {
  country: "ADM0",
  state: "ADM1",
  city: "ADM2",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ShapeResult {
  geojsonPath: string | null;
  shapefilePath: string | null;
}

/**
 * Download boundary polygon data for a given level.
 *
 * @param countryAlpha2 - 2-letter country code (e.g. "IN")
 * @param level - Node level (country, state, city)
 * @param outputDir - Directory to write files into (e.g. data/IN or data/IN/KA)
 * @returns Paths to downloaded files (null if unavailable)
 */
export async function downloadShapes(
  countryAlpha2: string,
  level: NodeLevel,
  outputDir: string,
): Promise<ShapeResult> {
  const iso3 = alpha2ToAlpha3(countryAlpha2);
  if (!iso3) {
    logWarn(`No alpha-3 code for ${countryAlpha2}, skipping shape download`);
    return { geojsonPath: null, shapefilePath: null };
  }

  const admLevel = LEVEL_TO_ADM[level];
  logInfo(`Downloading shapes: ${iso3} ${admLevel} → ${outputDir}`);

  // Try geoBoundaries first
  let result = await tryGeoBoundaries(iso3, admLevel, outputDir);

  // Fallback to GADM if geoBoundaries failed
  if (!result.geojsonPath) {
    result = await tryGadm(iso3, admLevel, outputDir);
  }

  if (result.geojsonPath || result.shapefilePath) {
    logSuccess(`Shapes downloaded for ${iso3} ${admLevel}`);
  } else {
    logWarn(`No shapes available for ${iso3} ${admLevel}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// geoBoundaries
// ---------------------------------------------------------------------------

interface GeoBoundariesResponse {
  gjDownloadURL?: string;
  dlShapeFile?: string;
  simplifiedGeometryGeoJSON?: string;
}

async function tryGeoBoundaries(
  iso3: string,
  admLevel: string,
  outputDir: string,
): Promise<ShapeResult> {
  const apiUrl = `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${admLevel}/`;
  let geojsonPath: string | null = null;
  let shapefilePath: string | null = null;

  try {
    const resp = await fetch(apiUrl);
    if (!resp.ok) {
      logWarn(`geoBoundaries API returned ${resp.status} for ${iso3}/${admLevel}`);
      return { geojsonPath: null, shapefilePath: null };
    }

    const data = (await resp.json()) as GeoBoundariesResponse;

    // Download simplified GeoJSON
    const gjUrl = data.simplifiedGeometryGeoJSON ?? data.gjDownloadURL;
    if (gjUrl) {
      geojsonPath = await downloadFile(gjUrl, path.join(outputDir, "boundaries-polygons.geojson"));
    }

    // Download shapefile ZIP
    if (data.dlShapeFile) {
      shapefilePath = await downloadFile(
        data.dlShapeFile,
        path.join(outputDir, "boundaries-polygons.shp.zip"),
      );
    }
  } catch (err) {
    logWarn(`geoBoundaries fetch failed for ${iso3}/${admLevel}: ${err}`);
  }

  return { geojsonPath, shapefilePath };
}

// ---------------------------------------------------------------------------
// GADM fallback
// ---------------------------------------------------------------------------

async function tryGadm(
  iso3: string,
  admLevel: string,
  outputDir: string,
): Promise<ShapeResult> {
  // GADM uses numeric level: ADM0 → 0, ADM1 → 1, ADM2 → 2
  const numLevel = admLevel.replace("ADM", "");
  const gadmUrl = `https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_${iso3}_${numLevel}.json`;

  try {
    const geojsonPath = await downloadFile(
      gadmUrl,
      path.join(outputDir, "boundaries-polygons.geojson"),
    );
    return { geojsonPath, shapefilePath: null };
  } catch (err) {
    logWarn(`GADM fallback failed for ${iso3} level ${numLevel}: ${err}`);
    return { geojsonPath: null, shapefilePath: null };
  }
}

// ---------------------------------------------------------------------------
// File download helper
// ---------------------------------------------------------------------------

async function downloadFile(url: string, destPath: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      logWarn(`Download failed (${resp.status}): ${url}`);
      return null;
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });

    const buffer = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(destPath, buffer);
    logInfo(`  → ${path.basename(destPath)} (${formatBytes(buffer.length)})`);
    return destPath;
  } catch (err) {
    logWarn(`Download error for ${url}: ${err}`);
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
