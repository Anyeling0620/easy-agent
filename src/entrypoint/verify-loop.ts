import "dotenv/config";
import { executeTools, toolsApiParams } from "../tools/index.js";
import { MAX_TOOL_TURNS } from "../core/index.js";
import { streamMessage } from "../services/api/stream.js";

// 验证工具执行链路：伪造一个 tool_use 块，看 executeTools 是否产出错误结果
const fake = await executeTools([
  { type: "tool_use", id: "toolu_test", name: "NoSuchTool", input: {} },
]);

console.log("tools registered:", toolsApiParams.length);
console.log("max turns:", MAX_TOOL_TURNS);
console.log("tool_result:", JSON.stringify(fake));
if (fake.content[0]?.is_error !== true) throw new Error("expected error result");
if (fake.content[0]?.tool_use_id !== "toolu_test") throw new Error("id mismatch");
console.log("OK");
