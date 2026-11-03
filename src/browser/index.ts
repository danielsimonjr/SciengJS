/** The Chrome DevTools Protocol client of the browser stage. It has no npm dependency. */
export { CdpConnection, type CdpSocket } from "./cdp.ts";
export { forcedBrowserFlags, type FlagInputs } from "./flags.ts";
export { startRefusingProxy, type RefusingProxy } from "./proxy.ts";
export { renderHtmlPage, type HtmlPageRequest, type HtmlPageResult, type HtmlFormat } from "./render.ts";
