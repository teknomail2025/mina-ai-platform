import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(workerRoot, "test");

function collectTestFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
    } else if (entry.isFile() && /\.test\.(?:cjs|mjs)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = collectTestFiles(testRoot).sort();
if (testFiles.length === 0) {
  console.error("No Worker .test.cjs or .test.mjs modules were found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: workerRoot,
  stdio: "inherit"
});

if (result.error) {
  console.error("Could not start the Node test runner:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
