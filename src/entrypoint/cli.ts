#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function version(): string {
  const pkg = JSON.parse(readFileSync(join(here, "../../package.json"), "utf8")) as { version: string };
  return pkg.version;
}

function main(argv: string[]): void {
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(version());
    return;
  }
  console.log(`easy-agent ${version()}`);
}

main(process.argv.slice(2));
