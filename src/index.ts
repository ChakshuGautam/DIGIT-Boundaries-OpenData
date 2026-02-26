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
 */

import path from "node:path";
import { generate } from "./agent.js";
import { readCatalog, updateCatalog, printCatalog } from "./catalog.js";
import { validate } from "./validate.js";
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

Examples:
  npx tsx src/index.ts --target "India" --level country
  npx tsx src/index.ts --target "Karnataka, India" --level state
  npx tsx src/index.ts --target "Bengaluru, Karnataka, India" --level city
  npx tsx src/index.ts --validate IN/
  npx tsx src/index.ts --validate IN/KA
  npx tsx src/index.ts --list

Environment:
  AGENT_MODEL          Model to use (default: claude-sonnet-4-5-20250929)

Note: Uses Claude Code OAuth credentials (no API key needed when run via Claude Code).
`);
}

function parseArgs(argv: string[]): {
  mode: "generate" | "validate" | "list" | "help";
  target?: string;
  level?: Level;
  validatePath?: string;
} {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { mode: "help" };
  }

  if (args.includes("--list")) {
    return { mode: "list" };
  }

  const validateIdx = args.indexOf("--validate");
  if (validateIdx !== -1) {
    const validatePath = args[validateIdx + 1];
    if (!validatePath) {
      logError("--validate requires a path argument (e.g. IN/ or IN/KA)");
      process.exit(1);
    }
    return { mode: "validate", validatePath };
  }

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
  }
}

main().catch((err) => {
  logError(`Fatal: ${err}`);
  process.exit(1);
});
