# 技術スタック

## 言語

**TypeScript** — 型安全性のために採用。`tsconfig.json` で型チェックのみ行い、バンドルは esbuild に任せる。

## ビルドツール

**esbuild** — TypeScript のバンドルとトランスパイルを担当。npm パッケージの解決と ESM 形式の出力を行う。

## 五線譜描画

**VexFlow 5** — JavaScript 製の楽譜描画ライブラリ。SVG で五線譜・音符・臨時記号・調号を描画する。

主な利用箇所:
- `Stave` — 五線譜とクレフ、調号の描画
- `StaveNote` + `Accidental` — 音符と臨時記号
- `Voice` + `Formatter` — 音符の配置計算
- `Annotation` — 8va / 8vb 表記

## 音声再生

**Tone.js 15** — Web Audio API のラッパーライブラリ。

- `PolySynth` で和音対応 (複数の音を同時に鳴らせる)
- MIDI キーボードでは `triggerAttack` / `triggerRelease` で押鍵中のみ発音
- PC キーボード・マウスでは `triggerAttackRelease` で短い音を発音
- 4 種のオシレーター (triangle, sawtooth, square, sine) を切替可能

## MIDI 入力

**Web MIDI API** — ブラウザ標準の MIDI 入力 API。外部ライブラリ不要。

- HTTPS または localhost でのみ動作する (セキュアコンテキスト必須)
- `onstatechange` でデバイスのホットプラグに対応
- Note On (velocity > 0) / Note Off で発音・消音を制御

## 依存パッケージ一覧

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| vexflow | ^5.0.0 | 五線譜描画 |
| tone | ^15.1.22 | 音声再生 |
| typescript | ~5.9.3 | 型チェック (devDependency) |
| esbuild | ^0.28.0 | バンドル (devDependency) |
| @types/node | ^25.6.0 | Node.js 型定義 (devDependency) |
| tsx | ^4.21.0 | テスト実行時の TypeScript ローダー (devDependency) |
