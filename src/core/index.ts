import type { ContentBlock, MessageParam, ToolDefinition } from "../types/message.js";

// 单次 Agentic Loop 最多允许的模型回合数，防止工具调用无限循环
export const MAX_TOOL_TURNS = 10;
