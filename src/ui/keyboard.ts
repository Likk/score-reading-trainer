import { noteToSemitone, NOTE_TO_KEY, OCTAVE_KEYS } from "../domain/music";

export interface KeyboardOptions {
  rangeLow: number;
  rangeHigh: number;
  keyboardMode: "fit" | "scroll";
  hintNoteLabelEnabled: boolean;
  onKeyClick: (noteName: string, octave: number) => void;
}

function countWhiteKeys(rangeLow: number, rangeHigh: number): number {
  let count = 0;
  for (let midi = rangeLow; midi <= rangeHigh; midi++) {
    if (!OCTAVE_KEYS[midi % 12].black) count++;
  }
  return count;
}

export function buildKeyboard(options: KeyboardOptions): void {
  const { rangeLow, rangeHigh, keyboardMode, hintNoteLabelEnabled, onKeyClick } = options;
  const area = document.querySelector(".keyboard-area") as HTMLElement;
  if (!area) return;
  area.innerHTML = "";

  const piano = document.createElement("div");
  piano.className = "piano";

  const whiteKeyCount = countWhiteKeys(rangeLow, rangeHigh);

  let ww: number;
  let bw: number;
  let wh: number;
  let bh: number;
  let fontSize: number;
  let blackFontSize: number;

  const compact = window.innerHeight <= 500;
  const maxWh = compact ? 120 : 160;

  if (keyboardMode === "fit") {
    area.style.overflowX = "hidden";
    const availableWidth = area.clientWidth - 20;
    const fullRangeWw = Math.floor(availableWidth / 52);
    const maxWw = Math.min(fullRangeWw, 44);
    ww = Math.min(Math.floor(availableWidth / whiteKeyCount), maxWw);
    ww = Math.max(ww, 12);
    bw = Math.round(ww * 0.636);
    wh = Math.min(maxWh, Math.max(80, ww * 3.6));
    bh = Math.round(wh * 0.625);
    fontSize = Math.max(7, Math.min(11, ww * 0.28));
    blackFontSize = Math.max(0, fontSize - 2);
  } else {
    area.style.overflowX = "auto";
    ww = 44;
    bw = 28;
    wh = maxWh;
    bh = Math.round(maxWh * 0.625);
    fontSize = 11;
    blackFontSize = 9;
  }

  piano.style.height = `${wh}px`;

  let whiteKeyIndex = 0;

  for (let midi = rangeLow; midi <= rangeHigh; midi++) {
    const semitone = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    const keyDef = OCTAVE_KEYS[semitone];

    const el = document.createElement("div");
    el.dataset.note = keyDef.name;
    el.dataset.octave = String(octave);

    if (keyDef.black) {
      el.className = "black-key";
      el.style.width = `${bw}px`;
      el.style.height = `${bh}px`;
      el.style.left = `${whiteKeyIndex * ww - Math.round(bw / 2)}px`;
      el.style.fontSize = `${blackFontSize}px`;
    } else {
      el.className = "white-key";
      el.style.width = `${ww}px`;
      el.style.height = `${wh}px`;
      el.style.fontSize = `${fontSize}px`;
      if (hintNoteLabelEnabled && ww >= 20) {
        el.textContent = `${keyDef.name}${octave}`;
      }
      whiteKeyIndex++;
    }

    el.addEventListener("mousedown", () => onKeyClick(keyDef.name, octave));
    piano.appendChild(el);
  }

  area.appendChild(piano);
}

export function updateKeyboardHint(targets: { name: string; octave: number }[]): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  piano.querySelectorAll(".hint").forEach(el => el.classList.remove("hint"));

  const wanted = targets.map(t => ({
    semitone: noteToSemitone(t.name),
    octave: String(t.octave),
  }));
  const keys = piano.querySelectorAll("[data-note]") as NodeListOf<HTMLElement>;
  for (const key of keys) {
    const sem = noteToSemitone(key.dataset.note!);
    const oct = key.dataset.octave;
    if (wanted.some(w => w.semitone === sem && w.octave === oct)) {
      key.classList.add("hint");
    }
  }
}

export function clearKeyboardHint(): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;
  piano.querySelectorAll(".hint").forEach(el => el.classList.remove("hint"));
}

export function updateKbLayoutLabels(enabled: boolean): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  piano.querySelectorAll(".key-label").forEach(el => el.remove());

  if (!enabled) return;

  const keys = piano.querySelectorAll("[data-note]") as NodeListOf<HTMLElement>;
  for (const key of keys) {
    const noteName = key.dataset.note!;
    const label = NOTE_TO_KEY[noteName];
    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "key-label";
      labelEl.textContent = label;
      key.style.position = key.classList.contains("black-key") ? "absolute" : "relative";
      key.appendChild(labelEl);
    }
  }
}

const highlightTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

export function highlightKey(noteName: string, octave: number): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  const keys = piano.querySelectorAll("[data-note]") as NodeListOf<HTMLElement>;
  for (const key of keys) {
    if (key.dataset.note === noteName && key.dataset.octave === String(octave)) {
      const prev = highlightTimers.get(key);
      if (prev !== undefined) clearTimeout(prev);
      key.classList.add("active");
      highlightTimers.set(key, setTimeout(() => {
        key.classList.remove("active");
        highlightTimers.delete(key);
      }, 200));
    }
  }
}
