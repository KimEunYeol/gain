import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = process.cwd();
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const expected = "11.19.0";
function run(command, args) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.error || r.status !== 0) throw new Error(command + " failed");
}
export async function check({ build = true } = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error("Node 24.x required");
  const version = spawnSync("pnpm", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (version.status !== 0 || version.stdout.trim() !== expected)
    throw new Error("pnpm " + expected + " required");
  if (pkg.scripts.typecheck) run("pnpm", ["typecheck"]);
  else run("pnpm", ["exec", "tsc", "-b"]);
  if (pkg.scripts.lint) run("pnpm", ["lint"]);
  else
    console.warn(
      "LINT GAP: no configured lint script; record this release limitation.",
    );
  run("pnpm", ["test"]);
  run("pnpm", ["audit", "--prod", "--audit-level", "high"]);
  if (build)
    run("pnpm", [pkg.scripts["build:deploy"] ? "build:deploy" : "build"]);
}
export async function manifest({ verified = false, stage = "inventory" } = {}) {
  const excluded = new Set([
    ".git",
    ".next",
    ".vercel",
    ".deployment",
    ".openai",
    ".pnpm-store",
    ".deploy-tools",
    "node_modules",
    "dist",
    "test-results",
    "design-previews",
    "backups",
    ".tools",
    ".codex",
    ".agents",
  ]);
  const files = [];
  async function walk(dir, prefix = "") {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (
        excluded.has(item.name) ||
        item.name.startsWith(".env") ||
        item.isSymbolicLink()
      )
        continue;
      const relative = prefix + item.name;
      if (item.isDirectory())
        await walk(path.join(dir, item.name), relative + "/");
      else if (
        /\.(?:ts|tsx|js|mjs|json|yaml|yml|sql|css|html|svg|md)$/.test(item.name)
      ) {
        files.push({
          path: relative,
          sha256: createHash("sha256")
            .update(await readFile(path.join(dir, item.name)))
            .digest("hex"),
        });
      }
    }
  }
  await walk(root);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const git = spawnSync(
    "git",
    ["-c", "safe.directory=" + root.replaceAll("\\", "/"), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  );
  const status = spawnSync(
    "git",
    [
      "-c",
      "safe.directory=" + root.replaceAll("\\", "/"),
      "status",
      "--porcelain",
    ],
    { encoding: "utf8" },
  );
  const result = {
    verified,
    stage,
    checkedAt: new Date().toISOString(),
    node: process.version,
    pnpm: expected,
    commit: git.status === 0 ? git.stdout.trim() : null,
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
    sourceSha256: createHash("sha256")
      .update(JSON.stringify(files))
      .digest("hex"),
    migrations: files.filter((f) => f.path.startsWith("supabase/migrations/")),
    lintConfigured: Boolean(pkg.scripts.lint),
    files,
  };
  await mkdir(".deployment", { recursive: true });
  await writeFile(
    ".deployment/release-manifest.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      manifest: ".deployment/release-manifest.json",
      commit: result.commit,
      dirty: result.dirty,
      sourceSha256: result.sourceSha256,
    }),
  );
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/ops-check.mjs")
) {
  if (!process.argv.includes("--manifest-only"))
    await check({ build: !process.argv.includes("--prebuild") });
  await manifest({
    verified: !process.argv.includes("--manifest-only"),
    stage: process.argv.includes("--manifest-only")
      ? "inventory"
      : process.argv.includes("--prebuild")
        ? "prebuild"
        : "full",
  });
}
