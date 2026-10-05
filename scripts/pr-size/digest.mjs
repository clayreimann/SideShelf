#!/usr/bin/env node
/** Generates .codex/hooks.json pinning local.mjs + core.mjs: `node scripts/pr-size/digest.mjs > .codex/hooks.json`. */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PINNED = ["local.mjs", "core.mjs"];

/** SHA-256 over each pinned file, framed by name and length; must match the bootstrap below. */
export function hookDigest(dir = HERE) {
  const hash = createHash("sha256");
  for (const name of PINNED) {
    const bytes = readFileSync(join(dir, name));
    hash.update(`${name}\n${bytes.length}\n`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

// Builtins only until the digest matches; any failure exits 0 silently. No single quotes (shell-quoted).
const bootstrap = (digest) =>
  [
    'const x=require("child_process"),fs=require("fs"),p=require("path"),u=require("url"),h=require("crypto");',
    'let i="";process.stdin.on("data",d=>i+=d).on("end",async()=>{try{',
    'const j=JSON.parse(i||"{}");',
    'const r=x.execFileSync("git",["rev-parse","--show-toplevel"],{cwd:j.cwd||process.cwd(),encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();',
    'const d=p.join(r,"scripts","pr-size"),s=h.createHash("sha256");',
    `for(const n of ${JSON.stringify(PINNED)}){const b=fs.readFileSync(p.join(d,n));s.update(n+"\\n"+b.length+"\\n");s.update(b)}`,
    `if(s.digest("hex")!=="${digest}")return;`,
    'const m=await import(u.pathToFileURL(p.join(d,"local.mjs")).href);',
    "const o=await m.runHook(j);if(o)process.stdout.write(JSON.stringify(o))}catch{}});",
  ].join("");

export function codexHooksConfig(digest) {
  const command = `node -e '${bootstrap(digest)}' 2>/dev/null; exit 0`;
  return {
    hooks: {
      PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 15 }] }],
    },
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(codexHooksConfig(hookDigest()), null, 2)}\n`);
}
