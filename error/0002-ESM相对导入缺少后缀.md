# 0002 ESM 下相对导入缺少 .js 后缀

## 错误提示

```
src/services/api/stream.ts(20,5): error TS2322: Type '(AssistantMessage | UserMessage)[]' is not assignable to type 'MessageParam[]'.
```

（同类问题的典型运行时错误）

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../dist/services/api/streaming' imported from ...
```

## 原因

本项目 `package.json` 设了 `"type": "module"`，走 ESM。ESM 不猜扩展名，相对导入必须写全 `.js`（源码是 `.ts`，编译后是 `.js`，所以导入时也写 `.js`）。另外 `moduleResolution: NodeNext` 负责在编译期就报出这类错误；若配成 `node`/`bundler`，则要等到实际运行才炸。

## 修复

- 相对导入统一写 `./stream.js`、`../types/message.js`，不写 `./stream` 或 `./stream.ts`。
- `tsconfig.json` 保持：

```json
{
  "module": "NodeNext",
  "moduleResolution": "NodeNext"
}
```

## 注意

`tsx` 本地跑会掩盖这个问题（它自动解析无后缀导入），`npm run build && node dist/...` 才暴露。上线前务必跑一次真实构建产物。
