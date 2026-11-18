import React, { useCallback, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { streamMessage, type StreamResult } from "../services/api/stream.js";
import type { ContentBlock, MessageParam, UserMessage } from "../types/message.js";
import type { StreamEvent } from "../types/stream.js";
import { toolsApiParams } from "../tools/index.js";
import { Spinner } from "./components/Spinner.js";

interface AppProps {
  model?: string;
  system?: string;
}

interface ToolCallInfo {
  id: string;
  name: string;
}

/** 把消息内容里的文本块拼成可显示的字符串；工具块只显示名称。 */
function renderContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "tool_use") return `[tool: ${b.name}]`;
      return "[tool result]";
    })
    .join("");
}

export function App({ model, system }: AppProps): React.ReactNode {
  const { exit } = useApp();
  // 非 TTY（管道、测试、piped stdin）下没有 raw mode，useInput 会抛错，此时禁用输入捕获
  const { isRawModeSupported } = useStdin();

  // 对话数据
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [inputValue, setInputValue] = useState("");

  // UI 状态
  const [isLoading, setIsLoading] = useState(false);
  const [spinnerLabel, setSpinnerLabel] = useState("Thinking");
  const [streamingText, setStreamingText] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [lastUsage, setLastUsage] = useState<{ input: number; output: number } | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // 中断控制（不触发重渲染，用 useRef）
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<MessageParam[]>([]);
  messagesRef.current = messages;

  /** 跑一整轮流式请求：逐事件更新 UI，返回最终结果供上层拼进对话历史。 */
  const runStreamingTurn = useCallback(
    async (
      currentMessages: MessageParam[],
      signal?: AbortSignal,
    ): Promise<StreamResult | null> => {
      const generator = streamMessage({
        messages: [...currentMessages],
        model,
        system,
        tools: toolsApiParams.length > 0 ? toolsApiParams : undefined,
        signal,
      });

      let accumulatedText = "";

      while (true) {
        const { value, done } = await generator.next();
        if (done) return value ?? null;

        const event = value as StreamEvent;
        switch (event.type) {
          case "text":
            accumulatedText += event.text;
            setStreamingText(accumulatedText); // 触发重渲染，终端实时更新
            break;
          case "tool_use_start":
            setToolCalls((prev) => [...prev, { id: event.id, name: event.name }]);
            setSpinnerLabel(`Calling ${event.name}`);
            break;
          case "message_done":
            setLastUsage({ input: event.usage.input_tokens, output: event.usage.output_tokens });
            break;
          case "error":
            setErrorText(event.message);
            return null;
        }
      }
    },
    [model, system],
  );

  /** 发送一条用户消息：追加到历史、跑一轮流式请求、把回复写回历史。 */
  const handleSubmit = useCallback(
    async (text: string) => {
      const userMessage: UserMessage = { role: "user", content: text };
      const history: MessageParam[] = [...messagesRef.current, userMessage];

      setMessages(history);
      setIsLoading(true);
      setStreamingText("");
      setToolCalls([]);
      setErrorText(null);
      setInfoMessage(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await runStreamingTurn(history, controller.signal);
        if (result) {
          setMessages((prev) => [...prev, result.assistantMessage]);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          setInfoMessage("Interrupted.");
        } else {
          setErrorText(err instanceof Error ? err.message : String(err));
        }
      } finally {
        abortRef.current = null;
        setIsLoading(false);
        setSpinnerLabel("Thinking");
        setStreamingText("");
      }
    },
    [runStreamingTurn],
  );

  // 键盘输入：Ctrl+C 中断当前请求，Ctrl+D 退出，Enter 提交。
  useInput((input, key) => {
    // Ctrl+C：中断当前请求
    if (key.ctrl && input === "c") {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        setIsLoading(false);
        setStreamingText("");
        setInfoMessage("Interrupted.");
      }
      return;
    }

    // Ctrl+D：退出程序
    if (key.ctrl && input === "d") {
      exit();
      return;
    }

    // 正在加载时忽略普通输入
    if (isLoading) return;

    // 回车：提交消息
    if (key.return) {
      const text = inputValue;
      setInputValue("");
      void handleSubmit(text);
      return;
    }

    if (key.backspace || key.delete) {
      setInputValue((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setInputValue((prev) => prev + input);
    }
  }, { isActive: isRawModeSupported });

  return (
    <Box flexDirection="column">
      {messages.map((message, index) => (
        <Box key={index} flexDirection="column">
          <Text color={message.role === "user" ? "cyan" : "green"}>
            {message.role === "user" ? "> " : ""}
            {renderContent(message.content)}
          </Text>
        </Box>
      ))}

      {streamingText ? <Text>{streamingText}</Text> : null}

      {toolCalls.map((call) => (
        <Text key={call.id} dimColor>
          [tool: {call.name}]
        </Text>
      ))}

      {isLoading ? <Spinner label={spinnerLabel} /> : null}
      {infoMessage ? <Text color="yellow">[info] {infoMessage}</Text> : null}
      {errorText ? <Text color="red">[error] {errorText}</Text> : null}
      {lastUsage && !isLoading ? (
        <Text dimColor>
          [usage] {lastUsage.input} in / {lastUsage.output} out
        </Text>
      ) : null}

      {!isLoading ? <Text color="gray">{"> "}{inputValue}</Text> : null}
    </Box>
  );
}
