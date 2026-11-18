import "dotenv/config";
import { streamMessage } from "../services/api/stream.js";

// 中断验证：发出请求后立刻 abort，应当抛 AbortError 而不是继续跑完
const controller = new AbortController();
const gen = streamMessage({
  messages: [{ role: "user", content: "写一段 500 字关于循环的解释" }],
  signal: controller.signal,
});

setTimeout(() => controller.abort(), 50);
try {
  for await (const _ of gen) { /* 等待被中断 */ }
  console.log("NOT_ABORTED");
} catch (err) {
  console.log("aborted:", err instanceof Error ? err.name : String(err));
}
