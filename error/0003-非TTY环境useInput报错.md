# 0003 非 TTY 环境下 useInput 抛 raw mode 错误

## 错误提示

```
ERROR Raw mode is not supported on the current process.stdin, which Ink uses
as input stream by default.
Read about how to prevent this error on
https://github.com/vadimdemedes/ink/#israwmodesupported
```

## 原因

ink 的 `useInput` 在挂载时调 `setRawMode(true)`。只有当 `stdin` 是真正的 TTY 时才支持 raw mode；在管道、重定向、CI 或 `tsx` 直接跑脚本（stdin 非终端）时，ink 直接 `throw`，而不是降级。

## 修复

用 `useStdin()` 读 `isRawModeSupported`，把它作为 `useInput` 的 `isActive` 参数：

```tsx
const { isRawModeSupported } = useStdin();

useInput((input, key) => { /* ... */ }, { isActive: isRawModeSupported });
```

`isActive: false` 时不注册监听，也不会进入 raw mode，非交互环境可安全渲染。

## 注意

不要用 `try/catch` 包 `useInput`——错误在 effect 里抛出，包不住。也不能只在入口判断 `process.stdin.isTTY`，因为 `render({ stdin })` 可以换成其他流，组件内判断更可靠。
