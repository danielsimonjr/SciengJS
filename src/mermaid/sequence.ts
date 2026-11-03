import { inputError, outside, type Source } from "./common.ts";

/** Describes one participant of a sequence diagram. */
export interface Participant {
  id: string;
  label: string;
  line: number;
}

/** Describes one message that one participant sends to another. */
export interface MessageEvent {
  kind: "message";
  from: string;
  to: string;
  token: string;
  dashed: boolean;
  arrowhead: boolean;
  text: string;
  activateTarget: boolean;
  deactivateSource: boolean;
  line: number;
}

/** Describes one note that sits left of, right of or over participants. */
export interface NoteEvent {
  kind: "note";
  position: "left" | "right" | "over";
  ids: string[];
  text: string;
  line: number;
}

/** Describes one explicit activation of a participant. */
export interface ActivateEvent {
  kind: "activate";
  id: string;
  line: number;
}

/** Describes one explicit deactivation of a participant. */
export interface DeactivateEvent {
  kind: "deactivate";
  id: string;
  line: number;
}

/** Describes one labelled branch that a block event holds. */
export interface Branch {
  label: string;
  line: number;
  events: SeqEvent[];
}

/** Describes one loop, alt or par block that groups nested events. */
export interface BlockEvent {
  kind: "block";
  type: "loop" | "alt" | "par";
  line: number;
  branches: Branch[];
}

/** Unites every event that a sequence diagram can hold. */
export type SeqEvent = MessageEvent | NoteEvent | ActivateEvent | DeactivateEvent | BlockEvent;

/** Holds the participants and the events of a parsed sequence diagram. */
export interface SequenceModel {
  participants: Participant[];
  events: SeqEvent[];
}

/** One participant id: a letter or an underscore, then letters, digits and underscores, with hyphens between them. */
const ID_SOURCE = "[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*";
const PARTICIPANT_RE = new RegExp(`^(?:participant|actor)[ \\t]+(${ID_SOURCE})(?:[ \\t]+as[ \\t]+(.+))?$`);
const ACTIVATION_RE = new RegExp(`^(activate|deactivate)[ \\t]+(${ID_SOURCE})$`);
const NOTE_RE = new RegExp(`^Note[ \\t]+(left of|right of|over)[ \\t]+(${ID_SOURCE})(?:[ \\t]*,[ \\t]*(${ID_SOURCE}))?[ \\t]*:[ \\t]*(.+)$`);
const BLOCK_RE = /^(loop|alt|par)(?:[ \t]+(.*))?$/;
const BRANCH_RE = /^(else|and)(?:[ \t]+(.*))?$/;
const END_RE = /^end$/;
const UNSUPPORTED_BLOCK_RE = /^(opt|critical|break|rect)(?:[ \t]+(.*))?$/;
const MESSAGE_RE = new RegExp(`^(${ID_SOURCE})[ \\t]*(-->>|->>|-->|->)[ \\t]*([+-]?)[ \\t]*(${ID_SOURCE})[ \\t]*:[ \\t]*(.*)$`);
const ANY_BLOCK_OPENER_RE = /^(?:loop|alt|par|opt|critical|break|rect)(?:[ \t]+.*)?$/;

/** Parses the lines of a sequence diagram into its participants and events. */
export function parseSequenceDiagram(src: Source): SequenceModel {
  const participants: Participant[] = [];
  const byId = new Map<string, Participant>();
  const active = new Map<string, number>();
  const rootEvents: SeqEvent[] = [];
  const blocks: BlockEvent[] = [];
  let skipDepth = 0;

  const activeOf = (id: string): number => active.get(id) ?? 0;

  const ensure = (id: string, createdOn: number): void => {
    const existing = byId.get(id);
    if (existing) return;
    const participant: Participant = { id, label: id, line: createdOn };
    byId.set(id, participant);
    participants.push(participant);
  };

  const container = (): SeqEvent[] => {
    const top = blocks[blocks.length - 1];
    if (!top) return rootEvents;
    const branch = top.branches[top.branches.length - 1];
    return branch ? branch.events : rootEvents;
  };

  for (const row of src.lines) {
    const line = row.number;
    const text = row.text;

    if (skipDepth > 0) {
      if (ANY_BLOCK_OPENER_RE.test(text)) skipDepth += 1;
      else if (text === "end") skipDepth -= 1;
      continue;
    }

    let m = PARTICIPANT_RE.exec(text);
    if (m) {
      const id = m[1]!;
      const alias: string | undefined = m[2];
      const existing = byId.get(id);
      if (existing) {
        if (alias !== undefined) existing.label = alias.trim();
      } else {
        const participant: Participant = { id, label: alias !== undefined ? alias.trim() : id, line };
        byId.set(id, participant);
        participants.push(participant);
      }
      continue;
    }

    m = ACTIVATION_RE.exec(text);
    if (m) {
      const id = m[2]!;
      if (m[1] === "activate") {
        ensure(id, line);
        active.set(id, activeOf(id) + 1);
        container().push({ kind: "activate", id, line });
      } else if (activeOf(id) === 0) {
        outside(src, line, text, id + " is not active");
      } else {
        active.set(id, activeOf(id) - 1);
        container().push({ kind: "deactivate", id, line });
      }
      continue;
    }

    m = NOTE_RE.exec(text);
    if (m) {
      const where = m[1]!;
      const second: string | undefined = m[3];
      if (where !== "over" && second !== undefined) {
        outside(src, line, text, "a note on the left or right names one participant");
        continue;
      }
      const ids: string[] = [m[2]!];
      if (second !== undefined) ids.push(second);
      for (const id of ids) ensure(id, line);
      container().push({
        kind: "note",
        position: where === "left of" ? "left" : where === "right of" ? "right" : "over",
        ids,
        text: m[4]!.trim(),
        line,
      });
      continue;
    }

    m = BLOCK_RE.exec(text);
    if (m) {
      const label = (m[2] ?? "").trim();
      const block: BlockEvent = {
        kind: "block",
        type: m[1]! as BlockEvent["type"],
        line,
        branches: [{ label, line, events: [] }],
      };
      container().push(block);
      blocks.push(block);
      continue;
    }

    m = BRANCH_RE.exec(text);
    if (m) {
      const word = m[1]!;
      const needed = word === "else" ? "alt" : "par";
      const top = blocks[blocks.length - 1];
      if (!top || top.type !== needed) {
        outside(src, line, text, word + " has no open " + needed + " block");
        continue;
      }
      top.branches.push({ label: (m[2] ?? "").trim(), line, events: [] });
      continue;
    }

    if (END_RE.test(text)) {
      const top = blocks[blocks.length - 1];
      if (!top) {
        outside(src, line, text, "end has no open block");
        continue;
      }
      blocks.pop();
      continue;
    }

    if (UNSUPPORTED_BLOCK_RE.test(text)) {
      outside(src, line, text, "a block is outside the supported grammar");
      skipDepth = 1;
      continue;
    }

    m = MESSAGE_RE.exec(text);
    if (m) {
      const from = m[1]!;
      const token = m[2]!;
      const marker: string | undefined = m[3];
      const to = m[4]!;
      const body = m[5]!.trim();
      if (body === "") {
        outside(src, line, text, "a message has no text");
        continue;
      }
      if (marker === "-" && activeOf(from) === 0) {
        outside(src, line, text, from + " is not active");
        continue;
      }
      ensure(from, line);
      ensure(to, line);
      let activateTarget = false;
      let deactivateSource = false;
      if (marker === "+") {
        active.set(to, activeOf(to) + 1);
        activateTarget = true;
      } else if (marker === "-") {
        active.set(from, activeOf(from) - 1);
        deactivateSource = true;
      }
      container().push({
        kind: "message",
        from,
        to,
        token,
        dashed: token.startsWith("--"),
        arrowhead: token.endsWith(">>"),
        text: body,
        activateTarget,
        deactivateSource,
        line,
      });
      continue;
    }

    outside(src, line, text, "a construct is outside the supported grammar");
  }

  let open = blocks.pop();
  while (open) {
    if (src.lenient) {
      src.warnings.push(
        "line " + open.line + ": the " + open.type + " block is not closed by an end line; it runs to the end of the source",
      );
    } else {
      throw inputError(open.line, "the " + open.type + " block is not closed by an end line");
    }
    open = blocks.pop();
  }

  if (participants.length === 0) {
    throw inputError(src.headerLine, "the diagram holds no participant or message");
  }

  return { participants, events: rootEvents };
}
