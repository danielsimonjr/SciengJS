# T4 browser: trial report

## Question

Does the protocol client start the configured browser under Bun 1.4.4 and Node 22, render a PNG and a PDF, and block the network?

Exit numbers:

- Browser start time: from the start of the process to the connected WebSocket.
- PNG time and PDF time.
- The count of refused requests on the test page. The expected count is 2.
- The count of connections that left the process, by a second method.

## Verdict

**The client answers the first three parts. The network part holds only at the request level.**

- The client starts the browser, renders a PNG and a PDF, and closes the browser in all 264 renders. The renders ran under Bun 1.4.4 and Node 22.23.4 on Windows, Ubuntu and macOS. There were six CI jobs, and all six passed with no render error.
- The page made exactly 2 refused requests in every main render (the unlisted image and the unlisted script). The pinned asset was served from the local copy in every render, and the pinned script changed the test box in every render.
- No request for a page resource reached the proxy. The Network domain reported no response that came from a remote IP address.
- **The design claim "a render sends no request out of the process" does not hold at the connection level.** Each render opened 11 to 17 connections to the proxy. These connections went to Google update, time-check and sign-in hosts, and to the test page's own host (three attempts). None of them carried a page request. The Fetch domain does not see them. The design must state this, and the I4 gate needs a test for it. See finding F1.

Findings that change the design:

1. **F1, connection attempts are not blocked.** Chrome opens its own connections. Some of them are preconnects to the page's own host, before Fetch sees a request. The client does not refuse these. The design text says "every other network request is refused". That wording covers requests only. Before I4, the design must add one control. The I4 gate must test that control. Choose one option. Options: a managed browser policy, a network block at the OS level, or a proxy that refuses every connection. This trial tested no option.
2. **Bun and Node 22 showed no WebSocket difference in this trial.** Both runtimes connected to the DevTools socket without an `Origin` allow-list flag. Both received all text frames with no parse error and no close code. The largest message was 47 KB, so this trial did not test a large message. See the deviations.
3. The 264 renders had a median start time of 151 ms to 835 ms (warm). The PNG and PDF renders took 14 ms to 113 ms (warm). Table 2 has the values.

## Platform and versions

| Item | Value | Source |
|---|---|---|
| Runners | `windows-latest` (x64), `ubuntu-latest` (x64), `macos-latest` (arm64) | `platform`, `arch` in each JSON line |
| Bun | 1.4.4 | `runtimeVersion` in each JSON line |
| Node | v22.23.4 | `runtimeVersion` in each JSON line |
| Chrome, Windows job | 156.0.8078.48 | `browserVersion`, Windows jobs |
| Chrome, Ubuntu job | 156.0.8078.47 | `browserVersion`, Ubuntu jobs |
| Chrome, macOS job | 156.0.8078.48 | `browserVersion`, macOS jobs |
| Browser path | the runner's own Chrome, from `ci.yml` | `SCIENG_BROWSER` in the workflow |
| Local host | Windows 11, x64; Chrome 156.0.8078.74; Bun 1.4.4; Node v26.13.0 | local smoke runs, not in the tables |

The runners use their own Chrome. The trial did not install a pinned Chrome for Testing build. Each job records the version it used.

## Commands

CI runs `measure.mjs` in each job. The job sets `SCIENG_BROWSER` to the runner's Chrome path:

```sh
cd trials/t4-browser
bun measure.mjs --out results        # Bun jobs
node measure.mjs --out results       # Node 22 jobs
```

Local smoke test on the Windows host (not in the tables):

```sh
SCIENG_BROWSER=<path to chrome.exe> bun measure.mjs --out <scratch dir> --runs 2
SCIENG_BROWSER=<path to chrome.exe> node measure.mjs --out <scratch dir> --runs 2
```

The trial has no `package.json` and no npm dependency. The workflow has no install step.

## Method

- Each render starts a new browser with a new temporary profile. The profile folder is removed after the browser stops.
- The client loads one synthetic page URL. It fulfils that URL from the process. Each request goes through the Fetch domain.
- The client fulfils the pinned URL from `assets/pinned.js`. It refuses every other request with `BlockedByClient`.
- The test page has four requests: a real external image, a real external script, the pinned script, and a `data:` icon. The `data:` icon stops a favicon request.
- Each job runs 21 renders of each kind: the first run, then 20 warm runs. Each kind has its own launch. The PNG and PDF runs use separate launches.
- One extra PNG render uses a 1600 by 1200 viewport at scale 2. A control render turns off interception. It loads the page from a `data:` URL, so the external hosts must reach the proxy.
- Time definitions: start time is the spawn of the process to the WebSocket `open` event. A render time is the time from the send of the CDP command to its result. The page time is the time from `Page.navigate` to the page's own settled flag.
- Second method for "left the process": a local proxy counts every connection the browser opens to it. The proxy forwards nothing. The Network domain also reports whether a response has a remote IP address. A fulfilled response has none.

## Table 1: CI, one row per job

Run id: `41391924914`, head `86acd97`. Job ids are the GitHub job ids.

| OS | Runtime | Job id | Browser | Refused (main) | Page host hits (main) | Connections per render | Errors |
|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 125104995764 | Chrome 156.0.8078.48 | 2 | 0 | 11 to 16 | 0 of 44 |
| Windows | Node 22.23.4 | 125104995855 | Chrome 156.0.8078.48 | 2 | 0 | 13 to 16 | 0 of 44 |
| Ubuntu | Bun 1.4.4 | 125104995708 | Chrome 156.0.8078.47 | 2 | 0 | 15 to 17 | 0 of 44 |
| Ubuntu | Node 22.23.4 | 125104995786 | Chrome 156.0.8078.47 | 2 | 0 | 14 to 16 | 0 of 44 |
| macOS (arm64) | Bun 1.4.4 | 125104995777 | Chrome 156.0.8078.48 | 2 | 0 | 14 to 16 | 0 of 44 |
| macOS (arm64) | Node 22.23.4 | 125104995523 | Chrome 156.0.8078.48 | 2 | 0 | 13 to 16 | 0 of 44 |

"Page host hits" counts proxy lines that name a page resource host (the image host, the script host, the pinned host). The count is 0 in every main render. "Connections per render" counts all proxy lines in a main render. These include the Google hosts and the page's own host.

Source: each job's JSON lines file, read from the downloaded artifacts `t4-<os>-<runtime>`.

## Table 2: time per job

All times are in milliseconds. Warm median: the median of runs 2 to 21 (20 values). The first value is run 1.

| OS | Runtime | Start, first | Start, warm median | PNG, first | PNG, warm median | PDF, first | PDF, warm median |
|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 4363.1 | 417.1 | 452.1 | 34.2 | 79.9 | 66.6 |
| Windows | Node 22.23.4 | 6883.4 | 313.4 | 303.0 | 35.2 | 56.3 | 31.4 |
| Ubuntu | Bun 1.4.4 | 6636.2 | 218.3 | 108.6 | 58.8 | 291.7 | 19.0 |
| Ubuntu | Node 22.23.4 | 7121.2 | 151.3 | 113.3 | 32.3 | 302.2 | 14.0 |
| macOS (arm64) | Bun 1.4.4 | 2900.3 | 524.1 | 99.6 | 71.9 | 84.5 | 36.5 |
| macOS (arm64) | Node 22.23.4 | 4217.4 | 835.5 | 76.1 | 113.3 | 159.2 | 60.2 |

The first run of each job is slower than the warm runs. The first start time includes the first launch of the runner's Chrome.

## Table 3: output checks, one row per job

| OS | Runtime | PNG bytes (first) | PNG distinct colours | PNG luma variance | Box colour matches pinned asset (all renders) | PDF bytes (first) | PDF header | Largest WebSocket message (main) | Largest message (1600x1200 at scale 2) |
|---|---|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 5603 | 375 | 1042.3 | yes | 16524 | `%PDF-` | 22109 | 45393 |
| Windows | Node 22.23.4 | 5603 | 375 | 1042.3 | yes | 16524 | `%PDF-` | 22109 | 45393 |
| Ubuntu | Bun 1.4.4 | 6269 | 506 | 1035.4 | yes | 9130 | `%PDF-` | 12253 | 46829 |
| Ubuntu | Node 22.23.4 | 6269 | 506 | 1035.4 | yes | 9130 | `%PDF-` | 12253 | 46829 |
| macOS (arm64) | Bun 1.4.4 | 6416 | 275 | 1054.3 | yes | 9933 | `%PDF-` | 13321 | 47481 |
| macOS (arm64) | Node 22.23.4 | 6416 | 275 | 1054.3 | yes | 9933 | `%PDF-` | 13321 | 47481 |

The PNG check counts colours over the whole image. A blank image has one colour. All 44 renders of each job passed the not-blank check. The big render at scale 2 is 3200 by 2400 pixels in every job. Its bytes are 33 KB to 36 KB.

No WebSocket frame was binary. No frame failed to parse. Every socket closed without a close code.

## Table 4: control and cleanup, one row per job

| OS | Runtime | Control: refused | Control: page host hits | Control: connections | Browser stopped (all renders) | Child exited (all renders) | Profile removed (all renders) |
|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 0 | 3 | 14 | yes | yes | yes |
| Windows | Node 22.23.4 | 0 | 3 | 15 | yes | yes | yes |
| Ubuntu | Bun 1.4.4 | 0 | 3 | 15 | yes | yes | yes |
| Ubuntu | Node 22.23.4 | 0 | 3 | 16 | yes | yes | yes |
| macOS (arm64) | Bun 1.4.4 | 0 | 3 | 15 | yes | yes | yes |
| macOS (arm64) | Node 22.23.4 | 0 | 3 | 15 | yes | yes | yes |

The control shows that the proxy sees the page's three external hosts when interception is off. So the proxy count of 0 for page hosts in the main renders is a real result, not a blind spot of the instrument.

## Finding F1: connection attempts that the Fetch domain does not see

Each main render opened 11 to 17 connections to the proxy. The first lines of these connections name these hosts:

- `clients2.google.com`, a time check (a `GET` request with the update protocol query).
- `update.googleapis.com`, an update check (a `POST`).
- `www.google.com`, `www.gstatic.com` and `accounts.google.com`.
- `t4.sciengjs.invalid`, the page's own host. Three connections per render, with no HTTP request.

The client does not refuse these connections, because the Fetch domain does not see them. None of them carried a page resource. The proxy received no request for the image, the script or the pinned asset in any main render.

Twelve flags were added to the client's Chrome arguments to stop the background traffic. They include `--disable-background-networking` and `--disable-component-update`; the full list is in `trials/t4-browser/config.json`. Before the flags, the count was 16 to 17 per render. After the flags, the count stayed at 11 to 17.

The trial did not test a fix. Options for I4:

- A managed browser policy that sets a URL block list of every URL. This needs a policy directory, which the client would have to create.
- A block at the OS level in CI, with no route to any host other than the local proxy.
- A proxy that refuses all requests and records each one, with the gate failing on any record.

The design must choose one before I4, and the I4 gate must count connections in CI.

## Deviations

- **Node 22 was not run on the local host.** The local host has Node v26.13.0. The Node 22 results come only from CI (v22.23.4).
- **The runners' Chrome was used.** The trial did not install a pinned Chrome for Testing. Chrome 156 is the version on all three runners.
- **The flags were changed once.** Twelve flags were added to reduce the background traffic. The connection count did not fall. The CI jobs used the flagged configuration.
- **The WebSocket test did not cover large messages.** The largest message was 47 KB. The trial did not send a multi-megabyte message, so the Bun and Node difference for large messages is not measured.
- **The pinned URL is a trial URL.** `sciengjs-trial-t4-pinned@1.0.0` is not a published package. The client served its local copy for every render. A normal browser would fail to load it.
- **The proxy is in the client's process.** It is an observer that forwards nothing. The proxy is not an OS-level observer. It records each connection that the browser opens to it. It cannot record a connection that the browser opens without the proxy.
- **The OS-level no-route test was not run.** A run with no route to any host, in CI, is one way to prove "left the process". This trial used the proxy and the Network domain instead.
- **Warm runs are runs 2 to 21.** The first run of each kind is shown separately.
- **Start time includes the first Chrome launch on each job.** The first start time is slower on every job.

## Files

- `trials/t4-browser/measure.mjs`: the client.
- `trials/t4-browser/config.json`: the pinned URL, the unlisted URLs, the Chrome arguments, the viewports and the timeouts.
- `trials/t4-browser/page.html`: the test page template.
- `trials/t4-browser/assets/pinned.js`: the local copy of the pinned asset.
- `.github/workflows/trial-t4.yml`: the CI workflow.
