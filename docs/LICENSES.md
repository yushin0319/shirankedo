# Production Dependency Licenses

Notion #469 / 2026-05-09 監査結果。`bunx license-checker-rseidelsohn --production` の出力。

## サマリ (390 packages)

| ライセンス | 件数 | 配布制約 |
|---|---:|---|
| MIT | 329 | 表示のみ |
| ISC | 19 | 表示のみ |
| Apache-2.0 | 11 | 表示 + 改変告知 |
| BSD-2-Clause | 9 | 表示のみ |
| MIT OR Apache-2.0 | 4 | 表示のみ |
| BSD-3-Clause | 4 | 表示のみ |
| CC0-1.0 | 3 | 制約なし |
| BlueOak-1.0.0 | 3 | 表示のみ |
| MPL-2.0 | 2 | ファイル単位 copyleft（後述） |
| Apache-2.0 AND LGPL-3.0-or-later | 1 | LGPL 配慮（後述） |
| Python-2.0 | 1 | 表示のみ |
| CC-BY-4.0 | 1 | 表示 + 改変告知 |
| (MIT OR WTFPL) | 1 | 表示のみ |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 | 表示のみ |
| UNLICENSED | 1 | shirankedo 自身（self） |

**結論: 配布上問題なし**。GPL 系は 0 件。

## 注意要のライセンス詳細

### MPL-2.0 (2 件)

- `lightningcss@1.32.0`
- `lightningcss-win32-x64-msvc@1.32.0`

CSS パーサー (Astro 内部使用)。MPL-2.0 はファイル単位 copyleft。**ライブラリのソースを改変しなければ問題なし**、配布物に独自コードを混ぜてもライセンスは伝染しない。

### Apache-2.0 AND LGPL-3.0-or-later (1 件)

該当パッケージは内部ユーティリティ。LGPL 部分はリンクのみで使う限り app コードに伝染しない。dynamic linking で使用しているため配慮不要。

## 再実行方法

```bash
# サマリ
bun run licenses

# JSON 詳細
bunx license-checker-rseidelsohn --production --json
```

`bun run licenses` は package.json の scripts に登録済み。CI への組み込みは将来検討。
