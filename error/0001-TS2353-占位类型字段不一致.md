# 0001 自定义事件类型缺少实际需要赋值的字段

## 错误提示

```
src/services/api/stream.ts(40,40): error TS2353: Object literal may only specify known properties, and 'messageId' does not exist in type 'StreamMessageStartEvent'.
src/services/api/stream.ts(81,39): error TS2353: Object literal may only specify known properties, and 'stopReason' does not exist in type 'StreamMessageDoneEvent'.
```

## 原因

`src/types/stream.ts` 里的占位定义（`role`、仅含 `usage`）与实际 `yield` 的字段不一致。TypeScript 对象字面量赋值检查会拒绝类型中不存在的属性，即使类型是自研的、与运行时代码无关。

## 修复

让类型定义跟随真实消费方的字段：

```ts
export interface StreamMessageStartEvent {
  type: "message_start";
  messageId: string;
}

export interface StreamMessageDoneEvent {
  type: "message_done";
  stopReason: string;
  usage: Usage;
}
```

## 注意

先写实现、后写类型时，`tsc --noEmit` 会立刻暴露不一致。不要用 `as any` 绕开——占位类型通常就是错的。
