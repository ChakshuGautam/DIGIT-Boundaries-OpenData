/**
 * Recursive crawl orchestrator.
 *
 * Depth-first per country (complete India fully before Ethiopia).
 * Supports --country filter, --depth limit, --dry-run mode.
 * Graceful shutdown on SIGINT.
 */

import path from "node:path";
import { generate } from "./agent.js";
import { discoverChildren } from "./discover.js";
import { downloadShapes } from "./shapes.js";
import { validate } from "./validate.js";
import {
  initProgress,
  readProgress,
  writeProgress,
  getNextPending,
  markInProgress,
  markDone,
  markFailed,
  markChildrenDiscovered,
  addChildren,
  nodeToDir,
  getStats,
  type ProgressFile,
  type ProgressNode,
} from "./progress.js";
import { logInfo, logSuccess, logError, logWarn } from "./helpers.js";

const DATA_DIR = path.resolve(import.meta.dirname ?? ".", "../data");

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CrawlOptions {
  country?: string; // alpha-2 filter (e.g. "IN")
  depth?: number; // 1=country, 2=+state, 3=+city
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// SIGINT handling
// ---------------------------------------------------------------------------

let shutdownRequested = false;

function setupShutdownHandler(): void {
  process.on("SIGINT", () => {
    if (shutdownRequested) {
      logError("Force quit.");
      process.exit(1);
    }
    shutdownRequested = true;
    logWarn("\nShutdown requested — finishing current generation...");
    logWarn("Press Ctrl+C again to force quit.");
  });
}

// ---------------------------------------------------------------------------
// Main crawl loop
// ---------------------------------------------------------------------------

export async function crawl(opts: CrawlOptions = {}): Promise<void> {
  setupShutdownHandler();

  const maxDepth = opts.depth ?? 3;
  logInfo(`Starting crawl (depth=${maxDepth}, country=${opts.country ?? "all"}, dryRun=${!!opts.dryRun})`);

  // Initialize progress — seeds countries + detects existing data
  const progress = await initProgress(DATA_DIR, {
    maxDepth,
    countryFilter: opts.country,
  });

  // Discover children of done nodes (needed for both dry-run and real crawl)
  await discoverAllPending(progress);

  // Dry run: just show what would be processed
  if (opts.dryRun) {
    dryRunReport(progress, opts.country);
    return;
  }

  let iteration = 0;

  while (!shutdownRequested) {
    iteration++;

    // STEP 1: Discover children for "done" nodes where childrenDiscovered=false
    await discoverAllPending(progress);

    // STEP 2: Select next pending node
    const next = getNextPending(progress, opts.country);
    if (!next) {
      const stats = getStats(progress);
      if (stats.failed > 0) {
        logWarn(`Crawl complete with ${stats.failed} failed nodes`);
      } else {
        logSuccess("Crawl complete — all nodes processed");
      }
      break;
    }

    // STEP 3: Generate
    logInfo(`\n[${"=".repeat(60)}]`);
    logInfo(`Iteration ${iteration}: ${next.code} (${next.level}) — "${next.target}"`);

    markInProgress(progress, next.code);
    await writeProgress(DATA_DIR, progress);

    try {
      const result = await generate({ target: next.target, level: next.level });

      // Validate generated output
      const outputDir = nodeToDir(DATA_DIR, next);
      const relPath = path.relative(DATA_DIR, outputDir);
      await validate(DATA_DIR, relPath);

      // STEP 3b: Download shapes (non-fatal)
      const countryCode = next.code.split("_")[0];
      try {
        await downloadShapes(countryCode, next.level, outputDir);
      } catch (err) {
        logWarn(`Shape download failed for ${next.code}: ${err}`);
      }

      // Mark done with stats
      markDone(progress, next.code, {
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        boundaryCount: result.boundaryCount,
      });
      logSuccess(`${next.code} done ($${result.costUsd.toFixed(4)}, ${result.boundaryCount} boundaries)`);
    } catch (err) {
      logError(`Generation failed for ${next.code}: ${err}`);
      markFailed(progress, next.code);
    }

    // STEP 4: Save progress after each step
    await writeProgress(DATA_DIR, progress);

    const stats = getStats(progress);
    logInfo(`Progress: ${stats.done}/${stats.total} done, ${stats.pending} pending, ${stats.failed} failed, $${stats.totalCost.toFixed(2)} total`);
  }

  if (shutdownRequested) {
    logWarn("Graceful shutdown complete. Resume with the same command.");
    await writeProgress(DATA_DIR, progress);
  }
}

// ---------------------------------------------------------------------------
// Discovery phase
// ---------------------------------------------------------------------------

async function discoverAllPending(progress: ProgressFile): Promise<void> {
  const doneNodes = Object.values(progress.nodes).filter(
    (n) => n.status === "done" && !n.childrenDiscovered,
  );

  for (const node of doneNodes) {
    // Don't discover children if we're at max depth
    const nodeDepth = node.level === "country" ? 1 : node.level === "state" ? 2 : 3;
    if (nodeDepth >= progress.config.maxDepth) {
      markChildrenDiscovered(progress, node.code);
      continue;
    }

    const children = await discoverChildren(DATA_DIR, progress, node);
    if (children.length > 0) {
      addChildren(progress, node.code, children);
    }
    markChildrenDiscovered(progress, node.code);
  }

  if (doneNodes.length > 0) {
    await writeProgress(DATA_DIR, progress);
  }
}

// ---------------------------------------------------------------------------
// Dry-run report
// ---------------------------------------------------------------------------

function dryRunReport(progress: ProgressFile, countryFilter?: string): void {
  const filter = countryFilter?.toUpperCase();
  const allNodes = Object.values(progress.nodes);
  const filtered = filter
    ? allNodes.filter((n) => n.code.split("_")[0] === filter)
    : allNodes;

  const total = filtered.length;
  const pending = filtered.filter((n) => n.status === "pending").length;
  const done = filtered.filter((n) => n.status === "done").length;
  const failed = filtered.filter((n) => n.status === "failed").length;

  console.log("\n=== Dry Run Report ===\n");
  if (filter) console.log(`Filter: ${filter}`);
  console.log(`Total nodes: ${total}`);
  console.log(`  Pending:     ${pending}`);
  console.log(`  Done:        ${done}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Max depth:   ${progress.config.maxDepth}`);
  console.log(`  Priority:    ${progress.config.priorityCountries.join(", ")}`);
  console.log();

  // Group by country
  const countries = filtered.filter((n) => n.level === "country");
  const tier1 = countries.filter((n) =>
    progress.config.priorityCountries.includes(n.code),
  );
  const tier2 = countries.filter(
    (n) => !progress.config.priorityCountries.includes(n.code),
  );

  if (tier1.length > 0) {
    console.log("Tier 1 (priority):");
    for (const c of tier1) {
      const icon = c.status === "done" ? "[done]" : "[pending]";
      const children = filtered.filter((n) => n.parentCode === c.code);
      const childDone = children.filter((n) => n.status === "done").length;
      const childInfo = children.length > 0 ? ` (children: ${childDone}/${children.length})` : "";
      console.log(`  ${icon} ${c.code} — ${c.name}${childInfo}`);
    }
    console.log();
  }

  if (!filter) {
    console.log(`Tier 2: ${tier2.length} countries`);
    const pendingT2 = tier2.filter((n) => n.status === "pending");
    const doneT2 = tier2.filter((n) => n.status === "done");
    if (doneT2.length > 0) {
      console.log(`  Already done: ${doneT2.map((n) => n.code).join(", ")}`);
    }
    if (pendingT2.length > 0) {
      console.log(`  Pending (first 20): ${pendingT2.slice(0, 20).map((n) => `${n.code}`).join(", ")}${pendingT2.length > 20 ? ` ... and ${pendingT2.length - 20} more` : ""}`);
    }
  }

  console.log("\nRun without --dry-run to start crawling.");
}
