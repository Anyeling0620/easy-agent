import "dotenv/config";
import React from "react";
import { render } from "ink";
import { App } from "../ui/App.js";

// 非交互冒烟：渲染 App 后 1.5 秒退出，确认组件可挂载
const instance = render(<App system="Reply in Chinese, one short sentence." />);
setTimeout(() => {
  instance.unmount();
  process.exit(0);
}, 1500);
