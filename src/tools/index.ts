import type { ContentBlock, ToolDefinition, ToolResultBlock, ToolUseBlock } from "../types/message.js";

// 工具注册表：后续实现具体工具后往这里追加，App 会把它原样传给 API
export const toolsApiParams: ToolDefinition[] = [];

/** 按名字执行工具；未注册的工具返回错误结果，不让整轮对话崩掉。 */
export async function runTool(block: ToolUseBlock): Promise<ToolResultBlock> {
  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: `Tool "${block.name}" is not implemented yet.`,
    is_error: true,
  };
}

/** 执行 assistant 消息里的全部 tool_use 块，拼成一条 user 消息的 tool_result 列表。 */
export async function executeTools(
  contentBlocks: ContentBlock[],
  signal?: AbortSignal,
): Promise<{ role: "user"; content: ToolResultBlock[] }> {
  const toolUses = contentBlocks.filter((b): b is ToolUseBlock => b.type === "tool_use");

  const results: ToolResultBlock[] = [];
  for (const block of toolUses) {
    if (signal?.aborted) break;
    results.push(await runTool(block));
  }

  return { role: "user", content: results };
}
