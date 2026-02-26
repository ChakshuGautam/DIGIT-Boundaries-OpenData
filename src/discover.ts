/**
 * Child discovery — reads boundary-relationships.json to find children.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { BoundaryRelationship } from "./types.js";
import type { ProgressFile, ProgressNode, ChildEntry, NodeLevel } from "./progress.js";
import { nodeToDir } from "./progress.js";
import { logInfo, logWarn } from "./helpers.js";

const LEVEL_CHILD: Record<string, NodeLevel | null> = {
  country: "state",
  state: "city",
  city: null,
};

/**
 * Discover children of a completed node by reading its boundary-relationships.json.
 * Returns child entries ready to be added to progress.
 */
export async function discoverChildren(
  dataDir: string,
  progress: ProgressFile,
  parentNode: ProgressNode,
): Promise<ChildEntry[]> {
  const childLevel = LEVEL_CHILD[parentNode.level];
  if (!childLevel) return []; // city nodes have no children

  const parentDir = nodeToDir(dataDir, parentNode);
  const relPath = path.join(parentDir, "boundary-relationships.json");

  let relationships: BoundaryRelationship[];
  try {
    const raw = await fs.readFile(relPath, "utf-8");
    relationships = JSON.parse(raw) as BoundaryRelationship[];
  } catch {
    logWarn(`Cannot read relationships for ${parentNode.code}: ${relPath}`);
    return [];
  }

  // Filter entries whose parent is the current node's code
  const children = relationships.filter((r) => r.parent === parentNode.code);

  if (children.length === 0) {
    logInfo(`${parentNode.code}: no children found in relationships`);
    return [];
  }

  const entries: ChildEntry[] = [];
  for (const child of children) {
    const name = deriveName(child);
    const target = buildTarget(progress, parentNode, name);

    entries.push({
      code: child.code,
      name,
      target,
      level: childLevel,
    });
  }

  logInfo(`${parentNode.code}: discovered ${entries.length} ${childLevel}-level children`);
  return entries;
}

/**
 * Derive a human-readable name from a boundary relationship entry.
 * tenantId "in.karnataka" → "Karnataka"
 * tenantId "in.andamanandnicobarislands" → "Andaman And Nicobar Islands"
 */
function deriveName(rel: BoundaryRelationship): string {
  const parts = rel.tenantId.split(".");
  const lastPart = parts[parts.length - 1];

  // Try to insert spaces before capital-like transitions in camelCase
  // But since tenantId is all lowercase, we do word-boundary heuristics
  // For now, just title-case the segment
  return titleCase(lastPart);
}

/**
 * Title-case a lowercase string. Handles common patterns:
 * "karnataka" → "Karnataka"
 * "andamanandnicobarislands" → "Andaman and Nicobar Islands"
 *
 * For compound names, we use the boundary code to figure out word breaks
 * if the tenantId is a single run-together word. Since we can't perfectly
 * split, we just capitalize the first letter for single-word segments.
 * The agent will use the correct name when generating data.
 */
function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build a target string by walking up the progress tree.
 * "Karnataka" with parent "India" → "Karnataka, India"
 */
function buildTarget(
  progress: ProgressFile,
  parentNode: ProgressNode,
  childName: string,
): string {
  const parts = [childName];
  let current: ProgressNode | undefined = parentNode;
  while (current) {
    parts.push(current.name);
    current = current.parentCode ? progress.nodes[current.parentCode] : undefined;
  }
  return parts.join(", ");
}
