/** The values that the forced flags need: the profile folder and the port of the refusing proxy. */
export interface FlagInputs {
  profileDir: string;
  proxyPort: number;
}

/**
 * The flags of every browser start. Each flag closes one route off the host. The client never adds
 * `--no-sandbox`. The renderer keeps the Chrome sandbox on.
 */
export function forcedBrowserFlags(input: FlagInputs): string[] {
  return [
    "--headless=new",
    // The DevTools port is an ephemeral loopback port. Another local process of the same user can reach it while the
    // render runs. A pipe (--remote-debugging-pipe) closes that route, but it needs extra file descriptors and
    // replaces the port file, so the client keeps the port. The port lives only for one render.
    "--remote-debugging-port=0",
    `--user-data-dir=${input.profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--do-not-de-elevate",
    "--disable-breakpad",
    "--disable-crash-reporter",
    `--proxy-server=http://127.0.0.1:${input.proxyPort}`,
    "--proxy-bypass-list=<-loopback>",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    // The browser makes no request of its own: no background service, no component update, no sync, no ping.
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--no-pings",
    "--disable-component-extensions-with-background-pages",
    // Linux containers often have a small /dev/shm. The browser then writes its shared memory to the temp folder.
    "--disable-dev-shm-usage",
  ];
}
