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
  ];
}
