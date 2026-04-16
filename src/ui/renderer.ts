import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Annotation } from "vexflow";
import { type NoteInfo, type Clef, type KeySig, noteToSemitone, getOttava } from "../domain/music";
import { midiToNoteInfoForKey } from "../domain/noteGenerator";

let cachedRenderer: Renderer | null = null;
let cachedEl: HTMLElement | null = null;
let cachedWidth = 0;
let cachedHeight = 0;

function makeStaveNote(note: NoteInfo, duration: string, clef: Clef): StaveNote {
  const midi = (note.octave + 1) * 12 + noteToSemitone(note.name);
  const ottava = getOttava(midi, clef);

  let displayVexKey = note.vexKey;
  if (ottava) {
    const parts = note.vexKey.split("/");
    displayVexKey = `${parts[0]}/${note.octave + ottava.shift}`;
  }

  const staveNote = new StaveNote({
    keys: [displayVexKey],
    duration,
    clef,
    autoStem: true,
  });

  if (note.displayAccidental) {
    staveNote.addModifier(new Accidental(note.displayAccidental));
  }

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

export function renderNote(note: NoteInfo, clef: Clef, keySig: KeySig, pressedMidi?: number): void {
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

  const questionNote = makeStaveNote(note, "w", clef);
  const voice1 = new Voice({ numBeats: 4, beatValue: 4 });
  voice1.setMode(Voice.Mode.SOFT);
  voice1.addTickables([questionNote]);

  if (pressedMidi !== undefined) {
    const pressedInfo = midiToNoteInfoForKey(pressedMidi, keySig);
    const pressedNote = makeStaveNote(pressedInfo, "w", clef);
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
