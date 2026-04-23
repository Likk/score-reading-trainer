import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Annotation } from "vexflow";
import { type NoteInfo, type Clef, type KeySig, noteToSemitone, getOttava } from "../domain/music";
import { midiToNoteInfoForKey } from "../domain/noteGenerator";

let cachedRenderer: Renderer | null = null;
let cachedEl: HTMLElement | null = null;
let cachedWidth = 0;
let cachedHeight = 0;

function midiOf(note: NoteInfo): number {
  return (note.octave + 1) * 12 + noteToSemitone(note.name);
}

function makeStaveNote(notes: NoteInfo[], duration: string, clef: Clef): StaveNote {
  const sorted = [...notes].sort((a, b) => midiOf(a) - midiOf(b));
  const ottava = getOttava(midiOf(sorted[0]), clef);

  const keys = sorted.map(n => {
    if (ottava) {
      const parts = n.vexKey.split("/");
      return `${parts[0]}/${n.octave + ottava.shift}`;
    }
    return n.vexKey;
  });

  const staveNote = new StaveNote({ keys, duration, clef, autoStem: true });

  sorted.forEach((n, i) => {
    if (n.displayAccidental) {
      staveNote.addModifier(new Accidental(n.displayAccidental), i);
    }
  });

  if (ottava) {
    const ann = new Annotation(ottava.label);
    ann.setFont("Arial", 12, "italic");
    ann.setVerticalJustification(
      ottava.position === "top"
        ? Annotation.VerticalJustify.TOP
        : Annotation.VerticalJustify.BOTTOM
    );
    staveNote.addModifier(ann);
  }

  return staveNote;
}

function getOrCreateRenderer(el: HTMLElement, width: number, height: number): Renderer {
  if (cachedRenderer && cachedEl === el && cachedWidth === width && cachedHeight === height) {
    const svg = el.querySelector("svg");
    if (svg) {
      svg.innerHTML = "";
      return cachedRenderer;
    }
  }

  el.innerHTML = "";
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(width, height);
  cachedRenderer = renderer;
  cachedEl = el;
  cachedWidth = width;
  cachedHeight = height;
  return renderer;
}

export function renderNote(notes: NoteInfo[], clef: Clef, keySig: KeySig, pressedMidis?: number[]): void {
  const el = document.querySelector(".score-area") as HTMLElement;
  if (!el) return;

  const width = Math.min(400, el.clientWidth - 2);
  const compact = window.innerHeight <= 500;
  const height = compact ? 140 : 200;
  const staveY = compact ? 15 : 40;

  const renderer = getOrCreateRenderer(el, width, height);
  const context = renderer.getContext();

  const stave = new Stave(10, staveY, width - 20);
  stave.addClef(clef);
  if (keySig !== "C") {
    stave.addKeySignature(keySig);
  }
  stave.setContext(context).draw();

  const questionNote = makeStaveNote(notes, "w", clef);
  const voice1 = new Voice({ numBeats: 4, beatValue: 4 });
  voice1.setMode(Voice.Mode.SOFT);
  voice1.addTickables([questionNote]);

  if (pressedMidis && pressedMidis.length > 0) {
    const pressedInfos = pressedMidis.map(m => midiToNoteInfoForKey(m, keySig));
    const pressedNote = makeStaveNote(pressedInfos, "w", clef);
    pressedNote.setStyle({ fillStyle: "#4488ff", strokeStyle: "#4488ff" });

    const voice2 = new Voice({ numBeats: 4, beatValue: 4 });
    voice2.setMode(Voice.Mode.SOFT);
    voice2.addTickables([pressedNote]);

    new Formatter().joinVoices([voice1]).joinVoices([voice2]).format([voice1, voice2], width - 60);
    voice1.draw(context, stave);
    voice2.draw(context, stave);
  } else {
    new Formatter().joinVoices([voice1]).format([voice1], width - 60);
    voice1.draw(context, stave);
  }
}
