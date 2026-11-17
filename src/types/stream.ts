// 流式事件
export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface StreamTextEvent {
  type: "text";
  text: string;
}

export interface StreamToolUseStartEvent {
  type: "tool_use_start";
  id: string;
  name: string;
}

export interface StreamToolUseInputEvent {
  type: "tool_use_input";
  id: string;
  partialJson: string;
}

export interface StreamMessageStartEvent {
  type: "message_start";
  role: "assistant";
}

export interface StreamMessageDoneEvent {
  type: "message_done";
  usage: Usage;
}

export interface StreamErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent =
  | StreamTextEvent // 文字增量
  | StreamToolUseStartEvent // 工具调用开始 "[调用工具: Read]"
  | StreamToolUseInputEvent // 工具参数 JSON 碎片
  | StreamMessageStartEvent // 消息开始
  | StreamMessageDoneEvent // 消息结束（含 usage）
  | StreamErrorEvent; // 错误
