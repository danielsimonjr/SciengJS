import { spawnSync } from "node:child_process";

/** The command line of every running process. Windows reads the process table through PowerShell. Other systems read ps. */
export function listCommandLines(): string[] {
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }"],
          { encoding: "utf8", windowsHide: true, timeout: 30000 },
        )
      : spawnSync("ps", ["-axww", "-o", "args="], { encoding: "utf8", timeout: 30000 });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`cannot list the processes: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.split(/\r?\n/).filter((line) => line.trim() !== "");
}
