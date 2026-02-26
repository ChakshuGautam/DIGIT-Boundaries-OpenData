/**
 * Post-generation validation for DIGIT boundary files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  BoundaryEntity,
  BoundaryRelationship,
  HierarchyDefinition,
  Metadata,
} from "./types.js";
import { logInfo, logSuccess, logError, logWarn } from "./helpers.js";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    boundaryCount: number;
    relationshipCount: number;
    hierarchyLevels: number;
  };
}

export async function validate(dataDir: string, targetPath: string): Promise<boolean> {
  const fullPath = path.join(dataDir, targetPath);
  logInfo(`Validating ${fullPath}...`);

  const result = await validateDirectory(fullPath);

  // Print results
  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of result.errors) {
      logError(err);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warn of result.warnings) {
      logWarn(warn);
    }
  }

  console.log("\nStats:");
  console.log(`  Boundaries: ${result.stats.boundaryCount}`);
  console.log(`  Relationships: ${result.stats.relationshipCount}`);
  console.log(`  Hierarchy levels: ${result.stats.hierarchyLevels}`);

  if (result.valid) {
    logSuccess(`Validation passed for ${targetPath}`);
  } else {
    logError(`Validation failed for ${targetPath} (${result.errors.length} errors)`);
  }

  return result.valid;
}

async function validateDirectory(dir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let boundaryCount = 0;
  let relationshipCount = 0;
  let hierarchyLevels = 0;

  // Check required files exist
  const requiredFiles = ["metadata.json", "boundaries-flat.json", "boundary-relationships.json"];
  for (const file of requiredFiles) {
    try {
      await fs.access(path.join(dir, file));
    } catch {
      errors.push(`Missing required file: ${file}`);
    }
  }

  // Validate metadata.json
  let metadata: Metadata | null = null;
  try {
    const raw = await fs.readFile(path.join(dir, "metadata.json"), "utf-8");
    metadata = JSON.parse(raw) as Metadata;
    if (!metadata.name) errors.push("metadata.json: missing 'name'");
    if (!metadata.code) errors.push("metadata.json: missing 'code'");
    if (!metadata.level) errors.push("metadata.json: missing 'level'");
    if (!metadata.tenantId) errors.push("metadata.json: missing 'tenantId'");
    if (!metadata.generatedAt) errors.push("metadata.json: missing 'generatedAt'");
    if (!metadata.sources || metadata.sources.length === 0) {
      warnings.push("metadata.json: no sources listed");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      errors.push(`metadata.json: invalid JSON — ${err}`);
    }
  }

  // Validate boundaries-flat.json
  let boundaries: BoundaryEntity[] = [];
  try {
    const raw = await fs.readFile(path.join(dir, "boundaries-flat.json"), "utf-8");
    boundaries = JSON.parse(raw) as BoundaryEntity[];
    boundaryCount = boundaries.length;

    if (!Array.isArray(boundaries)) {
      errors.push("boundaries-flat.json: root must be an array");
    } else {
      const codes = new Set<string>();
      for (const b of boundaries) {
        if (!b.code) errors.push(`boundaries-flat.json: entry missing 'code'`);
        if (!b.tenantId) errors.push(`boundaries-flat.json: entry with code '${b.code}' missing 'tenantId'`);

        if (b.code && codes.has(b.code)) {
          errors.push(`boundaries-flat.json: duplicate code '${b.code}'`);
        }
        codes.add(b.code);

        // Validate geometry
        if (!b.geometry) {
          errors.push(`boundaries-flat.json: entry '${b.code}' missing 'geometry'`);
        } else if (b.geometry.type !== "Point") {
          errors.push(`boundaries-flat.json: entry '${b.code}' geometry type must be 'Point'`);
        } else if (!Array.isArray(b.geometry.coordinates) || b.geometry.coordinates.length !== 2) {
          errors.push(`boundaries-flat.json: entry '${b.code}' invalid coordinates`);
        } else {
          const [lon, lat] = b.geometry.coordinates;
          if (lon < -180 || lon > 180) errors.push(`boundaries-flat.json: entry '${b.code}' longitude out of range: ${lon}`);
          if (lat < -90 || lat > 90) errors.push(`boundaries-flat.json: entry '${b.code}' latitude out of range: ${lat}`);
        }

        // Validate code format
        if (b.code && !/^[A-Z][A-Z0-9_]*$/.test(b.code)) {
          warnings.push(`boundaries-flat.json: code '${b.code}' should be uppercase with underscores`);
        }

        // Validate tenantId format
        if (b.tenantId && !/^[a-z][a-z0-9.]*$/.test(b.tenantId)) {
          warnings.push(`boundaries-flat.json: tenantId '${b.tenantId}' should be lowercase with dots`);
        }
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      errors.push(`boundaries-flat.json: invalid JSON — ${err}`);
    }
  }

  // Validate boundary-relationships.json
  let relationships: BoundaryRelationship[] = [];
  try {
    const raw = await fs.readFile(path.join(dir, "boundary-relationships.json"), "utf-8");
    relationships = JSON.parse(raw) as BoundaryRelationship[];
    relationshipCount = relationships.length;

    if (!Array.isArray(relationships)) {
      errors.push("boundary-relationships.json: root must be an array");
    } else {
      const boundaryCodes = new Set(boundaries.map((b) => b.code));
      const relCodes = new Set<string>();

      for (const r of relationships) {
        if (!r.code) errors.push(`boundary-relationships.json: entry missing 'code'`);
        if (!r.tenantId) errors.push(`boundary-relationships.json: entry with code '${r.code}' missing 'tenantId'`);
        if (!r.hierarchyType) errors.push(`boundary-relationships.json: entry '${r.code}' missing 'hierarchyType'`);
        if (!r.boundaryType) errors.push(`boundary-relationships.json: entry '${r.code}' missing 'boundaryType'`);

        if (r.code && relCodes.has(r.code)) {
          errors.push(`boundary-relationships.json: duplicate code '${r.code}'`);
        }
        relCodes.add(r.code);

        // Check parent exists
        if (r.parent !== null && !boundaryCodes.has(r.parent) && !relCodes.has(r.parent)) {
          // Parent might be in a parent directory — just warn
          warnings.push(`boundary-relationships.json: entry '${r.code}' references parent '${r.parent}' not found in boundaries-flat.json`);
        }
      }

      // Check every boundary has a relationship
      for (const b of boundaries) {
        if (!relCodes.has(b.code)) {
          errors.push(`boundary-relationships.json: no relationship entry for boundary '${b.code}'`);
        }
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      errors.push(`boundary-relationships.json: invalid JSON — ${err}`);
    }
  }

  // Validate hierarchy-definition.json (optional — only at country level)
  try {
    const raw = await fs.readFile(path.join(dir, "hierarchy-definition.json"), "utf-8");
    const hierarchy = JSON.parse(raw) as HierarchyDefinition;
    hierarchyLevels = hierarchy.boundaryHierarchy?.length ?? 0;

    if (!hierarchy.tenantId) errors.push("hierarchy-definition.json: missing 'tenantId'");
    if (!hierarchy.hierarchyType) errors.push("hierarchy-definition.json: missing 'hierarchyType'");
    if (!Array.isArray(hierarchy.boundaryHierarchy)) {
      errors.push("hierarchy-definition.json: 'boundaryHierarchy' must be an array");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      errors.push(`hierarchy-definition.json: invalid JSON — ${err}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: { boundaryCount, relationshipCount, hierarchyLevels },
  };
}
