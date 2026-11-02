# T4 browser: trial report

## Question

Does the protocol client start the configured browser under Bun 1.4.4 and Node 22, render a PNG and a PDF, and block the network?

Exit numbers:

- Browser start time: from the start of the process to the connected WebSocket.
- PNG time and PDF time.
- The count of refused requests on the test page. The expected count is 2.
- The count of connections that leave the host, by OS-level sampling.
- The size of a screenshot message over 10 MB, and whether it arrives whole.

## Verdict

**The network claim holds with the forced browser flags. The round 1 finding F1 is closed.**

- The client forces every browser connection through a local proxy that refuses it. In CI, the browser process tree owned no socket to a non-loopback address in any of the six jobs. The browser sends its connection attempts to the proxy, and the proxy forwards none.
- The Ubuntu renders ran in a network namespace with only loopback. All 42 main renders per job passed. A negative render without the flags failed to load the external image, the external script and the pinned asset with `ERR_INTERNET_DISCONNECTED`, in both runtimes. The namespace blocks the network, and the flags do not depend on it.
- The page made exactly 2 refused requests in every main render. The pinned asset was served from the process in every render.
- A screenshot of 4000 by 3000 device pixels gave a base64 message of about 47.8 million characters. It arrived whole under Bun 1.4.4 and under Node 22.23.4, on all three systems.
- Limit: on Windows the sampler took about one sample per render, so the Windows socket count is weaker evidence than the Linux count. The DNS count is not reliable on Windows and macOS, because the sampler sees only connected UDP sockets there. See the deviations.

## Round history

- **Round 1** (run `41391924914`, head `86acd97`): six green jobs. The page had 2 refused requests. The browser opened 11 to 17 connections per render that the Fetch domain did not see (finding F1).
- **Round 2 attempt 1** (run `41393034051`, head `6049645`): the forced flags and the samplers ran. The Windows Node job reported 18 external endpoints. The tree had 153 processes. The cause was the parent-process walk. Windows reuses process ids, so the walk took in unrelated processes. The sockets of a runner service were counted. The finding is F2. The sampler now attributes sockets by profile path.
- **Round 2, final** (run `41393386824`, head `b4f083f`): six green jobs, with the profile-path attribution. All numbers in this report come from this run, except where the table says round 1.

## Platform and versions

| Item | Value | Source |
|---|---|---|
| Runners | `windows-latest` (x64), `ubuntu-latest` (x64), `macos-latest` (arm64) | `platform`, `arch` in each JSON line |
| Bun | 1.4.4 | `runtimeVersion` in each JSON line |
| Node | v22.23.4 | `runtimeVersion` in each JSON line |
| Chrome, Windows jobs | 156.0.8078.48 | `browserVersion` |
| Chrome, Ubuntu jobs | 156.0.8078.47 | `browserVersion` |
| Chrome, macOS jobs | 156.0.8078.48 | `browserVersion` |
| Ubuntu namespace | `ip netns` with only loopback, run as root | `results-netns/` |

## Browser flags

The client starts Chrome with the flags in `config.json`. The forced flags are these:

| Flag | Effect measured |
|---|---|
| `--proxy-server=http://127.0.0.1:<port>` | Every browser connection attempt reached the in-process proxy. The proxy answered 403 and forwarded nothing. |
| `--proxy-bypass-list=<-loopback>` | Loopback attempts also reached the proxy. The proxy recorded them. |
| `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1` | No UDP/53 endpoint owned by the browser tree was seen on Linux. |
| `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` | Not exercised. The page does not use WebRTC. |

Attempts refused by the proxy are acceptable. Each attempt is recorded by host, below.

## Table 1: CI, one row per job

Run `41393386824`, head `b4f083f`. Job ids are the GitHub job ids.

| OS | Runtime | Job id | Renders | Errors | Refused per main render | Page resource hits at proxy | Proxy attempts per main render (range) | Samples | Largest browser tree | External endpoints | UDP/53 endpoints |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 125109410474 | 45 | 0 | 2 | 0 | 13 to 16 | 42 | 11 | 0 | 0 (see deviations) |
| Windows | Node 22.23.4 | 125109410463 | 45 | 0 | 2 | 0 | 11 to 15 | 48 | 11 | 0 | 0 (see deviations) |
| Ubuntu | Bun 1.4.4 | 125109410410 | 45 | 0 | 2 | 0 | 15 to 17 | 114 | 13 | 0 | 0 |
| Ubuntu | Node 22.23.4 | 125109410215 | 45 | 0 | 2 | 0 | 15 to 17 | 86 | 12 | 0 | 0 |
| macOS (arm64) | Bun 1.4.4 | 125109410517 | 45 | 0 | 2 | 0 | 14 to 17 | 197 | 11 | 0 | 0 (see deviations) |
| macOS (arm64) | Node 22.23.4 | 125109410489 | 45 | 0 | 2 | 0 | 12 to 16 | 187 | 11 | 0 | 0 (see deviations) |

"Renders" is 42 main renders, plus three more renders. "Page resource hits" counts proxy lines for the test image, the test script and the pinned host. The count is 0 in every job. "Proxy attempts" counts all proxy lines in a main render. Those lines include the Google hosts and the page host. The range shows the distinct values over the 42 main renders.

Per-host attempts over the 42 main renders, Ubuntu Bun job: `www.google.com` 321, `t4.sciengjs.invalid` 125, `update.googleapis.com` 84. Also `clients2.google.com` 42, `www.gstatic.com` 42 and `accounts.google.com` 42. There are 8 connections without data. The other jobs show the same hosts with similar counts.

## Table 2: Ubuntu namespace and negative control

Run `41393386824`, the Ubuntu jobs only.

| Runtime | Namespace renders | Errors | Refused per render | Page resource hits | Proxy attempts per render (range) | Samples | External endpoints | Negative: image | Negative: script | Negative: pinned |
|---|---|---|---|---|---|---|---|---|---|---|
| Bun 1.4.4 | 45 | 0 | 2 | 0 | 12 to 15 | 84 | 0 | failed | failed | failed |
| Node 22.23.4 | 45 | 0 | 2 | 0 | 12 to 15 | 84 | 0 | failed | failed | failed |

The negative control runs without the forced flags and without interception. Its failure reason is `net::ERR_INTERNET_DISCONNECTED` for all three resources in both runtimes. The namespace had no route off the host.

## Table 3: large screenshot message

Run `41393386824`, the huge render at 2000 by 1500 CSS pixels at scale 2. The page fills the canvas with xorshift noise, so the PNG is large.

| OS | Runtime | PNG width by height | PNG bytes | Base64 characters | Largest WebSocket frame | Parse errors | Arrived whole | Render time (ms) |
|---|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 4000 by 3000 | 35,871,190 | 47,828,256 | 47,828,333 | 0 | yes | 2776.1 |
| Windows | Node 22.23.4 | 4000 by 3000 | 35,871,190 | 47,828,256 | 47,828,333 | 0 | yes | 2943.9 |
| Ubuntu | Bun 1.4.4 | 4000 by 3000 | 35,871,044 | 47,828,060 | 47,828,137 | 0 | yes | 3368.4 |
| Ubuntu | Node 22.23.4 | 4000 by 3000 | 35,871,044 | 47,828,060 | 47,828,137 | 0 | yes | 3730.4 |
| macOS (arm64) | Bun 1.4.4 | 4000 by 3000 | 35,869,182 | 47,825,576 | 47,825,653 | 0 | yes | 4874.3 |
| macOS (arm64) | Node 22.23.4 | 4000 by 3000 | 35,869,182 | 47,825,576 | 47,825,653 | 0 | yes | 3773.0 |

"Arrived whole" means the frame parsed without error, the PNG decoded with its colour and the screenshot had an `IEND` chunk. No frame was binary. No socket closed early. The message is 47 MB, far above the 10 MB target, and no difference between Bun and Node appeared.

Round 1 measured a 47 KB message. Round 2 replaces that with the 47 MB message, so the large-message question is answered for these systems.

## Timing (round 1)

Round 1 timing is in `docs/analysis/t4-browser.md` at commit `2c07a92`. The round 2 flags change start time, so this report does not re-state medians. The round 2 artifacts hold the new timings. The huge render times are in Table 3.

## Finding F1: closed

Round 1 found 11 to 17 browser connections per render that the Fetch domain did not see. Round 2 forces each connection through the refusing proxy and records each attempt. The OS-level socket sampler finds no socket of the browser tree that leaves the host. The Ubuntu namespace run also gives no route off the host, and its negative control shows that the namespace really blocks.

The round 2 claim holds with the flags on. Without the flags, the claim does not hold. The design must require the flags. The I4 gate must test them.

## Finding F2: attribution by parent process

The first round 2 run attributed sockets by walking the parent-process chain. Windows reuses process ids. The sampler then reported 18 external endpoints for the Windows Node job (run `41393034051`, job `125108338487`). The fix attributes each process by the profile path in its command line. Every browser process of a render carries that path. The numbers of the superseded run are not used.

## Proposed replacement for the design section "browser"

The design file is not edited by this trial. The text below replaces the section "browser", lines 130 to 137 of `docs/superpowers/specs/2026-11-01-scieng-engine-design.md`.

```text
### browser

- The client speaks the Chrome DevTools Protocol over the built-in `WebSocket` of Node 22 and Bun. The client has no npm dependency.
- The browser path comes from `SCIENG_BROWSER`, else the `browser` key of the configuration file. The client does not search for a browser. A missing path rejects with `E_STAGE_MISSING`.
- Each render starts the browser with a new temporary profile, headless, with no extensions.
- Each render starts the browser with these forced flags. Each flag blocks one route off the host:
  - `--proxy-server` names a local proxy. The proxy refuses every connection and records each attempt.
  - `--proxy-bypass-list=<-loopback>` sends loopback connections through the same proxy.
  - `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1` stops every DNS lookup.
  - `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` stops WebRTC from using a route that bypasses the proxy.
- The client intercepts every request through the `Fetch` domain. The client fulfils two kinds of request from the process: the page that the client loads, and each exact pinned URL of the engine asset list. The client refuses every other request.
- A page keeps its pinned CDN URLs, so the page also works in a normal browser. A render through the client sends no request out of the process.
- I4 gate, network: on Linux, the renders run in a network namespace with only loopback. The renders pass there. A negative render without the forced flags fails to load an external image and an external script.
- I4 gate, sockets: on each system, sampling the browser process tree finds no socket to a non-loopback address.
- I4 gate, large message: a render of 4000 by 3000 device pixels returns its PNG whole, under Bun and under Node 22.
- Outputs: a PNG screenshot of the page or of one element; a PDF through `Page.printToPDF`.
```

The gate test for the proxy refusal is the namespace run plus the socket sampling. A future change of the flags must keep both gates green.

## Deviations

- **Windows sampling is coarse.** The Windows process query runs through PowerShell, which takes about 0.9 s to start. The Windows jobs took 42 and 48 samples over 42 main renders each, about one per render. The Linux and macOS jobs took 86 to 197 samples. The zero count on Windows is weaker evidence than the zero count on Linux.
- **DNS is not visible on Windows and macOS.** The Windows socket table omits unconnected UDP sockets. The macOS listing shows only connected UDP. The UDP/53 count is zero on every job. On Windows and macOS, that zero is not a measurement. On Linux, the measured count is zero.
- **WebRTC was not exercised.** The page does not use WebRTC. The flag `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` is in the forced set, but this trial gives no measurement of its effect.
- **One client commit covers items 1 to 3.** The round 2 client changes are in one commit, `86347b9`. They cover the forced flags, the sampler, the huge render and the negative mode. The changes share one file and the page template. The attribution fix is commit `b4f083f`. The workflow changes are in `6049645`.
- **Node 22 ran only in CI.** The local host has Node v26.13.0. Local runs under Node 26 were smoke tests, and CI is the authority for Node 22.
- **The runners' Chrome was used.** The trial did not install a pinned Chrome for Testing build. Chrome 156 is the version on all three runners.
- **The namespace ran as root.** The renders in the namespace ran under `sudo ip netns exec`. Chrome runs with `--no-sandbox`, as in round 1.

## Files

- `trials/t4-browser/measure.mjs`: the client.
- `trials/t4-browser/config.json`: the pinned URL, the forced flags, the sampler commands, the viewports and the timeouts.
- `trials/t4-browser/page.html`: the test page template, with the noise canvas.
- `trials/t4-browser/assets/pinned.js`: the local copy of the pinned asset.
- `.github/workflows/trial-t4.yml`: the CI workflow, with the Ubuntu namespace and the negative control.
