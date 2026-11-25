import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
const PORT = 5199;

export type Site = { url: string; stop: () => Promise<void> };

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Builds the packages and serves the docs site with Vite on port 5199.
 * `stop` ends the server and everything it started.
 */
export async function startSite({ build }: { build: boolean }): Promise<Site> {
  const url = `http://localhost:${PORT}`;
  if (await answers(url)) {
    throw new Error(`Port ${PORT} already answers. Stop that server, or pass --url ${url} to use it.`);
  }

  if (build) {
    console.log("Building packages (pnpm build:packages)…");
    const built = spawnSync("pnpm", ["build:packages"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (built.status !== 0) {
      throw new Error(`pnpm build:packages failed:\n${built.stdout}\n${built.stderr}`);
    }
  }

  console.log(`Starting the site on ${url}…`);
  // Its own process group, so stopping it also stops Vite under pnpm.
  const child = spawn("pnpm", ["--filter", "@booki-aui/www", "exec", "vite", "--port", String(PORT), "--strictPort"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  let exited = false;
  const exit = new Promise<void>((resolve) =>
    child.on("exit", () => {
      exited = true;
      resolve();
    }),
  );

  const stop = async () => {
    if (exited || child.pid === undefined) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    await Promise.race([exit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (!exited) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  };

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`The site stopped before it answered:\n${log}`);
    if (await answers(`${url}/bench/semantic`)) return { url, stop };
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await stop();
  throw new Error(`The site did not answer within 60 s:\n${log}`);
}
