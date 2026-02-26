/**
 * SDK message parsing helpers.
 * Adapted from crs-validator-mcp/agent-tests/helpers.ts for boundary generation.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCall {
  name: string;
  id: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;
  toolName: string;
  content: string;
  parsed: Record<string, unknown> | null;
}

export interface AgentResult {
  text: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  sessionId: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

export function parseMessages(messages: SDKMessage[]): AgentResult {
  const toolCalls: ToolCall[] = [];
  const toolResults: ToolResult[] = [];
  const textParts: string[] = [];
  const toolUseIdToName = new Map<string, string>();
  let sessionId = "";
  let costUsd = 0;
  let durationMs = 0;
  let numTurns = 0;

  for (const message of messages) {
    // System init
    if (message.type === "system" && "subtype" in message && message.subtype === "init") {
      sessionId = (message as Record<string, unknown>).session_id as string;
    }

    // Assistant message
    if (message.type === "assistant") {
      const msg = message as Record<string, unknown>;
      const content = msg.message as { content: Array<Record<string, unknown>> } | undefined;
      if (content?.content) {
        for (const block of content.content) {
          if (block.type === "text") {
            textParts.push(block.text as string);
          }
          if (block.type === "tool_use") {
            const tc: ToolCall = {
              name: block.name as string,
              id: block.id as string,
              input: block.input as Record<string, unknown>,
            };
            toolCalls.push(tc);
            toolUseIdToName.set(tc.id, tc.name);
          }
        }
      }
    }

    // User message containing tool results
    if (message.type === "user") {
      const msg = message as Record<string, unknown>;
      const content = msg.message as { content: Array<Record<string, unknown>> } | undefined;
      if (content?.content) {
        for (const block of content.content) {
          if (block.type === "tool_result") {
            const rawContent = block.content;
            let textContent = "";
            if (typeof rawContent === "string") {
              textContent = rawContent;
            } else if (Array.isArray(rawContent)) {
              textContent = rawContent
                .filter((c: Record<string, unknown>) => c.type === "text")
                .map((c: Record<string, unknown>) => c.text)
                .join("");
            }

            let parsed: Record<string, unknown> | null = null;
            try {
              parsed = JSON.parse(textContent);
            } catch {
              // not JSON
            }

            toolResults.push({
              toolUseId: block.tool_use_id as string,
              toolName: toolUseIdToName.get(block.tool_use_id as string) ?? "unknown",
              content: textContent,
              parsed,
            });
          }
        }
      }
    }

    // Final result
    if (message.type === "result") {
      const r = message as Record<string, unknown>;
      sessionId = (r.session_id as string) ?? sessionId;
      costUsd = (r.total_cost_usd as number) ?? 0;
      durationMs = (r.duration_ms as number) ?? 0;
      numTurns = (r.num_turns as number) ?? 0;
      if (r.subtype === "success" && r.result) {
        textParts.push(r.result as string);
      }
    }
  }

  return { text: textParts.join("\n"), toolCalls, toolResults, sessionId, costUsd, durationMs, numTurns };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

export function logInfo(message: string) {
  console.log(`${C.cyan}[info]${C.reset} ${message}`);
}

export function logSuccess(message: string) {
  console.log(`${C.green}[done]${C.reset} ${message}`);
}

export function logError(message: string) {
  console.error(`${C.red}[error]${C.reset} ${message}`);
}

export function logWarn(message: string) {
  console.log(`${C.yellow}[warn]${C.reset} ${message}`);
}

export function logAgentStats(result: AgentResult) {
  const toolNames = result.toolCalls.map((tc) => tc.name);
  const uniqueTools = [...new Set(toolNames)];
  console.log(
    `${C.dim}  Agent stats: $${result.costUsd.toFixed(4)} | ${result.numTurns} turns | ${(result.durationMs / 1000).toFixed(1)}s | ${toolNames.length} tool calls (${uniqueTools.length} unique)${C.reset}`,
  );
}
