#!/usr/bin/env node
/**
 * CLI entry point for DIGIT boundary data generation.
 *
 * Usage:
 *   npx tsx src/index.ts --target "India" --level country
 *   npx tsx src/index.ts --target "Karnataka, India" --level state
 *   npx tsx src/index.ts --target "Bengaluru, Karnataka, India" --level city
 *   npx tsx src/index.ts --validate IN/KA
 *   npx tsx src/index.ts --list
 *   npx tsx src/index.ts --crawl [--country IN] [--depth 2] [--dry-run]
 *   npx tsx src/index.ts --status
 */

import path from "node:path";
import { generate } from "./agent.js";
import { readCatalog, updateCatalog, printCatalog } from "./catalog.js";
import { validate } from "./validate.js";
import { crawl } from "./crawl.js";
import { printStatus } from "./status.js";
import { logError } from "./helpers.js";
import type { Level } from "./types.js";

const DATA_DIR = path.resolve(import.meta.dirname ?? ".", "../data");

function printUsage(): void {
  console.log(`
DIGIT Boundary Data Generator

Usage:
  npx tsx src/index.ts --target "<name>" --level <country|state|city>
  npx tsx src/index.ts --validate <path>
  npx tsx src/index.ts --list
  npx tsx src/index.ts --crawl [--country <ISO>] [--depth <1-3>] [--dry-run]
  npx tsx src/index.ts --status

Modes:
  --target + --level   Generate boundaries for a single target
  --validate <path>    Validate generated data at path
  --list               List all generated boundary data
  --crawl              Recursive crawl (all countries or filtered)
  --status             Show crawl progress

Crawl options:
  --country <ISO>      Only crawl this country (e.g. IN, ET, KE)
  --depth <1-3>        Max depth: 1=country, 2=+state, 3=+city (default: 3)
  --dry-run            Show what would be generated without running

Examples:
  npx tsx src/index.ts --target "India" --level country
  npx tsx src/index.ts --target "Karnataka, India" --level state
  npx tsx src/index.ts --crawl --dry-run
  npx tsx src/index.ts --crawl --country IN --depth 2
  npx tsx src/index.ts --status

Environment:
  AGENT_MODEL          Model to use (default: claude-sonnet-4-5-20250929)

Note: Uses Claude Code OAuth credentials (no API key needed when run via Claude Code).
`);
}

interface ParsedArgs {
  mode: "generate" | "validate" | "list" | "crawl" | "status" | "help";
  target?: string;
  level?: Level;
  validatePath?: string;
  country?: string;
  depth?: number;
  dryRun?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { mode: "help" };
  }

  // --status
  if (args.includes("--status")) {
    return { mode: "status" };
  }

  // --crawl
  if (args.includes("--crawl")) {
    const countryIdx = args.indexOf("--country");
    const depthIdx = args.indexOf("--depth");
    const dryRun = args.includes("--dry-run");

    const country = countryIdx !== -1 ? args[countryIdx + 1] : undefined;
    const depthStr = depthIdx !== -1 ? args[depthIdx + 1] : undefined;
    const depth = depthStr ? parseInt(depthStr, 10) : undefined;

    if (depth !== undefined && (isNaN(depth) || depth < 1 || depth > 3)) {
      logError("--depth must be 1, 2, or 3");
      process.exit(1);
    }

    return { mode: "crawl", country, depth, dryRun };
  }

  // --list
  if (args.includes("--list")) {
    return { mode: "list" };
  }

  // --validate
  const validateIdx = args.indexOf("--validate");
  if (validateIdx !== -1) {
    const validatePath = args[validateIdx + 1];
    if (!validatePath) {
      logError("--validate requires a path argument (e.g. IN/ or IN/KA)");
      process.exit(1);
    }
    return { mode: "validate", validatePath };
  }

  // --target + --level (generate)
  const targetIdx = args.indexOf("--target");
  const levelIdx = args.indexOf("--level");

  if (targetIdx === -1 || levelIdx === -1) {
    logError("Both --target and --level are required for generation");
    printUsage();
    process.exit(1);
  }

  const target = args[targetIdx + 1];
  const level = args[levelIdx + 1] as Level;

  if (!target) {
    logError("--target requires a value");
    process.exit(1);
  }

  if (!["country", "state", "city"].includes(level)) {
    logError(`--level must be one of: country, state, city (got: ${level})`);
    process.exit(1);
  }

  return { mode: "generate", target, level };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  switch (parsed.mode) {
    case "help":
      printUsage();
      break;

    case "list": {
      const catalog = await updateCatalog(DATA_DIR);
      printCatalog(catalog);
      break;
    }

    case "validate": {
      const valid = await validate(DATA_DIR, parsed.validatePath!);
      process.exit(valid ? 0 : 1);
      break;
    }

    case "generate": {
      await generate({ target: parsed.target!, level: parsed.level! });
      break;
    }

    case "crawl": {
      await crawl({
        country: parsed.country,
        depth: parsed.depth,
        dryRun: parsed.dryRun,
      });
      break;
    }

    case "status": {
      await printStatus();
      break;
    }
  }
}

main().catch((err) => {
  logError(`Fatal: ${err}`);
  process.exit(1);
});
