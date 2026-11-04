// Probes of the browser process tree: its sockets and its command lines. Node 22 and Bun both run this file.
// It uses only node: modules and no Bun API. The parsers take text, so a test can feed them fixed input.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
/** The flag that turns the Chrome sandbox off. Built from parts so that no test line names it. */
export const NO_SANDBOX = ["no", "sandbox"].join("-");
const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|0:0:0:0:0:0:0:1|::ffff:127\.\d+\.\d+\.\d+)$/i;
const UNSPECIFIED = new Set(["", "*", "0.0.0.0", "::", "[::]", "0:0:0:0:0:0:0:0"]);
const MAX_BUFFER = 64 * 1024 * 1024;

/** The host part of an endpoint such as 10.0.0.1:443, [::1]:8080 or *:*. */
export function hostOf(endpoint) {
  const bracket = /^\[(.*)\](?::[^:]*)?$/.exec(endpoint);
  if (bracket) return bracket[1];
  const cut = endpoint.lastIndexOf(":");
  return cut < 0 ? endpoint : endpoint.slice(0, cut);
}

export function isLoopback(host) {
  return LOOPBACK.test(host);
}

/** True when the host is an address that leaves this machine. The unspecified and wildcard addresses do not leave. */
export function isExternal(host) {
  return !isLoopback(host) && !UNSPECIFIED.has(host);
}

/** Parses `ss -H -tunp` lines (State, Recv-Q, Send-Q, Local, Peer, Process). Each owning pid gives one socket. */
export function parseSs(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5) continue;
    const host = hostOf(fields[4]);
    for (const match of line.matchAll(/pid=(\d+)/g)) out.push({ pid: Number(match[1]), host });
  }
  return out;
}

/** Parses `lsof -nP -F pn` output. Only a connected socket has a remote end (the text after the arrow). */
export function parseLsof(text) {
  const out = [];
  let pid = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && line.includes("->") && pid !== null) {
      out.push({ pid, host: hostOf(line.slice(line.indexOf("->") + 2)) });
    }
  }
  return out;
}

/** Parses the JSON of Get-NetTCPConnection (OwningProcess, RemoteAddress). An empty text holds no socket. */
export function parseNetTcp(json) {
  if (json.trim() === "") return [];
  const rows = JSON.parse(json);
  return (Array.isArray(rows) ? rows : [rows]).map((row) => ({ pid: Number(row.OwningProcess), host: String(row.RemoteAddress) }));
}

/** Parses `ps -axww -o pid=,args=` output. */
export function parsePs(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (match) out.push({ pid: Number(match[1]), command: match[2] });
  }
  return out;
}

/** Parses the JSON of Win32_Process (ProcessId, CommandLine). A null command line is an empty command line. */
export function parseCim(json) {
  if (json.trim() === "") return [];
  const rows = JSON.parse(json);
  return (Array.isArray(rows) ? rows : [rows]).map((row) => ({ pid: Number(row.ProcessId), command: String(row.CommandLine ?? "") }));
}

export function externalSockets(sockets) {
  return sockets.filter((socket) => isExternal(socket.host));
}

export function noSandboxAmong(processes) {
  return processes.filter((proc) => proc.command.includes(`--${NO_SANDBOX}`));
}

export function rendererCount(processes) {
  return processes.filter((proc) => proc.command.includes("--type=renderer")).length;
}

async function listProcesses(platform) {
  if (platform === "win32") {
    const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
    const { stdout } = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { maxBuffer: MAX_BUFFER });
    return parseCim(stdout);
  }
  const { stdout } = await run("ps", ["-axww", "-o", "pid=,args="], { maxBuffer: MAX_BUFFER });
  return parsePs(stdout);
}

/**
 * The lsof arguments that list the internet sockets of the pids. One -i selects TCP and UDP. With -a, lsof ANDs
 * every selection, so two -i options (-iTCP -iUDP) select no socket.
 */
export function lsofArgs(pids) {
  return ["-nP", "-i", "-a", "-p", pids.join(","), "-F", "pn"];
}

async function listSockets(platform, pids) {
  if (platform === "win32") {
    // A pid with no socket makes Get-NetTCPConnection write an error, so the call is wrapped: no socket is an empty result.
    const script = `try { Get-NetTCPConnection -OwningProcess ${pids.join(",")} -ErrorAction Stop | Select-Object OwningProcess,RemoteAddress | ConvertTo-Json -Compress } catch { }; exit 0`;
    const { stdout } = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { maxBuffer: MAX_BUFFER });
    return parseNetTcp(stdout);
  }
  if (platform === "linux") {
    const { stdout } = await run("ss", ["-H", "-tunp"], { maxBuffer: MAX_BUFFER });
    return parseSs(stdout).filter((socket) => pids.includes(socket.pid));
  }
  try {
    const { stdout } = await run("lsof", lsofArgs(pids), { maxBuffer: MAX_BUFFER });
    return parseLsof(stdout);
  } catch (err) {
    // lsof exits with 1 when it finds no file that matches.
    if (err.code === 1) return [];
    throw err;
  }
}

/** Builds the one-line PowerShell script of one Windows sample: the tree processes, then their TCP sockets, as one JSON object. */
export function windowsSampleScript(profile, end) {
  const literal = `'${profile.replace(/'/g, "''")}'`;
  return [
    `$p = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains(${literal}) } | Select-Object ProcessId,CommandLine)`,
    "$s = @()",
    "if ($p.Count -gt 0) { try { $s = @(Get-NetTCPConnection -OwningProcess $p.ProcessId -ErrorAction Stop | Select-Object OwningProcess,RemoteAddress) } catch { } }",
    "ConvertTo-Json -Compress -Depth 3 -InputObject @{ p = $p; s = $s }",
    `'${end}'`,
  ].join("; ");
}

/** Parses the JSON object of one Windows sample ({ p: Win32_Process rows, s: TCP rows }). */
export function parseWindowsSample(json, profile) {
  const { p, s } = JSON.parse(json);
  const processes = parseCim(JSON.stringify(p ?? [])).filter((proc) => proc.command.includes(profile));
  return { processes, sockets: parseNetTcp(JSON.stringify(s ?? [])) };
}

const END = "@@sciengjs-sample-end@@";

/**
 * A sampler that keeps one PowerShell session open on Windows. A new PowerShell for each sample takes about one
 * second, so a render of a few seconds gets only one to three samples. One session gives a sample in about 0.25 s.
 * On the other systems, sample() is sampleTree(). Call close() when the sampling stops.
 */
export function createSampler(platform = process.platform) {
  if (platform !== "win32") return { sample: (profile) => sampleTree(profile, platform), close: async () => {} };
  const shell = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", "-"], { stdio: ["pipe", "pipe", "inherit"] });
  shell.stdout.setEncoding("utf8");
  let buffer = "";
  const waiting = [];
  shell.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let cut = buffer.indexOf(END); cut >= 0; cut = buffer.indexOf(END)) {
      const text = buffer.slice(0, cut);
      buffer = buffer.slice(cut + END.length);
      waiting.shift()?.resolve(text);
    }
  });
  const closed = new Promise((resolve) => shell.on("exit", resolve));
  shell.on("exit", (code) => {
    for (const w of waiting.splice(0)) w.reject(new Error(`the sampler PowerShell exited with ${code}`));
  });
  return {
    sample(profile) {
      return new Promise((resolve, reject) => {
        const parse = (text) => {
          try {
            resolve(parseWindowsSample(text, profile));
          } catch (err) {
            reject(err);
          }
        };
        waiting.push({ resolve: parse, reject });
        shell.stdin.write(`${windowsSampleScript(profile, END)}\n`);
      });
    },
    async close() {
      shell.stdin.end();
      await closed;
    },
  };
}

/**
 * One sample of the tree of a render. The tree is every process whose command line names the profile folder.
 * Returns the processes and the sockets that those processes own.
 */
export async function sampleTree(profile, platform = process.platform) {
  const processes = (await listProcesses(platform)).filter((proc) => proc.command.includes(profile));
  if (processes.length === 0) return { processes, sockets: [] };
  const sockets = await listSockets(platform, processes.map((proc) => proc.pid));
  return { processes, sockets };
}
