/**
 * Progress tracker — reads/writes data/progress.json.
 *
 * Flat map of nodes keyed by code. Parent-child via parentCode.
 * Atomic writes via tmp+rename. Crash recovery for in_progress nodes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Level } from "./types.js";
import type { Metadata, BoundaryEntity } from "./types.js";
import { getCountriesByPriority } from "./countries.js";
import { logInfo, logWarn } from "./helpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeStatus = "pending" | "in_progress" | "done" | "failed";
export type NodeLevel = "country" | "state" | "city";

export interface ProgressNode {
  code: string;
  name: string;
  level: NodeLevel;
  status: NodeStatus;
  target: string; // e.g. "Karnataka, India"
  parentCode: string | null;
  childrenDiscovered: boolean;
  retryCount: number;
  costUsd?: number;
  durationMs?: number;
  boundaryCount?: number;
}

export interface ProgressConfig {
  maxDepth: number;
  maxRetries: number;
  priorityCountries: string[];
}

export interface ProgressFile {
  version: string;
  config: ProgressConfig;
  nodes: Record<string, ProgressNode>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const PROGRESS_FILENAME = "progress.json";

function defaultConfig(overrides?: Partial<ProgressConfig>): ProgressConfig {
  return {
    maxDepth: 3,
    maxRetries: 2,
    priorityCountries: ["IN", "ET", "KE"],
    ...overrides,
  };
}

function emptyProgress(config?: Partial<ProgressConfig>): ProgressFile {
  return { version: "1.0", config: defaultConfig(config), nodes: {} };
}

const LEVEL_DEPTH: Record<NodeLevel, number> = { country: 1, state: 2, city: 3 };

// ---------------------------------------------------------------------------
// Read / Write (atomic)
// ---------------------------------------------------------------------------

export async function readProgress(dataDir: string): Promise<ProgressFile> {
  const filePath = path.join(dataDir, PROGRESS_FILENAME);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ProgressFile;
  } catch {
    return emptyProgress();
  }
}

export async function writeProgress(dataDir: string, progress: ProgressFile): Promise<void> {
  const filePath = path.join(dataDir, PROGRESS_FILENAME);
  const tmpPath = filePath + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(progress, null, 2) + "\n", "utf-8");
  await fs.rename(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Init — seed countries + auto-detect existing data
// ---------------------------------------------------------------------------

export async function initProgress(
  dataDir: string,
  opts?: { maxDepth?: number; countryFilter?: string },
): Promise<ProgressFile> {
  let progress = await readProgress(dataDir);
  const isNew = Object.keys(progress.nodes).length === 0;

  const prevMaxDepth = progress.config.maxDepth;
  if (opts?.maxDepth !== undefined) {
    progress.config.maxDepth = opts.maxDepth;
  }

  // If maxDepth increased, reset childrenDiscovered for nodes that are now
  // eligible for deeper discovery (they were skipped at the previous depth)
  if (progress.config.maxDepth > prevMaxDepth) {
    for (const node of Object.values(progress.nodes)) {
      if (node.status !== "done" || !node.childrenDiscovered) continue;
      const nodeDepth = LEVEL_DEPTH[node.level];
      // Was at or beyond old limit, now below new limit → re-discover
      if (nodeDepth >= prevMaxDepth && nodeDepth < progress.config.maxDepth) {
        node.childrenDiscovered = false;
      }
    }
  }

  // Seed country nodes if not present
  const countries = getCountriesByPriority();
  for (const c of countries) {
    if (opts?.countryFilter && c.alpha2 !== opts.countryFilter.toUpperCase()) continue;
    if (!progress.nodes[c.alpha2]) {
      progress.nodes[c.alpha2] = {
        code: c.alpha2,
        name: c.name,
        level: "country",
        status: "pending",
        target: c.name,
        parentCode: null,
        childrenDiscovered: false,
        retryCount: 0,
      };
    }
  }

  // Auto-detect existing data
  if (isNew) {
    await detectExistingData(dataDir, progress);
  }

  // Crash recovery: reset in_progress → pending or done
  await recoverCrashed(dataDir, progress);

  await writeProgress(dataDir, progress);
  return progress;
}

// ---------------------------------------------------------------------------
// Auto-detection of existing generated data
// ---------------------------------------------------------------------------

async function detectExistingData(dataDir: string, progress: ProgressFile): Promise<void> {
  let detected = 0;
  try {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.length !== 2 || entry.name !== entry.name.toUpperCase()) continue;

      const countryCode = entry.name;
      const countryDir = path.join(dataDir, countryCode);

      // Check if country data exists
      if (await hasValidData(countryDir)) {
        const meta = await readMetadata(countryDir);
        const boundaries = await countBoundaries(countryDir);
        if (progress.nodes[countryCode]) {
          progress.nodes[countryCode].status = "done";
          progress.nodes[countryCode].boundaryCount = boundaries;
          if (meta?.name) progress.nodes[countryCode].name = meta.name;
        }
        detected++;

        // Scan for state dirs
        const stateDirs = await fs.readdir(countryDir, { withFileTypes: true });
        for (const sd of stateDirs) {
          if (!sd.isDirectory()) continue;
          const stateDir = path.join(countryDir, sd.name);
          if (!(await hasValidData(stateDir))) continue;

          const stateCode = `${countryCode}_${sd.name}`;
          const stateMeta = await readMetadata(stateDir);
          const stateBoundaries = await countBoundaries(stateDir);
          progress.nodes[stateCode] = {
            code: stateCode,
            name: stateMeta?.name ?? sd.name,
            level: "state",
            status: "done",
            target: `${stateMeta?.name ?? sd.name}, ${progress.nodes[countryCode]?.name ?? countryCode}`,
            parentCode: countryCode,
            childrenDiscovered: false,
            retryCount: 0,
            boundaryCount: stateBoundaries,
          };
          detected++;

          // Scan for city dirs
          const cityDirs = await fs.readdir(stateDir, { withFileTypes: true });
          for (const cd of cityDirs) {
            if (!cd.isDirectory()) continue;
            const cityDir = path.join(stateDir, cd.name);
            if (!(await hasValidData(cityDir))) continue;

            const cityCode = `${stateCode}_${cd.name}`;
            const cityMeta = await readMetadata(cityDir);
            const cityBoundaries = await countBoundaries(cityDir);
            progress.nodes[cityCode] = {
              code: cityCode,
              name: cityMeta?.name ?? cd.name,
              level: "city",
              status: "done",
              target: `${cityMeta?.name ?? cd.name}, ${stateMeta?.name ?? sd.name}, ${progress.nodes[countryCode]?.name ?? countryCode}`,
              parentCode: stateCode,
              childrenDiscovered: false,
              retryCount: 0,
              boundaryCount: cityBoundaries,
            };
            detected++;
          }
        }
      }
    }
  } catch {
    // data dir might not exist yet
  }

  if (detected > 0) {
    logInfo(`Auto-detected ${detected} existing data entries`);
  }
}

async function hasValidData(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, "boundaries-flat.json"));
    await fs.access(path.join(dir, "metadata.json"));
    return true;
  } catch {
    return false;
  }
}

async function readMetadata(dir: string): Promise<Metadata | null> {
  try {
    const raw = await fs.readFile(path.join(dir, "metadata.json"), "utf-8");
    return JSON.parse(raw) as Metadata;
  } catch {
    return null;
  }
}

async function countBoundaries(dir: string): Promise<number> {
  try {
    const raw = await fs.readFile(path.join(dir, "boundaries-flat.json"), "utf-8");
    const arr = JSON.parse(raw) as BoundaryEntity[];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Crash recovery
// ---------------------------------------------------------------------------

async function recoverCrashed(dataDir: string, progress: ProgressFile): Promise<void> {
  for (const node of Object.values(progress.nodes)) {
    if (node.status !== "in_progress") continue;

    const dir = nodeToDir(dataDir, node);
    if (await hasValidData(dir)) {
      logWarn(`Recovering ${node.code}: output exists, marking done`);
      node.status = "done";
      node.boundaryCount = await countBoundaries(dir);
    } else {
      logWarn(`Recovering ${node.code}: no output, resetting to pending`);
      node.status = "pending";
    }
  }
}

/** Convert a progress node to its data directory path. */
export function nodeToDir(dataDir: string, node: ProgressNode): string {
  // code examples: "IN", "IN_KA", "IN_KA_BLR"
  // dir examples: "data/IN", "data/IN/KA", "data/IN/KA/BLR"
  const parts = node.code.split("_");
  return path.join(dataDir, ...parts);
}

// ---------------------------------------------------------------------------
// Node state transitions
// ---------------------------------------------------------------------------

export function markInProgress(progress: ProgressFile, code: string): void {
  const node = progress.nodes[code];
  if (node) node.status = "in_progress";
}

export function markDone(
  progress: ProgressFile,
  code: string,
  stats?: { costUsd?: number; durationMs?: number; boundaryCount?: number },
): void {
  const node = progress.nodes[code];
  if (!node) return;
  node.status = "done";
  if (stats?.costUsd !== undefined) node.costUsd = stats.costUsd;
  if (stats?.durationMs !== undefined) node.durationMs = stats.durationMs;
  if (stats?.boundaryCount !== undefined) node.boundaryCount = stats.boundaryCount;
}

export function markFailed(progress: ProgressFile, code: string): void {
  const node = progress.nodes[code];
  if (!node) return;
  node.status = "failed";
  node.retryCount = (node.retryCount ?? 0) + 1;

  // If under retry limit, reset to pending
  if (node.retryCount < progress.config.maxRetries) {
    node.status = "pending";
  }
}

export function markChildrenDiscovered(progress: ProgressFile, code: string): void {
  const node = progress.nodes[code];
  if (node) node.childrenDiscovered = true;
}

// ---------------------------------------------------------------------------
// Add children
// ---------------------------------------------------------------------------

export interface ChildEntry {
  code: string;
  name: string;
  target: string;
  level: NodeLevel;
}

export function addChildren(
  progress: ProgressFile,
  parentCode: string,
  children: ChildEntry[],
): void {
  for (const child of children) {
    if (!progress.nodes[child.code]) {
      progress.nodes[child.code] = {
        code: child.code,
        name: child.name,
        level: child.level,
        status: "pending",
        target: child.target,
        parentCode,
        childrenDiscovered: false,
        retryCount: 0,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Selection — depth-first within priority order
// ---------------------------------------------------------------------------

/**
 * Get the next pending node to process.
 * Strategy: tier-1 countries depth-first (complete each fully before next),
 * then tier-2 alphabetically.
 *
 * @param countryFilter — optional alpha-2 code to restrict to a single country's subtree
 */
export function getNextPending(progress: ProgressFile, countryFilter?: string): ProgressNode | null {
  const filter = countryFilter?.toUpperCase();
  const pending = Object.values(progress.nodes).filter((n) => {
    if (n.status !== "pending") return false;
    if (LEVEL_DEPTH[n.level] > progress.config.maxDepth) return false;
    if (filter && getRootCountry(n) !== filter) return false;
    return true;
  });
  if (pending.length === 0) return null;

  // Sort: tier-1 country subtrees first, then tier-2. Within same tier, depth-first.
  const tier1 = new Set(progress.config.priorityCountries);

  pending.sort((a, b) => {
    const aRoot = getRootCountry(a);
    const bRoot = getRootCountry(b);
    const aTier = tier1.has(aRoot) ? 1 : 2;
    const bTier = tier1.has(bRoot) ? 1 : 2;

    // Tier ordering
    if (aTier !== bTier) return aTier - bTier;

    // Same tier: group by root country
    if (aRoot !== bRoot) return aRoot.localeCompare(bRoot);

    // Same country: depth-first (process deeper nodes first to complete subtrees)
    const aDepth = LEVEL_DEPTH[a.level];
    const bDepth = LEVEL_DEPTH[b.level];
    if (aDepth !== bDepth) return bDepth - aDepth;

    // Same depth: alphabetical
    return a.code.localeCompare(b.code);
  });

  return pending[0];
}

function getRootCountry(node: ProgressNode): string {
  return node.code.split("_")[0];
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getStats(progress: ProgressFile) {
  const nodes = Object.values(progress.nodes);
  return {
    total: nodes.length,
    pending: nodes.filter((n) => n.status === "pending").length,
    inProgress: nodes.filter((n) => n.status === "in_progress").length,
    done: nodes.filter((n) => n.status === "done").length,
    failed: nodes.filter((n) => n.status === "failed").length,
    totalCost: nodes.reduce((sum, n) => sum + (n.costUsd ?? 0), 0),
    totalBoundaries: nodes.reduce((sum, n) => sum + (n.boundaryCount ?? 0), 0),
  };
}

/** Get all children of a node. */
export function getChildren(progress: ProgressFile, parentCode: string): ProgressNode[] {
  return Object.values(progress.nodes).filter((n) => n.parentCode === parentCode);
}

/** Check if all descendants of a node are done. */
export function isSubtreeComplete(progress: ProgressFile, code: string): boolean {
  const children = getChildren(progress, code);
  if (children.length === 0) return true;
  return children.every(
    (c) => c.status === "done" && isSubtreeComplete(progress, c.code),
  );
}
