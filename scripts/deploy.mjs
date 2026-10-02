import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { check, manifest } from "./ops-check.mjs";
async function main() {
  let release;
  if (!process.argv.includes("--check")) {
    const envIndex = process.argv.indexOf("--env-file");
    const envFile = envIndex >= 0 ? process.argv[envIndex + 1] : null;
    if (!process.argv.includes("--production") || !envFile)
      throw new Error(
        "Usage: node scripts/deploy.mjs --production --env-file <isolated-production-file>",
      );
    if (path.resolve(envFile) === path.resolve(".env.local"))
      throw new Error("Use a separate production env file.");
    const selected = parseEnv(await readFile(envFile, "utf8"));
    for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"])
      process.env[key] = selected[key] || "";
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY)
      throw new Error("Explicit production Supabase configuration required.");
    let url;
    try {
      url = new URL(process.env.VITE_SUPABASE_URL);
    } catch {
      throw new Error("Production Supabase URL must be an HTTPS origin.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("Production Supabase URL must be an HTTPS origin.");
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!key.startsWith("sb_publishable_")) {
      let role;
      try {
        role = JSON.parse(
          Buffer.from(key.split(".")[1] || "", "base64url").toString(),
        ).role;
      } catch {}
      if (role !== "anon")
        throw new Error(
          "Only public publishable/anon keys may enter the browser build.",
        );
    }
    await check();
    release = await manifest({ verified: true, stage: "full" });
  }
  const authPath = path.join(
    process.env.APPDATA,
    "com.vercel.cli/Data/auth.json",
  );
  let credentials = JSON.parse(await readFile(authPath, "utf8"));
  if (
    credentials.refreshToken &&
    credentials.expiresAt <= Math.floor(Date.now() / 1000) + 60
  ) {
    const discovery = await fetch(
      "https://vercel.com/.well-known/openid-configuration",
    ).then((r) => r.json());
    const response = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp",
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
      }),
    });
    const tokens = await response.json();
    if (!response.ok)
      throw new Error(
        `Vercel login refresh failed: ${tokens.error_description || tokens.error || response.status}`,
      );
    credentials = {
      ...credentials,
      token: tokens.access_token,
      refreshToken: tokens.refresh_token || credentials.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };
    await writeFile(authPath, JSON.stringify(credentials, null, 2));
    console.log("Refreshed the saved Vercel login.");
  }
  const headers = {
    Authorization: `Bearer ${credentials.token}`,
    "Content-Type": "application/json",
  };
  async function api(route, method = "GET", body) {
    const r = await fetch(`https://api.vercel.com${route}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok)
      throw new Error(
        `${r.status}: ${data.error?.message || "Vercel request failed"}`,
      );
    return data;
  }
  const teams = await api("/v2/teams");
  const team = teams.teams.find((t) => t.slug === "kimeunyeols-projects");
  if (!team || team.billing?.plan !== "hobby")
    throw new Error(
      "A verified Hobby team is required. No paid deployment performed.",
    );
  console.log("Verified Vercel Hobby team:", team.slug);
  const scope = `?teamId=${team.id}`;
  if (process.argv.includes("--check")) return;
  const files = [];
  async function collect(dir, prefix = "") {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix + file.name;
      if (file.isDirectory())
        await collect(path.join(dir, file.name), rel + "/");
      else
        files.push({
          file: rel,
          data: (await readFile(path.join(dir, file.name))).toString("base64"),
          encoding: "base64",
        });
    }
  }
  await collect("dist");
  const sourceConfig = JSON.parse(await readFile("vercel.json", "utf8"));
  files.push({
    file: "vercel.json",
    data: JSON.stringify({
      rewrites: sourceConfig.rewrites,
      headers: sourceConfig.headers,
    }),
    encoding: "utf-8",
  });
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  release.artifactSha256 = createHash("sha256")
    .update(JSON.stringify(files))
    .digest("hex");
  const deployment = await api(`/v13/deployments${scope}`, "POST", {
    name: "gain-music-club",
    target: "production",
    files,
    meta: {
      sourceSha256: release.sourceSha256,
      artifactSha256: release.artifactSha256,
      gitCommitSha: release.commit || "unversioned",
    },
    projectSettings: {
      framework: null,
      buildCommand: null,
      installCommand: null,
      outputDirectory: null,
    },
  });
  await writeFile(
    `.deployment/${deployment.id}-release.json`,
    JSON.stringify({ ...release, deploymentId: deployment.id }, null, 2) + "\n",
  );
  await mkdir(".vercel", { recursive: true });
  await writeFile(
    ".vercel/deployment.json",
    JSON.stringify(
      {
        id: deployment.id,
        teamId: team.id,
        url: deployment.url,
        projectId: deployment.projectId,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      id: deployment.id,
      url: deployment.url,
      status: deployment.readyState,
    }),
  );
  for (let i = 0; i < 12; i++) {
    const d = await api(`/v13/deployments/${deployment.id}${scope}`);
    if (d.readyState === "READY") {
      console.log(
        JSON.stringify({
          status: "READY",
          url: `https://${d.url}`,
          aliases: d.alias,
        }),
      );
      return;
    }
    if (["ERROR", "CANCELED"].includes(d.readyState))
      throw new Error(d.errorMessage || d.readyState);
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("Deployment is still building. Check the saved deployment ID.");
}
await main();
