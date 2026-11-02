// Mutation audit runner. It reads the mutants of a JSON config, applies one mutant at a time to its file,
// runs the test file of the mutant, and restores the original file. A mutant is killed only when bun reports
// a failing test (a "(fail)" line) and exits non-zero. A passing baseline runs before the first mutant and
// after the last one; the run stops when a baseline fails.
//
// Each file is copied to a backup (the file name plus BACKUP_SUFFIX) before a mutant is written. The backup
// restores the file on every exit path: normal end, SIGINT, SIGTERM, an uncaught exception, and process exit.
// A hard kill (for example SIGKILL, or TerminateProcess on Windows) cannot run a handler, so the next start
// restores any file that a backup still covers, before it runs anything else.
//
// Options (flag, then environment variable, then default):
//   --root=<dir>         MUTATION_ROOT        the repository root (default: the current directory)
//   --config=<file>      MUTATION_CONFIG      the mutant list, relative to the root (default: test/mutation/mutants.json)
//   --report=<file>      MUTATION_REPORT      a markdown report with the full text of each mutant (default: none)
//   --timeout-ms=<n>     MUTATION_TIMEOUT_MS  the longest run of one bun test, in milliseconds (default: 300000)
//   BUN_BIN                                   the bun executable (default: bun)
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const BACKUP_SUFFIX = ".mutation-backup";

const args = process.argv.slice(2);
function option(name, envName, fallback) {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  if (hit !== undefined) return hit.slice(name.length + 3);
  return process.env[envName] ?? fallback;
}

const root = resolve(option("root", "MUTATION_ROOT", process.cwd()));
const configPath = resolve(root, option("config", "MUTATION_CONFIG", "test/mutation/mutants.json"));
const reportPath = option("report", "MUTATION_REPORT", "");
const timeoutMs = Number(option("timeout-ms", "MUTATION_TIMEOUT_MS", "300000"));
const bun = process.env.BUN_BIN ?? "bun";

// A missing or unreadable config fails loudly. There is no built-in list to fall back to.
const config = JSON.parse(readFileSync(configPath, "utf8"));
const mutants = config.mutants;
if (!Array.isArray(mutants) || mutants.length === 0) {
  throw new Error(`no mutants in ${configPath}`);
}

const backupOf = (path) => `${path}${BACKUP_SUFFIX}`;

/** Restores every file that a backup covers, then removes the backup. Safe to call more than once. */
function restoreFromBackups() {
  for (const m of mutants) {
    const path = resolve(root, m.file);
    if (!existsSync(backupOf(path))) continue;
    copyFileSync(backupOf(path), path);
    rmSync(backupOf(path), { force: true });
  }
}

// The child that runs now. A stop signal kills it, so no bun test outlives the runner.
let activeChild = null;

function stop(reason, code) {
  if (activeChild !== null) activeChild.kill("SIGKILL");
  restoreFromBackups();
  console.error(`mutation run stopped (${reason}); the source files are restored`);
  process.exit(code);
}

process.on("SIGINT", () => stop("SIGINT", 1));
process.on("SIGTERM", () => stop("SIGTERM", 1));
process.on("uncaughtException", (err) => {
  console.error(err);
  stop("uncaught exception", 1);
});
process.on("exit", () => restoreFromBackups());

function runBun(testFile) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(bun, ["test", testFile], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    activeChild = child;
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (err) => {
      clearTimeout(timer);
      activeChild = null;
      rejectRun(err);
    });
    child.once("close", (status) => {
      clearTimeout(timer);
      activeChild = null;
      resolveRun({ passed: status === 0, failedLine: /\(fail\)/.test(out) });
    });
  });
}

async function baseline(testFiles) {
  for (const testFile of testFiles) {
    if (!(await runBun(testFile)).passed) return "FAIL";
  }
  return "pass";
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function lineAt(text, number) {
  return (text.split("\n")[number - 1] ?? "").replace(/\r$/, "");
}

async function main() {
  const recovered = mutants.map((m) => resolve(root, m.file)).filter((path) => existsSync(backupOf(path)));
  restoreFromBackups();
  if (recovered.length > 0) console.error(`restored ${recovered.length} file(s) that an interrupted run had mutated`);

  const testFiles = [...new Set(mutants.map((m) => m.test))];
  const before = await baseline(testFiles);
  if (before !== "pass") {
    console.error("baseline failed before the first mutant; no mutant was run");
    process.exit(1);
  }

  const results = [];
  for (const m of mutants) {
    const path = resolve(root, m.file);
    const original = readFileSync(path, "utf8");
    const hits = original.split(m.original).length - 1;
    if (hits !== 1) {
      results.push({ ...m, result: "invalid", detail: `the original text occurs ${hits} times` });
      continue;
    }
    const index = original.indexOf(m.original);
    const mutated = original.slice(0, index) + m.replacement + original.slice(index + m.original.length);
    const line = lineNumber(original, index);
    copyFileSync(path, backupOf(path));
    try {
      writeFileSync(path, mutated);
      const run = await runBun(m.test);
      const killed = !run.passed && run.failedLine;
      results.push({
        ...m,
        line,
        originalLine: lineAt(original, line),
        mutatedLine: lineAt(mutated, line),
        result: killed ? "killed" : "survived",
      });
    } finally {
      restoreFromBackups();
    }
  }

  const after = await baseline(testFiles);
  const valid = results.filter((r) => r.result !== "invalid");
  const scored = valid.filter((r) => r.equivalent === null);
  const killed = scored.filter((r) => r.result === "killed").length;
  const equivalent = valid.filter((r) => r.equivalent !== null).length;
  const summary = `killed ${killed} of ${scored.length} non-equivalent mutants; ${equivalent} equivalent excluded; ${results.length - valid.length} invalid`;

  if (reportPath !== "") {
    const lines = [
      "# Mutation report",
      "",
      `Baseline before: ${before}. Baseline after: ${after}.`,
      "",
      `Summary: ${summary}.`,
      "",
      "| id | file:line | result | equivalent reason |",
      "|---|---|---|---|",
    ];
    for (const r of results) {
      const where = r.line !== undefined ? `${r.file}:${r.line}` : r.file;
      lines.push(`| ${r.id} | ${where} | ${r.result} | ${r.equivalent ?? ""} |`);
    }
    lines.push("", "## Mutants", "");
    for (const r of results) {
      lines.push(`### ${r.id}: ${r.result}`, "", `- file: ${r.file}`, `- test: ${r.test}`);
      if (r.line !== undefined) lines.push(`- line: ${r.line}`);
      if (r.equivalent !== null) lines.push(`- equivalent: ${r.equivalent}`);
      if (r.detail !== undefined) lines.push(`- detail: ${r.detail}`);
      if (r.line !== undefined) {
        lines.push("", "original line:", "", "```", r.originalLine, "```", "", "mutated line:", "", "```", r.mutatedLine, "```");
      }
      lines.push("");
    }
    writeFileSync(reportPath, lines.join("\n"));
  }

  console.log(JSON.stringify({ before, after, summary, results: results.map(({ id, result, equivalent }) => ({ id, result, equivalent })) }, null, 2));
  if (before !== "pass" || after !== "pass") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  stop("error", 1);
});
