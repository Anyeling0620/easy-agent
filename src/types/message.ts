// 三种内容块
export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// 消息 = role + content blocks
export interface UserMessage {
  role: "user";
  content: string | ContentBlock[];
}

export interface AssistantMessage {
  role: "assistant";
  content: string | ContentBlock[];
}

// 会话历史里的一条消息，可能是任一角色
export type MessageParam = UserMessage | AssistantMessage;

// 工具定义：与 OpenAI 函数调用结构对齐，不做厂商绑定
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
