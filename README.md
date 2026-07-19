# TMS-GREP（TMS全文検索アプリ）

Everything Search（`es.exe`）によるファイル名検索と、ファイル内検索を組み合わせた Windows 向け GUI 全文検索アプリ。Electron + TypeScript（main/preload）+ Vanilla JavaScript（renderer）で構築。

リポジトリ: [TMSystems-Rights/Electron-Tms-Grep-For-Release](https://github.com/TMSystems-Rights/Electron-Tms-Grep-For-Release)

最新リリース: [v1.1.2](https://github.com/TMSystems-Rights/Electron-Tms-Grep-For-Release/releases/tag/v1.1.2)

## v1.0.0 の主な機能

- ファイル名検索（`es.exe`）+ ファイル内検索（通常 / 正規表現）の統合ジョブ
- 検索前確認ダイアログ、進捗表示、キャンセル
- 結果テーブル（行番号・列番号・ハイライト）と各種コピー形式
- 設定モーダル（テーマ、es.exe オプション、キーバインド等）
- ライト / ダーク / システム追従テーマ

## 必要条件

- Node.js 20 以上（推奨）
- Windows 11（64bit）
- [Everything](https://www.voidtools.com/) および `es.exe`（1.1.0.30 以降推奨）

Everything 本体が起動していないと `es.exe` は動作しません。`EverythingCmdHome` 環境変数または設定画面から `es.exe` のパスを指定できます。

Everything 本体および CLI は、[公式 Downloads ページ](https://www.voidtools.com/downloads/) から入手してください。

- Everything 本体: 通常版の x64 Installer または Portable Zip を使用してください（Lite 版は IPC 非対応のため非推奨）。
- CLI: `Download Everything Command-line Interface` セクションから、環境に合う `ES-x.x.x.x.<arch>.zip` をダウンロードし、展開した `es.exe` のパスを設定してください。

## セットアップ

```powershell
npm install
```

## 開発起動

```powershell
npm run dev
```

開発時の設定は `%APPDATA%\tms-grep-dev\` に保存されます（パッケージ版とは別）。

## ビルド

TypeScript コンパイル + renderer 静的ファイルコピー:

```powershell
npm run build
```

## Lint

```powershell
npm run lint
npm run lint:fix
```

`npm run lint` は ESLint に加えて、renderer の HTML/CSS が所定フォーマット済みかも検査します。

AI（Codex / Cursor 等）が `src/renderer/**/*.html` または `src/renderer/**/*.css` を編集した場合は、ユーザーが GUI で保存したときと同じ差分になるよう、必ず次のどちらかで整形してください。

```powershell
npm run format:renderer
# または JS の自動修正もまとめて行う場合:
npm run lint:fix
```

HTML は Prettier 設定（`.prettierrc.json`）、CSS は VS Code 標準 CSS formatter 相当（`vscode-css-languageservice`）で整形します。これにより、ユーザーが後から GUI で保存しても HTML/CSS の余計なフォーマット差分が出ない状態を保ちます。

## テスト

```powershell
npm run test
```

設定保存、es.exe 引数、ファイル内検索、検索ジョブ、コピー形式、UI 起動を自動検証します。

## キーボード操作（既定）

| ショートカット | 動作                                  |
| -------------- | ------------------------------------- |
| `Ctrl+R`       | ファイル名検索の正規表現 ON/OFF       |
| `Ctrl+Shift+R` | ファイル内検索の正規表現 ON/OFF       |
| `Ctrl+Enter`   | 全文検索（確認ダイアログ経由）        |
| `Ctrl+Shift+C` | クリア（検索中は無効）                |
| `Esc`          | 確認ダイアログ / 設定モーダルを閉じる |

設定モーダルでキーバインドを変更できます。

## 配布パッケージ作成（Windows インストーラ）

```powershell
npm run dist
```

出力先: `release/<version>/TmsGrep-<version>-setup.exe`（例: `release/1.1.2/TmsGrep-1.1.2-setup.exe`）

`npm run dist` / `npm run dist:publish` 実行前に、`scripts/ensure-dist-ready.ps1` が `app.asar` の**上書き可否**（rename テスト）を検査します。問題があればビルド開始前に中止します（ファイルの削除は行いません）。

### `app.asar` ロック（EBUSY）が出る場合

electron-builder は既存の `app.asar` を **unlink（削除／置換）** します。別プロセスが参照していると失敗します。**エクスプローラーで release を開いていなくても**起こり得ます。

| 想定原因                                    | 対処                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Cursor 等 IDE** が `release/` を監視      | `.cursorignore` と `.vscode/settings.json` の `watcherExclude` を設定済み。**Cursor 完全終了**後に再ビルド |
| **ウイルス対策ソフト**                      | 必要に応じて `release` フォルダをリアルタイムスキャンの**除外**に追加                                      |
| **Windows Search** のインデックス           | しばらく待つか、`release` をインデックス対象外にする                                                       |
| `release\...\win-unpacked` からアプリ起動中 | プロセスを終了してから再ビルド                                                                             |

**推奨**: パッケージ版の動作確認は `win-unpacked` 直起動ではなく、生成された `setup.exe` でインストールした版を使う。

不要な一時ビルドフォルダを削除する場合も、Cursor 起動中は `app.asar` がロックされるため削除できません。Cursor を完全終了してから、外部ターミナルで次を実行してください。

```powershell
pwsh -NoProfile -File scripts/remove-orphan-build-dir.ps1
# 別フォルダを指定する場合:
# pwsh -NoProfile -File scripts/remove-orphan-build-dir.ps1 -TargetDir 'release-v122'
```

### リリース手順

GitHub Release 公開は、必ず **コミットと push の後**に実行します。

AI（Cursor 等）がリリース作業を行う場合は、`.cursor/rules/release_workflow.mdc` も必ず参照すること。

#### バージョンアップして配布する場合（必須順序）

1. `package.json` の `version` を更新する
2. `npm run dev` 等で動作確認する
3. `npm run build` / `npm run lint` / `npm run test` 等で検証する
4. 変更を **git commit** する（バージョン更新を含むすべての変更）
5. **git push origin main** する
6. `git status` が clean で、`HEAD` と `origin/main` が一致していることを確認する
7. **`npm run dist`** でローカル成果物を生成する
8. GitHub Release に同一ビルドの成果物 3 点を公開する
9. **タグの一致を確認する**（下記「公開後の確認」）

> **重要**: `npm run dist` / `npm run dist:publish` は **commit と push の後**に実行すること。未コミットの作業ツリーからビルドすると、インストーラは新内容でも Git タグが古いコミットを指し、ソースと Release の対応がずれる。

通常のリリースでは `npm run dist:publish` は使わず、`npm run dist` で生成した 3 点を `gh release create/upload` で公開します。`dist:publish` を実行してしまった場合は、`.cursor/rules/release_workflow.mdc` の復旧手順に従い、assets 3 点とタグを検証してください。

#### dist 前の確認

- `git status` が clean（未コミットの version 変更がない）
- `git rev-parse HEAD` と `git rev-parse origin/main` が一致している
- **コミット済み**の `package.json` の `version` が今回のリリース番号と一致している

#### 必須成果物

`npm run dist` 後、`release/<version>/` に次の 3 点があることを確認します。

| ファイル                               | 用途                                          |
| -------------------------------------- | --------------------------------------------- |
| `TmsGrep-<version>-setup.exe`          | NSIS インストーラ                             |
| `TmsGrep-<version>-setup.exe.blockmap` | 差分更新用                                    |
| `latest.yml`                           | electron-updater が参照する最新バージョン情報 |

`latest.yml` は同じ `npm run dist` で生成された `setup.exe` の `sha512` と `size` を持ちます。`npm run dist` を再実行した場合は、必ず上記 3 点を同じ実行結果でまとめて公開し直してください。

#### GitHub Release 公開

`gh` で Release に成果物をアップロードします。公開リポジトリでは自動更新用の GitHub Release 取得にトークンは不要です。Release 作成・asset 置換に使う認証情報は `gh auth login` などの CLI 側で扱い、リポジトリや配布物に含めません。

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
$repo = "TMSystems-Rights/Electron-Tms-Grep-For-Release"
$releaseDir = "release\$version"
$target = git rev-parse HEAD

gh release create $tag `
	"$releaseDir\TmsGrep-$version-setup.exe" `
	"$releaseDir\TmsGrep-$version-setup.exe.blockmap" `
	"$releaseDir\latest.yml" `
	--repo $repo `
	--target $target `
	--title $tag `
	--notes "TMS-GREP $tag"
```

既存 Release の asset を差し替える場合は、同じ 3 点を `--clobber` でまとめて上書きします。

```powershell
gh release upload $tag `
	"$releaseDir\TmsGrep-$version-setup.exe" `
	"$releaseDir\TmsGrep-$version-setup.exe.blockmap" `
	"$releaseDir\latest.yml" `
	--repo $repo `
	--clobber
```

#### 公開後の確認（必須）

Release 作成でリモートタグだけが作られ、ローカルタグがまだ無い場合があります。検証前にタグを取得し、**ローカルタグとリモートタグの SHA が一致**していることを確認します。

```powershell
git fetch origin tag v<version>
pwsh -NoProfile -File scripts/verify-release-tag.ps1
```

#### バージョンを上げない軽微な修正

README・設計ドキュメント等の変更で、既存ユーザーに新インストーラを配布する必要がない場合は Release 公開は不要です。**git commit → git push** だけでよい。

#### コマンド例（バージョンアップリリース）

```powershell
git add .
git commit -m "v1.x.x で〇〇を追加する"
git push origin main
npm run dist
# gh release create/upload で setup.exe / blockmap / latest.yml を公開
git fetch origin tag v1.x.x
pwsh -NoProfile -File scripts/verify-release-tag.ps1
```

#### 認証情報の扱い

公開リポジトリでは、`electron-builder.yml` に `publish.private` や `publish.token` を設定しません。GitHub Release へアップロードするために個人アクセストークン等を使う場合も、値を README・設定ファイル・コミット履歴・配布物へ含めないでください。

### 自動更新

v1.0.2 以降は GitHub Releases の `latest.yml` を使った自動更新に対応しています。

- パッケージ版のみ、起動約5秒後に更新を自動確認します
- 設定画面の「更新を確認」ボタンから手動確認できます
- 更新が見つかると自動ダウンロードし、完了後に再起動確認を表示します

v1.0.1 以前には自動更新処理が入っていないため、v1.0.2 への更新だけは GitHub Release からインストーラを手動実行してください。

### インストーラの仕様

| 項目           | 内容                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| 形式           | NSIS（`.exe`）                                                         |
| インストール先 | ウィザードで変更可能（デフォルト: `%LOCALAPPDATA%\Programs\TMS-GREP`） |
| ショートカット | スタートメニュー（常時）、デスクトップ（追加タスク画面で選択）         |
| 対象           | Windows 11 64bit                                                       |

## アイコン

`build/icon.png` / `build/icon.ico` を編集後、`npm run icon:build` で `.ico` を再生成できます。詳細は [build/README.md](build/README.md) を参照してください。

v1.0.1 では TMS-GREP 専用アイコンを採用しています。タスクバー等の小サイズ表示では `G` バッジ、大きい表示では `Grep` ラベルを使うマルチサイズ `.ico` を生成します。

## 設定・ログの保存先

| 種別                 | パス                                       |
| -------------------- | ------------------------------------------ |
| 設定（開発時）       | `%APPDATA%\tms-grep-dev\config.json`       |
| 設定（パッケージ版） | `%APPDATA%\tms-grep\config.json`           |
| ログ                 | `%APPDATA%\tms-grep\logs\app-YYYYMMDD.log` |

## 既知の制約

| 項目                  | 内容                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 対象外機能            | `rg.exe` 同梱、検索履歴、複数タブ、行番号付きエディタ起動、検索結果ファイル出力                                                            |
| ファイル名正規表現    | `*.java` など glob 風入力は正規表現モードでは使えません（通常検索を使うか `.*\.java$` 等に変更）                                           |
| 保護ファイル          | システム保護パス（`ProgramData\Diagnosis` 等）は **読取エラー** としてカウントされます。管理者権限で起動すると回避できる場合があります     |
| 非 ASCII パス         | `es.exe` 出力は UTF-8（`-cp 65001`）でデコードします。Everything / `es.exe` のバージョンによってはパス取得に失敗する場合があります         |
| v1.0.1 以前からの更新 | v1.0.2 への更新だけは手動インストールが必要です                                                                                            |
| Cursor からの開発起動 | IDE 起動後に追加した環境変数（`EverythingCmdHome` 等）は反映されないことがあります。ターミナル再起動または設定画面でパスを指定してください |

## プロジェクト構成

```
src/
├── main/       # メインプロセス（TypeScript）
├── preload/    # preload スクリプト（TypeScript）
└── renderer/   # 画面（HTML/CSS/Vanilla JS）
scripts/        # 自動検証・ビルド補助
build/          # アイコン・NSIS カスタム
fixtures/       # テスト用サンプルファイル
```

## 仕様書

`設計ドキュメント/0070_TMS全文検索アプリ（TMS-GREP）/020_仕様書/TMS全文検索アプリ（TMS-GREP）仕様書.md`

## ライセンス

UNLICENSED（現時点では利用許諾なし）

このリポジトリのソースコードには、現時点でオープンソースライセンスを付与していません。
Everything / es.exe は別ソフトウェアです。TMS-GREP はユーザー環境にインストールされた es.exe を利用します。
