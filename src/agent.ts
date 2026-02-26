/**
 * Core agent — builds prompt, calls query(), parses output.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import { parseMessages, logInfo, logSuccess, logAgentStats, logError } from "./helpers.js";
import { getSystemPrompt } from "./prompts/system-prompt.js";
import { getCountryPrompt } from "./prompts/scrape-country.js";
import { getStatePrompt } from "./prompts/scrape-state.js";
import { getCityPrompt } from "./prompts/scrape-city.js";
import { updateCatalog } from "./catalog.js";
import type { Level, GenerateOptions, GenerateResult, BoundaryEntity } from "./types.js";
import fs from "node:fs/promises";

const MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-4-5-20250929";
const DATA_DIR = path.resolve(import.meta.dirname ?? ".", "../data");

/**
 * Parse the target string to extract the output directory path.
 * Examples:
 *   "India" → "IN"
 *   "Karnataka, India" → "IN/KA"
 *   "Bengaluru, Karnataka, India" → "IN/KA/BLR"
 *
 * Since we don't know the ISO codes yet (the agent will figure them out),
 * we let the agent create the directories. We pass the data dir root.
 */
function buildOutputDir(level: Level): string {
  // The agent will determine the exact path based on ISO codes.
  // We give it the data root and let it create subdirectories.
  return DATA_DIR;
}

function getParentDir(level: Level): string {
  return DATA_DIR;
}

function buildPrompt(opts: GenerateOptions): string {
  const outputDir = buildOutputDir(opts.level);
  const parentDir = getParentDir(opts.level);

  switch (opts.level) {
    case "country":
      return getCountryPrompt(opts.target, outputDir);
    case "state":
      return getStatePrompt(opts.target, outputDir, parentDir);
    case "city":
      return getCityPrompt(opts.target, outputDir, parentDir);
  }
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  logInfo(`Generating ${opts.level}-level boundaries for "${opts.target}"...`);
  logInfo(`Model: ${MODEL}`);
  logInfo(`Data directory: ${DATA_DIR}`);

  const systemPrompt = getSystemPrompt(DATA_DIR);
  const userPrompt = buildPrompt(opts);

  // Strip CLAUDECODE env var so the subprocess doesn't think it's nested
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CLAUDECODE;

  const options = {
    systemPrompt,
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true,
    model: MODEL,
    maxTurns: 50,
    persistSession: false,
    env,
  };

  const messages: SDKMessage[] = [];

  logInfo("Starting agent...");

  try {
    for await (const message of query({
      prompt: userPrompt,
      options: options as Parameters<typeof query>[0]["options"],
    })) {
      messages.push(message);

      // Log progress for tool use
      if (message.type === "assistant") {
        const msg = message as Record<string, unknown>;
        const content = msg.message as { content: Array<Record<string, unknown>> } | undefined;
        if (content?.content) {
          for (const block of content.content) {
            if (block.type === "tool_use") {
              const name = block.name as string;
              process.stdout.write(`  \x1b[2m→ ${name}\x1b[0m\n`);
            }
          }
        }
      }
    }
  } catch (err) {
    logError(`Agent failed: ${err}`);
    throw err;
  }

  const result = parseMessages(messages);
  logAgentStats(result);

  // Update catalog with generated data
  await updateCatalog(DATA_DIR);
  logSuccess(`Generation complete for "${opts.target}" (${opts.level})`);

  // Print the agent's summary
  if (result.text) {
    console.log("\n--- Agent Summary ---");
    console.log(result.text);
  }

  // Count boundaries from generated data
  let boundaryCount = 0;
  try {
    // Scan data dir for the most recently modified boundaries-flat.json
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.name === "boundaries-flat.json") {
        const fullPath = path.join(entry.parentPath ?? entry.path, entry.name);
        const raw = await fs.readFile(fullPath, "utf-8");
        const arr = JSON.parse(raw) as BoundaryEntity[];
        if (Array.isArray(arr)) boundaryCount = Math.max(boundaryCount, arr.length);
      }
    }
  } catch {
    // best effort
  }

  return {
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    numTurns: result.numTurns,
    boundaryCount,
  };
}
