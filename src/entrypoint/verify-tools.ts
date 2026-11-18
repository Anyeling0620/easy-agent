import "dotenv/config";
import { streamMessage } from "../services/api/stream.js";

// 带 signal 与 tools 的最小链路验证：确认参数被正确透传且能正常返回
const controller = new AbortController();
const gen = streamMessage({
  messages: [{ role: "user", content: "回复两个字：收到" }],
  system: "Reply in Chinese, extremely briefly.",
  signal: controller.signal,
  tools: [
    {
      name: "noop",
      description: "Do nothing.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
  ],
});

let text = "";
let stopped = "";
for await (const event of gen) {
  if (event.type === "text") text += event.text;
  if (event.type === "message_done") stopped = event.stopReason;
}
console.log("text:", JSON.stringify(text.trim()));
console.log("stopReason:", stopped);
