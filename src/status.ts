/**
 * Status display — pretty-print crawl progress.
 */

import path from "node:path";
import { readProgress, getStats, getChildren, type ProgressFile, type ProgressNode } from "./progress.js";

const DATA_DIR = path.resolve(import.meta.dirname ?? ".", "../data");

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

const STATUS_ICON: Record<string, string> = {
  done: `${C.green}done${C.reset}`,
  pending: `${C.dim}pending${C.reset}`,
  in_progress: `${C.cyan}running${C.reset}`,
  failed: `${C.red}FAILED${C.reset}`,
};

export async function printStatus(): Promise<void> {
  const progress = await readProgress(DATA_DIR);

  if (Object.keys(progress.nodes).length === 0) {
    console.log("No crawl progress found. Run --crawl first.");
    return;
  }

  const stats = getStats(progress);

  // Header
  console.log(`\n${C.bold}=== Crawl Status ===${C.reset}\n`);
  console.log(`Config: depth=${progress.config.maxDepth}, retries=${progress.config.maxRetries}`);
  console.log(`Priority: ${progress.config.priorityCountries.join(", ")}\n`);

  // Overall stats
  const pct = stats.total > 0 ? ((stats.done / stats.total) * 100).toFixed(1) : "0";
  console.log(`${C.bold}Overall:${C.reset} ${stats.done}/${stats.total} (${pct}%)`);
  console.log(`  Pending:     ${stats.pending}`);
  console.log(`  In progress: ${stats.inProgress}`);
  console.log(`  Done:        ${C.green}${stats.done}${C.reset}`);
  console.log(`  Failed:      ${stats.failed > 0 ? C.red + stats.failed + C.reset : "0"}`);
  console.log(`  Total cost:  $${stats.totalCost.toFixed(2)}`);
  console.log(`  Boundaries:  ${stats.totalBoundaries}`);
  console.log();

  // Per-country breakdown
  const countries = Object.values(progress.nodes)
    .filter((n) => n.level === "country")
    .sort((a, b) => {
      const aT = progress.config.priorityCountries.includes(a.code) ? 0 : 1;
      const bT = progress.config.priorityCountries.includes(b.code) ? 0 : 1;
      if (aT !== bT) return aT - bT;
      return a.name.localeCompare(b.name);
    });

  // Show countries with any activity (done/in_progress/failed or has children)
  const active = countries.filter((c) => {
    if (c.status !== "pending") return true;
    return getChildren(progress, c.code).length > 0;
  });

  if (active.length > 0) {
    console.log(`${C.bold}Countries with activity:${C.reset}`);
    console.log();

    for (const country of active) {
      printCountryDetail(progress, country);
    }
  }

  // Summary of pending countries
  const pendingCountries = countries.filter(
    (c) => c.status === "pending" && getChildren(progress, c.code).length === 0,
  );
  if (pendingCountries.length > 0) {
    console.log(`${C.dim}${pendingCountries.length} countries pending (not yet started)${C.reset}`);
  }
}

function printCountryDetail(progress: ProgressFile, country: ProgressNode): void {
  const states = getChildren(progress, country.code);
  const statesDone = states.filter((s) => s.status === "done").length;
  const statesFailed = states.filter((s) => s.status === "failed").length;

  const costStr = country.costUsd ? `$${country.costUsd.toFixed(2)}` : "-";
  const bcStr = country.boundaryCount ? `${country.boundaryCount} boundaries` : "";

  const icon = STATUS_ICON[country.status] ?? country.status;
  console.log(`  ${C.bold}${country.code}${C.reset} ${country.name} [${icon}] ${costStr} ${bcStr}`);

  if (states.length > 0) {
    console.log(`    States: ${statesDone}/${states.length} done${statesFailed > 0 ? ` (${C.red}${statesFailed} failed${C.reset})` : ""}`);

    // Show cities for each state
    for (const state of states) {
      const cities = getChildren(progress, state.code);
      if (cities.length === 0 && state.status === "done") continue;

      const citiesDone = cities.filter((c) => c.status === "done").length;
      const sIcon = STATUS_ICON[state.status] ?? state.status;

      if (cities.length > 0) {
        console.log(`      ${state.code} ${state.name} [${sIcon}] — cities: ${citiesDone}/${cities.length}`);
      } else if (state.status !== "done") {
        console.log(`      ${state.code} ${state.name} [${sIcon}]`);
      }
    }
  }
  console.log();
}
