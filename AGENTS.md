# リポジトリ作業ルール

## HTML/CSS のフォーマット

- `src/renderer/**/*.html` または `src/renderer/**/*.css` を編集した場合は、最終確認前に必ず `npm run format:renderer` を実行する。
- JavaScript の自動修正と renderer の HTML/CSS フォーマットをまとめて適用したい場合は、`npm run lint:fix` を使う。
- `npm run lint` には `npm run format:renderer:check` が含まれる。HTML/CSS のフォーマットチェックが失敗した状態で作業を完了しない。
- フォーマッタの挙動は、ユーザーが GUI で保存したときの挙動に合わせる。HTML は `.prettierrc.json`、CSS は `scripts/format-renderer-assets.mjs` で実装している VS Code 標準 CSS formatter 相当の処理を使う。

## GitHub Release 公開時のトークン

- AppsLauncher / MDEditor と同じく、`GH_TOKEN` は読み取り専用、`GITHUB_RELEASE_TOKEN` は Release 作成・asset アップロード用の読み書きトークンとして使い分ける。
- `gh release create` / `gh release upload` / `gh release view` の実行前に、`GITHUB_RELEASE_TOKEN` が設定済みであることを確認し、そのコマンドを実行するプロセス内だけ `$env:GH_TOKEN = $env:GITHUB_RELEASE_TOKEN` とする。
- 作業前の `GH_TOKEN` を保存し、Release 操作の終了時に `finally` で元の値へ復元する。元々未設定だった場合だけ `Remove-Item Env:GH_TOKEN` を使う。
- トークン値をコンソール、ログ、README、設定ファイル、コミット履歴、配布物へ出力・保存しない。
