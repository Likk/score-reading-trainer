# ビルド・開発

## セットアップ

```bash
npm install
```

## ビルド

```bash
npm run build    # dist/bundle.js を生成
npm run watch    # ファイル監視 + 自動リビルド
```

esbuild が `src/index.ts` を起点に依存を解決し、`dist/bundle.js` (ESM, minified) と `dist/bundle.js.map` (sourcemap) を出力する。

## ローカル確認

任意の HTTP サーバーでプロジェクトルートを配信する。

```bash
python3 -m http.server 5173
# → http://localhost:5173
```

MIDI キーボードを使う場合は HTTPS 接続が必要 (Web MIDI API の制約)。

## デプロイ

成果物は以下の 4 ファイル:

- `index.html`
- `src/ui/style.css`
- `dist/bundle.js`
- `dist/bundle.js.map`

HTML 内のパスはすべて相対パスで記述されている (`src/ui/style.css`, `dist/bundle.js`)。サブディレクトリに配置してもそのまま動作する。

## ファイル構成

```
index.html               エントリーポイント
src/
  index.ts               状態管理・初期化・モジュール接続
  domain/
    music.ts             型定義・定数・音楽理論の関数
    music.test.ts        music.ts のテスト
    noteGenerator.ts     出題ロジック
    noteGenerator.test.ts  noteGenerator.ts のテスト
  ui/
    renderer.ts          VexFlow 描画
    keyboard.ts          鍵盤 DOM 生成・ヒント表示
    settings.ts          設定 UI イベント
    style.css            スタイル
  audio/
    audio.ts             Tone.js シンセ・MIDI 入力
dist/
  bundle.js              ビルド成果物 (gitignore)
  bundle.js.map          ソースマップ (gitignore)
package.json             依存定義
tsconfig.json            TypeScript 設定
```
