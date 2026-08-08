# 残タスク

ハッカソン残り時間で対応するタスクの一覧。上から優先度順に並べる。

## 進め方
- 未着手 → 着手中 → 完了 の順でステータスを更新する
- 完了したら日付を添えてチェックを入れる
- 新しいタスクは共有され次第ここに追記する

## タスク一覧

| # | タスク | 優先度 | ステータス | 備考 |
|---|--------|--------|-----------|------|
| - | (共有待ち) | - | - | - |

## 見送り

- ~~地図表示のヒートマップ化~~ — 指示により不要と判断（2026-08-08）。既存のコロプレス（区単位の色分け）方式を維持

## 完了したタスク

- [x] マイページ共有機能にInstagram/Threads/Xのアイコンを追加 (2026-08-08)
  - `src/client/MyPage.tsx`: 従来の単一「SNSでシェア」ボタンを、Instagram/Threads/Xの3アイコンボタンに置き換え
    - X: `twitter.com/intent/tweet` でテキスト+URL付きシェア
    - Threads: `threads.net/intent/post` でテキスト内にURLを含めてシェア
    - Instagram: 投稿用Web intentが存在しないため、テキストをクリップボードにコピーしてInstagramを新規タブで開く方式（コピー完了の案内メッセージを表示）
  - `src/style.css`: `.profile-share-btn` を `.profile-share-row` / `.profile-share-icon`（ブランドカラーの円形アイコン）に置き換え

- [x] 区ごとの色分けがわかりやすくなるようシードデータを登録 (2026-08-08)
  - `scripts/seed.mjs`: 直近6時間分の「通常区」が一律くもり寄り(`[2,3,3,3,4,4]`, 21/23区が同じ「くもり」表示)だったのを、`WARD_BAND`で23区を雨/くもり時々雨/くもり/晴れの4カテゴリに割り当て、`BAND_SCORE_POOL`で区ごとに平均スコアがはっきり分かれるよう変更
  - `migrations/seed.sql`を`node scripts/seed.mjs`で再生成し、ローカルD1(`wrangler d1 execute kibun-tenkizu-db --local`)に投入・検証済み
  - 結果: 23区中22区が sunny(7)/cloud(6)/rain_cloud(5)/rain(4) に分散、katsushika(葛飾区)は投稿1件のみでデータ不足表示（意図通り、既存仕様）
  - **remote(本番)DBにも反映済み** (2026-08-08): 投入前に本番DBを確認したところ実ユーザーの投稿が1件存在(id=1, shinagawa区, score=5, comment="happy", user_id付き)。
    そのため`DELETE FROM moods`ではなく`DELETE FROM moods WHERE user_id IS NULL`でシード由来データのみ削除してから`migrations/seed.sql`を投入し、実データは保持したまま反映した

- [x] 地図上の区別アラートコメント（「◯◯区、よく晴れています。何かいいことが？」等）を削除 (2026-08-08)
  - `src/index.tsx`: `/api/summary`から`alerts`算出ロジックと`ALERT_LOW`/`ALERT_HIGH`のimportを削除
  - `src/client/MapView.tsx`: `Alert`interfaceと`Summary.alerts`、アラート表示ブロックを削除
  - `src/style.css`: `.alerts` / `.alert` / `.alert-low` / `.alert-high` を削除
  - `src/shared/wards.ts`: 未使用になった`ALERT_LOW` / `ALERT_HIGH`定数を削除
  - ビルド確認後、本番にデプロイ済み (Version ID: 36020b0e-e518-441c-934c-1fa968651ab1)

- [x] リモート(origin/main)との差分をマージ (2026-08-08)
  - origin側の2コミット（Duolingo風UIリデザイン、MoodFaceカートゥーンアイコン化、レイアウト調整、シード量削減）を`git merge`で取り込み
  - コンフリクトは`style.css`（区アラート用スタイルは機能削除に合わせてこちら側を採用）と`migrations/seed.sql`（生成物のため`scripts/seed.mjs`から再生成）の2件のみ。他は自動マージ
  - GitHubにpush済み (`defbaa3`)、本番デプロイ済み

- [x] マップ画面に「直近の自分の投稿+AI分析」のヘッダーを実装 (2026-08-08)
  - `src/index.tsx`: `/api/insight`のレスポンスに直近投稿(`latestPost`: ward/score/comment/createdAt)を追加
  - `src/client/MapView.tsx`: 画面最上部に`<header class="map-header">`を新設。MoodFace(気分アイコン)+区名+時刻+コメントと、それに対するAI分析コメントを表示。旧`.ai-insight`吹き出し(dismiss可能なポップアップ)は廃止し、常時表示のヘッダーに統合
  - `src/style.css`: `.map-view`をflex-columnにし、地図とオーバーレイを`.map-canvas`(flex:1)にまとめることで、ヘッダー分の高さが地図の描画範囲を圧迫しないよう修正
  - Playwright(chromium)でローカルdevサーバーを実際にブラウザ表示して動作確認済み（テスト投稿を作成し、ヘッダーに氏名・コメント・AI分析が正しく表示されることをスクリーンショットで確認、コンソールエラーなし。確認後テストデータは削除）
  - GitHubにpush済み (`2bf0e74`)、本番デプロイ済み (Version ID: 3ff89a90-c501-429e-8c1d-a0ca996e8c49)

- [x] マップヘッダーのハンバーガーメニューを廃止し、ページ遷移ボタンを直接配置 (2026-08-08)
  - ページが「地図」「マイページ」の2つしかないため、開閉式サイドメニュー(ハンバーガーボタン+スライドメニュー)を削除
  - `src/client/MapView.tsx`: `menuOpen`state・`.side-menu`nav・`.menu-toggle-btn`を削除し、「気分を投稿する」「マイページ」ボタンを`.map-header`内に常時表示
  - `src/style.css`: 未使用になった`.menu-toggle-btn*` / `.side-menu*` / `.overlay-row`を削除し、`.map-header-nav*`を追加
  - Playwrightでマイページボタンの遷移まで動作確認済み（コンソールエラーなし）
  - GitHubにpush済み (`883322a`)、本番デプロイ済み (Version ID: 1801253f-b2b5-4968-9a5e-157b72760b6c)
