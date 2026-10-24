// Builds with the private register bundled (needs data/private/register.json). Never deploy this build publicly.
import { spawnSync } from "node:child_process";

const r = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, VITE_DATASET: "register" } });
process.exit(r.status ?? 1);
