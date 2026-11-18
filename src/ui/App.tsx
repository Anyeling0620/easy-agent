import React, { useCallback, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { streamMessage, type StreamResult } from "../services/api/stream.js";
import type { ContentBlock, MessageParam } from "../types/message.js";
import type { StreamEvent } from "../types/stream.js";
import { executeTools, toolsApiParams } from "../tools/index.js";
import { MAX_TOOL_TURNS } from "../core/index.js";
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

  /** 用户回车后的完整流程：slash 命令拦截，否则进入 Agentic Loop。 */
  const handleSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const trimmed = text.trim();

      // Slash commands 本地拦截
      if (trimmed === "/exit" || trimmed === "/quit") { exit(); return; }
      if (trimmed === "/clear") {
        setMessages([]);
        messagesRef.current = [];
        setInfoMessage("Conversation cleared.");
        return;
      }
      if (trimmed === "/history") {
        setInfoMessage(`${messagesRef.current.length} messages in conversation.`);
        return;
      }

      // 重置 UI 状态
      setStreamingText("");
      setToolCalls([]);
      setErrorText(null);
      setInfoMessage(null);
      setIsLoading(true);
      setSpinnerLabel("Thinking");

      // 追加 user message，创建本轮消息数组
      const userMsg: MessageParam = { role: "user", content: trimmed };
      let loopMessages: MessageParam[] = [...messagesRef.current, userMsg];
      setMessages(loopMessages);
      messagesRef.current = loopMessages;

      const abort = new AbortController();
      abortRef.current = abort;

      let totalIn = 0;
      let totalOut = 0;

      try {
        let turnCount = 0;
        // Agentic Loop：AI 调用工具 → 执行 → 结果喂回去 → 循环
        while (turnCount < MAX_TOOL_TURNS) {
          turnCount++;
          setStreamingText("");

          const result = await runStreamingTurn(loopMessages, abort.signal);
          if (!result || abort.signal.aborted) break;

          totalIn += result.usage.input_tokens;
          totalOut += result.usage.output_tokens;

          // 追加 assistant message
          const assistantMsg: MessageParam = {
            role: "assistant",
            content: result.assistantMessage.content,
          };
          loopMessages = [...loopMessages, assistantMsg];
          setMessages(loopMessages);
          messagesRef.current = loopMessages;

          // 如果 AI 想调工具 → 执行工具 → 追加 tool_result → 继续循环
          if (result.stopReason === "tool_use") {
            const contentBlocks = result.assistantMessage.content;
            if (Array.isArray(contentBlocks)) {
              const toolResultMsg = await executeTools(contentBlocks, abort.signal);
              loopMessages = [...loopMessages, toolResultMsg];
              setMessages(loopMessages);
              messagesRef.current = loopMessages;
              setSpinnerLabel("Thinking");
              continue;
            }
          }
          break; // stop_reason 不是 tool_use → 对话结束
        }

        setLastUsage({ input: totalIn, output: totalOut });
      } catch (err: unknown) {
        // SDK 中断抛的是 APIUserAbortError，统一按 signal 判断
        if (abort.signal.aborted) {
          setInfoMessage("Interrupted.");
        } else {
          setErrorText(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [exit, runStreamingTurn],
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
