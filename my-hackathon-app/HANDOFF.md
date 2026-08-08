# 引き継ぎメモ — 気分の天気図

次に作業するClaude Code(または人)が最短で状況を把握できるようにするための引き継ぎファイルです。
実装の詳細な機能一覧は `IMPLEMENTATION.md` にもありますが、こちらの方が新しく、かつ「詰まりやすい点」を中心にまとめています。

---

## ⚠️ 最初に必ずやること

### 1. コミットされていない変更がある

このセッションで作業した内容は **まだ一切コミットされていません**。`git status` で確認すると、
`src/index.tsx` / `src/client/*` / `migrations/*` など主要ファイルがすべて未コミットの状態です。

```
cd /home/yu/findy/FindyCampusHackathon/my-hackathon-app
git status
```

作業を始める前に、ユーザーに「コミットしていいか」を確認してください(このプロジェクトのCLAUDE.md的な方針で「明示的に頼まれた時だけコミットする」運用のため、勝手にコミットしていません)。

### 2. プロジェクトディレクトリが移動している

セッション途中で `/home/yu/findy/my-hackathon-app` → `/home/yu/findy/FindyCampusHackathon/my-hackathon-app` に
ディレクトリが移動されました。旧パスは中身がほぼ空です。**必ず新しいパスで作業してください。**

チームのGitHubリポジトリ(`git@github.com:komdoroid/FindyCampusHackathon.git`)配下の1プロジェクトになっています。

---

## 現在の公開状況

- 公開URL: **https://kibun-tenkizu.kibun-tenkizu.workers.dev**
- Cloudflareアカウント: `wrangler login` 済み(このセッションの認証情報がそのまま使える想定)
- D1データベース名: `kibun-tenkizu-db`(local/remote 両方に同じマイグレーションを適用済み)
- Workers AIバインディング: `AI`(有効化済み、追加設定不要)

---

## 技術スタック

Cloudflare Workers + Hono(APIとSSRを`src/index.tsx`に統一) + React 19 + Vite + D1(SQLite) +
Leaflet(地図、OSMタイル、APIキー不要) + Open-Meteo(天気、APIキー不要) + Workers AI(分析コメント生成)。
TypeScript。ルーティングライブラリは使っておらず、`app.tsx`内のstateで画面を出し分けています。

`hono-agents` / Durable Object(`CounterAgent`)はスターター由来で未使用(消しても問題ない)。

---

## MUST(元の仕様書 M1〜M6)の状況

全て実装・デプロイ済み。加えて、当初の「CSS格子タイル」という仕様から大きく拡張し、
実際の地図(Leaflet+OSM)+23区の実ポリゴン形状+個別ピン表示まで作り込んでいます(ユーザーからの追加要望による)。

---

## MUST以降に追加した主な機能

1. **本物の地図表示**: Leaflet + OpenStreetMapタイル。23区の実際の境界ポリゴン(`src/shared/wardPolygons.ts`、
   niiyz/JapanCityGeoJsonから取得しDouglas-Peuckerで間引き)を使い、ズームに応じて
   「雲(ぼかし表示、遠景)」→「個別ピン(拡大)」の2段階表示に切り替わる。
2. **個別ピン**: 区の実ポリゴン内にランダム散布(棄却サンプリング)。スコア1〜5ごとに専用の5段階配色+絵文字。
   コメント付き投稿は常時吹き出し表示(クリック不要)。自分の投稿は金リング+星バッジで強調。
3. **マイページ(ページ遷移・フルページ)**: 匿名の端末ID(localStorage UUID、`src/client/identity.ts`)で
   「自分の投稿だけ」を判定(ログイン機能はなし)。
   - プロフィールタブ: 直近の投稿+気分割合の円グラフ+直近7日推移の折れ線グラフ+SNS共有ボタン
   - カレンダータブ: GitHub風のコントリビューションカレンダー(直近13週)
   - 履歴タブ: 日時・気分・コメントの一覧(50件/ページ)
   - グラフは外部ライブラリを使わず自作SVG(`src/client/charts.tsx`)
4. **AIによる個人向け気分×天気分析**: Open-Meteoで東京の実際の天気を取得し、その人自身の直近の投稿
   (最大10件)と突き合わせてWorkers AIが2〜3文のコメントを生成。ユーザーごとにD1へ10分キャッシュ。
   ページ上部のヘッダーに表示、×ボタンで閉じられる。

---

## ハマりどころ・気づいたこと(次に作業するなら知っておくべきこと)

- **Leafletの独自paneはpadding付きレンダラーを引き継がない**: `map.createPane()`で作った独自paneに
  ベクターレイヤーを描くと、Leafletは`_getPaneRenderer`で勝手に新しい(padding不足の)SVGレンダラーを
  自動生成してしまう。`renderer: L.svg({pane: 'xxx', padding: N})`を各レイヤーに明示的に渡さないと、
  ぼかし(CSS/SVGフィルター)が縁でクリップされたりパン時にズレたりする(`MapView.tsx`のblobRenderer参照)。
- **Workers AIのモデルIDは頻繁に非推奨化される**: `@cf/meta/llama-3.1-8b-instruct`は2026-05-30に廃止済みで、
  現在は`@cf/meta/llama-3.1-8b-instruct-fast`を使っている。エラーは`catch`で握りつぶされがちなので、
  AI呼び出りが常にフォールバック文になる場合はまず`console.error`のログ(devサーバーのターミナル出力)を疑うこと。
  デプロイ前に一度モデル一覧(https://developers.cloudflare.com/workers-ai/models/)を確認する習慣推奨。
- **SCORE_COLOR(5段階配色)はカテゴリカルパレットとして色弱シミュレーション上は弱い**: 特に4(黄)と5(オレンジ)の
  弁別性が低い。dataviz skillの`validate_palette.js`で検証済みでFAILしているが、色を作り直す代わりに
  「絵文字ラベル+凡例テキストを必ず併記する」ことで対応している(色だけに頼らない設計)。将来ちゃんと直すなら
  `src/shared/wards.ts`の`SCORE_COLOR`を再設計してvalidatorを通すこと。
- **`scoreToWeather`は本来「平均値(連続値)」用のしきい値関数**: 個別スコア(整数1〜5)にそのまま使うと
  実質3カテゴリにしか分かれない(閾値の境界の関係)。そのため個別ピンには`SCORE_COLOR`/`SCORE_EMOJI`という
  専用の5段階マッピングを別途用意している。区の平均(雲・アラート)には引き続き`scoreToWeather`/`WEATHER_COLOR`を使う。
- **シードデータの再投入は`moods`テーブルを全削除する**: `scripts/seed.mjs`→`migrations/seed.sql`生成→
  `wrangler d1 execute --local/--remote`の流れは`DELETE FROM moods`を毎回叩いている。これは**実ユーザーが
  投稿した本物のデータ(user_id付き)も消える**ので、本番で誰かが実際に使い始めたら、今後は
  むやみに全消し再投入しないこと(必要なら`WHERE user_id IS NULL`などで区別する)。
- **デプロイ直後は数秒〜十数秒の反映ラグがある**: `npm run deploy`直後にcurlで確認すると、古いJSファイル名を
  参照していたり新アセットが404だったりすることがある。数秒待って再確認すれば直る(コード側の問題ではない)。
- **Bashツールのcwdについて**: ツール結果に「Shell cwd was reset to /home/yu/findy/my-hackathon-app」という
  表示が出ることがあるが、実際には作業ディレクトリは正しく保持されていた(`pwd`で確認済み)。不安なら
  各コマンドの先頭に`cd /home/yu/findy/FindyCampusHackathon/my-hackathon-app &&`を付けるのが安全。

---

## DBスキーマ(マイグレーション4本、local/remote両方に適用済み)

```
migrations/0001_init.sql            moodsテーブル本体
migrations/0002_add_user_id.sql     user_idカラム+インデックス追加
migrations/0003_weather_insights.sql  (旧・全体向けAI分析キャッシュ。今は未使用、user_insightsに置き換え済み。残っていても害はない)
migrations/0004_user_insights.sql   user_idごとのAI分析キャッシュ(現役)
```

`moods`テーブルの主なカラム: `ward` `score`(1-5) `comment` `gender`/`age_group`(常にNULL、OPTION用に予約) `user_id` `created_at`。
緯度経度は仕様上保存しない。

---

## APIエンドポイント一覧(`src/index.tsx`)

| メソッド/パス | 用途 |
|---|---|
| POST /api/moods | 投稿(ward, score, comment, gender, ageGroup, userId) |
| GET /api/summary | 直近6時間の区別集計+アラート |
| GET /api/moods/recent | 直近6時間の個別投稿一覧(地図ピン用、userId含む) |
| GET /api/moods/mine?userId=&page= | 自分の投稿履歴(50件/ページ) |
| GET /api/moods/mine/summary?userId= | マイページ プロフィールタブ用の集計一式 |
| GET /api/insight?userId= | AIによる個人向け天気×気分分析(10分キャッシュ) |

---

## フロントエンド構成

```
src/client/
  app.tsx        ルート。view状態(map/mypage)、userId生成、PostFlowはモーダルのまま
  MapView.tsx     地図本体(最大のファイル。雲・ピン・AIインサイト表示・現在地表示など全部入り)
  PostFlow.tsx    気分投稿フォーム(モーダルの中身)
  MyPage.tsx      マイページ(フルページ、サイドメニュー3タブ)
  charts.tsx      円グラフ/折れ線グラフ/コミットカレンダー(自作SVG、外部ライブラリ不使用)
  Modal.tsx       汎用モーダル(compact/large)
  identity.ts     匿名userId(localStorage UUID)

src/shared/
  wards.ts         23区定義、閾値定数、天気/スコアの色・絵文字マップ、距離計算、point-in-polygon等
  wardPolygons.ts  23区の実ポリゴン座標(江戸川区・江東区は元データ不備のため手動補正済み)
```

---

## よく使うコマンド

```sh
cd /home/yu/findy/FindyCampusHackathon/my-hackathon-app

npm run dev            # ローカル開発サーバー
npm run build           # ビルド確認
npm run deploy          # ビルド+本番デプロイ

# シード再生成・投入(注意: moodsテーブルを全削除してから入れ直す)
node scripts/seed.mjs
npx wrangler d1 execute kibun-tenkizu-db --local  --command="DELETE FROM moods"
npx wrangler d1 execute kibun-tenkizu-db --local  --file=migrations/seed.sql
npx wrangler d1 execute kibun-tenkizu-db --remote --command="DELETE FROM moods"
npx wrangler d1 execute kibun-tenkizu-db --remote --file=migrations/seed.sql
```

---

## まだやっていないこと(元の仕様書のOPTION、未着手)

- 属性収集(性別・年齢層の初回入力画面)
- 時間帯スライダー(6時間の推移アニメーション)
- 曜日・時間帯別の傾向グラフ(データ蓄積後)
- 平常値との差分アラート方式への移行
- 会場が何区かの決定、4人の担当割り当て(元仕様書「未決事項」のまま)

## 軽微な後片付け候補(優先度低)

- `weather_insights`テーブル・関連コード(未使用、`user_insights`に統合済み)の削除
- `hono-agents` / `CounterAgent`(スターター由来、未使用)の削除
- 自動テストは一切なし
