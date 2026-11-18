import React, { useCallback, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { streamMessage } from "../services/api/stream.js";
import type { AssistantMessage, ContentBlock, MessageParam, UserMessage } from "../types/message.js";
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

  /** 发送一条用户消息并流式接收回复；abort 通过 signal 检查后跳出循环。 */
  const handleSubmit = useCallback(
    async (text: string) => {
      const userMessage: UserMessage = { role: "user", content: text };
      const history: MessageParam[] = [...messagesRef.current, userMessage];

      setMessages(history);
      setInputValue("");
      setIsLoading(true);
      setStreamingText("");
      setToolCalls([]);
      setErrorText(null);
      setInfoMessage(null);

      const controller = new AbortController();
      abortRef.current = controller;
      let assistantText = "";

      try {
        const gen = streamMessage({ messages: history, model, system });
        for await (const event of gen) {
          if (controller.signal.aborted) break;

          switch (event.type) {
            case "text":
              assistantText += event.text;
              setStreamingText(assistantText);
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
              break;
          }
        }

        if (controller.signal.aborted) {
          setInfoMessage("已中断");
        } else if (assistantText) {
          const reply: AssistantMessage = { role: "assistant", content: assistantText };
          setMessages((prev) => [...prev, reply]);
        }
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : String(err));
      } finally {
        abortRef.current = null;
        setIsLoading(false);
        setSpinnerLabel("Thinking");
        setStreamingText("");
      }
    },
    [model, system],
  );

  // 键盘输入：加载中 Esc/Ctrl+C 中断，空闲时 Ctrl+C 退出，Enter 提交。
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (isLoading) {
        abortRef.current?.abort();
      } else {
        exit();
      }
      return;
    }

    if (isLoading) {
      if (key.escape) abortRef.current?.abort();
      return;
    }

    if (key.return) {
      const text = inputValue.trim();
      if (text) void handleSubmit(text);
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
