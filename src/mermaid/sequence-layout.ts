import { xmlSafe } from "./common.ts";
import type { BlockEvent, Branch, MessageEvent, SeqEvent, SequenceModel } from "./sequence.ts";

const MARGIN = 20;
const BOX_HEIGHT = 36;
const BOX_MIN_WIDTH = 100;
const BOX_PADDING = 20;
const CHAR_WIDTH = 8;
const COLUMN_MIN_GAP = 180;
const COLUMN_EDGE_GAP = 40;
const ROW_HEIGHT = 30;
const SELF_LOOP_WIDTH = 30;
const SELF_LOOP_HEIGHT = 20;
const ACTIVATION_WIDTH = 10;
const NOTE_MIN_WIDTH = 80;
const NOTE_PADDING = 16;
const NOTE_HEIGHT = 24;
const NOTE_GAP = 10;
const NOTE_OVER_SIDE = 30;
/** The height of one block text band: a block header or a divider label, and the space above the first row below it. */
const BLOCK_HEADER = 40;
const BLOCK_BOTTOM = 10;
const BLOCK_SIDE = 30;
const FONT_SIZE = 14;

/** Measures the laid-out width of one text run. */
function textWidth(value: string): number {
  return value.length * CHAR_WIDTH;
}

/** Makes one text value safe for XML: it replaces each forbidden character, then escapes the markup characters. */
function escapeXml(value: string): string {
  return xmlSafe(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Tracks the leftmost and the rightmost x coordinate drawn so far. */
interface Extent {
  minX: number;
  maxX: number;
}

/** Widens one extent to cover two drawn x coordinates. */
function spanX(extent: Extent, first: number, second: number): void {
  const low = first <= second ? first : second;
  const high = first <= second ? second : first;
  if (low < extent.minX) extent.minX = low;
  if (high > extent.maxX) extent.maxX = high;
}

/** Widens one extent to cover one drawn text element and its anchor. */
function spanText(extent: Extent, x: number, value: string, anchor: "middle" | "start"): void {
  const width = textWidth(value);
  if (anchor === "middle") spanX(extent, x - width / 2, x + width / 2);
  else spanX(extent, x, x + width);
}

/** Holds one open activation span on one participant. */
interface ActivationEntry {
  start: number;
  depth: number;
}

/** Measures the laid-out width of one participant box. */
function participantWidth(label: string): number {
  return Math.max(BOX_MIN_WIDTH, textWidth(label) + BOX_PADDING);
}

/**
 * Lays out one sequence model into one SVG document string.
 * Returns the document with the root element first, one element per line and a final newline.
 */
export function layoutSequence(model: SequenceModel): string {
  const centers = new Map<string, number>();
  let prevCenter = 0;
  let prevHalf = 0;
  for (let index = 0; index < model.participants.length; index += 1) {
    const participant = model.participants[index]!;
    const half = participantWidth(participant.label) / 2;
    const center =
      index === 0
        ? MARGIN + half
        : prevCenter + Math.max(COLUMN_MIN_GAP, prevHalf + half + COLUMN_EDGE_GAP);
    centers.set(participant.id, center);
    prevCenter = center;
    prevHalf = half;
  }

  let minCenter = 0;
  let maxCenter = 0;
  if (model.participants.length > 0) {
    minCenter = centers.get(model.participants[0]!.id)!;
    maxCenter = minCenter;
    for (const participant of model.participants) {
      const center = centers.get(participant.id)!;
      if (center < minCenter) minCenter = center;
      if (center > maxCenter) maxCenter = center;
    }
  }

  const extent: Extent = { minX: Infinity, maxX: -Infinity };
  let cursor = MARGIN + BOX_HEIGHT + ROW_HEIGHT;
  let rowCount = 0;
  const stacks = new Map<string, ActivationEntry[]>();
  const frames: string[] = [];
  const lifelines: string[] = [];
  const activations: string[] = [];
  const notes: string[] = [];
  const messages: string[] = [];
  const boxes: string[] = [];

  function centerOf(id: string): number {
    return centers.get(id)!;
  }

  function pushActivation(id: string, start: number): void {
    const stack = stacks.get(id);
    if (!stack) {
      stacks.set(id, [{ start, depth: 0 }]);
      return;
    }
    stack.push({ start, depth: stack.length });
  }

  function drawActivation(id: string, entry: ActivationEntry, end: number): void {
    const center = centerOf(id);
    const x = center + (entry.depth * ACTIVATION_WIDTH) / 2 - ACTIVATION_WIDTH / 2;
    const height = Math.max(end - entry.start, ROW_HEIGHT / 2);
    activations.push(
      `<rect x="${x}" y="${entry.start}" width="${ACTIVATION_WIDTH}" height="${height}" fill="#eeeeee" stroke="#000000" data-scieng-kind="activation" data-scieng-id="${escapeXml(id)}"/>`,
    );
    spanX(extent, x, x + ACTIVATION_WIDTH);
  }

  function popActivation(id: string, end: number): void {
    const stack = stacks.get(id);
    if (!stack || stack.length === 0) return;
    drawActivation(id, stack.pop()!, end);
  }

  function drawMessage(message: MessageEvent, y: number, row: number): void {
    const dash = message.dashed ? ` stroke-dasharray="4 3"` : "";
    if (message.from !== message.to) {
      const from = centerOf(message.from);
      const to = centerOf(message.to);
      messages.push(
        `<line x1="${from}" y1="${y}" x2="${to}" y2="${y}" stroke="#000000"${dash} data-scieng-kind="message" data-scieng-row="${row}" data-scieng-line="${message.line}"/>`,
      );
      spanX(extent, from, to);
      if (message.arrowhead) {
        const direction = to > from ? 1 : -1;
        const tail = to - 10 * direction;
        messages.push(
          `<polygon points="${to},${y} ${tail},${y - 5} ${tail},${y + 5}" fill="#000000"/>`,
        );
        spanX(extent, to, tail);
      }
      const mid = (from + to) / 2;
      messages.push(
        `<text x="${mid}" y="${y - 6}" text-anchor="middle" font-size="${FONT_SIZE}">${escapeXml(message.text)}</text>`,
      );
      spanText(extent, mid, message.text, "middle");
      return;
    }
    const center = centerOf(message.from);
    messages.push(
      `<path d="M ${center} ${y} H ${center + SELF_LOOP_WIDTH} V ${y + SELF_LOOP_HEIGHT} H ${center}" fill="none" stroke="#000000"${dash} data-scieng-kind="message" data-scieng-row="${row}" data-scieng-line="${message.line}"/>`,
    );
    spanX(extent, center, center + SELF_LOOP_WIDTH);
    if (message.arrowhead) {
      messages.push(
        `<polygon points="${center},${y + SELF_LOOP_HEIGHT} ${center + 10},${y + SELF_LOOP_HEIGHT - 5} ${center + 10},${y + SELF_LOOP_HEIGHT + 5}" fill="#000000"/>`,
      );
      spanX(extent, center, center + 10);
    }
    const textX = center + 36;
    messages.push(
      `<text x="${textX}" y="${y + 4}" text-anchor="start" font-size="${FONT_SIZE}">${escapeXml(message.text)}</text>`,
    );
    spanText(extent, textX, message.text, "start");
  }

  function drawNote(
    position: "left" | "right" | "over",
    ids: string[],
    text: string,
    line: number,
    top: number,
  ): void {
    let x: number;
    let width: number;
    if (position === "over" && ids.length >= 2) {
      const first = centerOf(ids[0]!);
      const second = centerOf(ids[1]!);
      x = Math.min(first, second) - NOTE_OVER_SIDE;
      width = Math.max(NOTE_MIN_WIDTH, Math.abs(second - first) + 2 * NOTE_OVER_SIDE);
    } else {
      width = Math.max(NOTE_MIN_WIDTH, textWidth(text) + NOTE_PADDING);
      const anchor = centerOf(ids[0]!);
      if (position === "left") x = anchor - NOTE_GAP - width;
      else if (position === "right") x = anchor + NOTE_GAP;
      else x = anchor - width / 2;
    }
    notes.push(
      `<rect x="${x}" y="${top}" width="${width}" height="${NOTE_HEIGHT}" fill="#ffffcc" stroke="#000000" data-scieng-kind="note" data-scieng-line="${line}"/>`,
    );
    spanX(extent, x, x + width);
    const textX = x + width / 2;
    notes.push(
      `<text x="${textX}" y="${top + 16}" text-anchor="middle" font-size="${FONT_SIZE}">${escapeXml(text)}</text>`,
    );
    spanText(extent, textX, text, "middle");
  }

  function drawBlock(block: BlockEvent): void {
    const x = minCenter - BLOCK_SIDE;
    const width = maxCenter - minCenter + 2 * BLOCK_SIDE;
    const frameTop = cursor;
    cursor += BLOCK_HEADER;
    for (let index = 0; index < block.branches.length; index += 1) {
      const branch: Branch = block.branches[index]!;
      if (index > 0) {
        const dividerY = cursor;
        frames.push(
          `<line x1="${x}" y1="${dividerY}" x2="${x + width}" y2="${dividerY}" stroke="#000000" stroke-dasharray="6 4" data-scieng-kind="divider" data-scieng-line="${branch.line}"/>`,
        );
        spanX(extent, x, x + width);
        const head = block.type === "alt" ? "else" : "and";
        const heading = branch.label.length > 0 ? `${head} ${branch.label}` : head;
        frames.push(
          `<text x="${x + 6}" y="${dividerY + 14}" font-size="${FONT_SIZE}">${escapeXml(heading)}</text>`,
        );
        spanText(extent, x + 6, heading, "start");
        cursor += BLOCK_HEADER;
      }
      walkEvents(branch.events);
    }
    const frameBottom = cursor + BLOCK_BOTTOM;
    frames.push(
      `<rect x="${x}" y="${frameTop}" width="${width}" height="${frameBottom - frameTop}" fill="none" stroke="#000000" data-scieng-kind="block" data-scieng-type="${block.type}" data-scieng-line="${block.line}"/>`,
    );
    spanX(extent, x, x + width);
    const firstBranch = block.branches[0];
    const heading =
      firstBranch && firstBranch.label.length > 0 ? `${block.type} ${firstBranch.label}` : block.type;
    frames.push(
      `<text x="${x + 6}" y="${frameTop + 14}" font-size="${FONT_SIZE}">${escapeXml(heading)}</text>`,
    );
    spanText(extent, x + 6, heading, "start");
    cursor = frameBottom + ROW_HEIGHT;
  }

  function walkEvents(events: SeqEvent[]): void {
    for (const event of events) {
      if (event.kind === "message") {
        const y = cursor;
        const row = rowCount;
        rowCount += 1;
        if (event.deactivateSource) popActivation(event.from, y);
        if (event.activateTarget) pushActivation(event.to, y);
        drawMessage(event, y, row);
        cursor += event.from === event.to ? ROW_HEIGHT + SELF_LOOP_HEIGHT : ROW_HEIGHT;
      } else if (event.kind === "note") {
        drawNote(event.position, event.ids, event.text, event.line, cursor);
        cursor += ROW_HEIGHT;
      } else if (event.kind === "activate") {
        pushActivation(event.id, cursor);
      } else if (event.kind === "deactivate") {
        popActivation(event.id, cursor);
      } else {
        drawBlock(event);
      }
    }
  }

  walkEvents(model.events);

  const finalCursor = cursor;
  for (const participant of model.participants) {
    const stack = stacks.get(participant.id);
    if (!stack) continue;
    for (const entry of stack) drawActivation(participant.id, entry, finalCursor);
    stack.length = 0;
  }

  for (const participant of model.participants) {
    const center = centers.get(participant.id)!;
    lifelines.push(
      `<line x1="${center}" y1="${MARGIN + BOX_HEIGHT}" x2="${center}" y2="${finalCursor}" stroke="#888888" stroke-dasharray="4 4" data-scieng-kind="lifeline" data-scieng-id="${escapeXml(participant.id)}"/>`,
    );
    spanX(extent, center, center);
  }

  for (const participant of model.participants) {
    const center = centers.get(participant.id)!;
    const width = participantWidth(participant.label);
    boxes.push(
      `<rect x="${center - width / 2}" y="${MARGIN}" width="${width}" height="${BOX_HEIGHT}" rx="4" fill="#ffffff" stroke="#000000" data-scieng-kind="participant" data-scieng-id="${escapeXml(participant.id)}"/>`,
    );
    spanX(extent, center - width / 2, center + width / 2);
    boxes.push(
      `<text x="${center}" y="${MARGIN + 22}" text-anchor="middle" font-size="${FONT_SIZE}">${escapeXml(participant.label)}</text>`,
    );
    spanText(extent, center, participant.label, "middle");
  }

  const minX = Number.isFinite(extent.minX) ? extent.minX : 0;
  const maxX = Number.isFinite(extent.maxX) ? extent.maxX : 0;
  const root = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX + 2 * MARGIN}" height="${finalCursor + MARGIN}" viewBox="${minX - MARGIN} 0 ${maxX - minX + 2 * MARGIN} ${finalCursor + MARGIN}">`;

  const lines: string[] = [root];
  lines.push(...frames);
  lines.push(...lifelines);
  lines.push(...activations);
  lines.push(...notes);
  lines.push(...messages);
  lines.push(...boxes);
  lines.push("</svg>");
  return lines.join("\n") + "\n";
}
