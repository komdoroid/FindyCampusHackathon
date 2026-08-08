# 気分の天気図 — 実装状況

公開URL: https://kibun-tenkizu.kibun-tenkizu.workers.dev

---

## 技術スタック

| 領域 | 技術 |
|---|---|
| ランタイム | Cloudflare Workers |
| バックエンド | Hono(APIルーティング・SSRエントリを`src/index.tsx`に統一) |
| DB | Cloudflare D1(SQLite)、バインディング名 `DB` |
| フロントエンド | React 19 + Vite(`@cloudflare/vite-plugin`) |
| 地図 | Leaflet + OpenStreetMapタイル(APIキー不要) |
| 言語 | TypeScript |
| デプロイ | Wrangler(`npm run deploy` = `vite build && wrangler deploy`) |

`hono-agents` / Durable Object(`CounterAgent`)はスターター由来のボイラープレートで、現状の機能では未使用。

---

## ディレクトリ構成

```
src/
  index.tsx            Honoアプリ本体(SSR + API)
  style.css            全体スタイル
  shared/
    wards.ts           23区定義・距離計算・天気/スコアの色定義・しきい値定数
    wardPolygons.ts     23区の簡易ポリゴン座標(実際の区境界から間引き生成)
  client/
    app.tsx             6時間判定で投稿画面/地図画面を出し分けるルートコンポーネント
    index.tsx           Reactエントリ(hydrateせずcreateRoot)
    PostFlow.tsx         位置情報取得〜投稿フォーム(M1〜M3)
    MapView.tsx          Leaflet地図・雲・ピン・アラート表示(M4〜M5)
    counter.ts / counter.tsx  スターター由来、未使用
  agents/counter.ts     スターター由来のDurable Object、未使用

migrations/
  0001_init.sql         moodsテーブル定義
  seed.sql              生成されたシードデータ(scripts/seed.mjsの出力)

scripts/
  seed.mjs              デモ用シードデータ生成スクリプト
```

---

## データモデル

```sql
CREATE TABLE IF NOT EXISTS moods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ward       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  comment    TEXT,
  gender     TEXT,
  age_group  TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_moods_created ON moods(created_at);
```

緯度経度は保存しない(区名のみ保存、座標は判定にのみ使用)。`gender`/`age_group`は将来の属性収集(OPTION)用に用意済みだが、現状は常にNULL。

---

## API(`src/index.tsx`)

### POST /api/moods
- body: `{ ward, score, comment?, gender?, ageGroup? }`
- `ward`: 定義済み23区IDのみ許可(不正なら400)
- `score`: 1〜5の整数のみ(不正なら400)
- `comment`: 100文字に切り詰め
- 返り値: `{ ok: true }`

### GET /api/summary
- 直近6時間(`WINDOW_HOURS`)を区ごとに集計
- 23区すべてを返す(0件でも`count:0`)
- `count < 3`(`MIN_COUNT`)の区は`average`/`weather`が`null`、`enough:false`
- 平均は小数点第1位まで
- `alerts`: 平均が`ALERT_LOW`(2.5)未満で低アラート、`ALERT_HIGH`(3.5)超で高アラート。件数不足の区は対象外

### GET /api/moods/recent
- 直近6時間の投稿を`id, ward, score, comment, createdAt`で新しい順に最大2000件返す
- 地図上の個別ピン描画に使用

---

## フロントエンド

### 起動フロー(`app.tsx`)
- `localStorage`の最終投稿時刻から6時間経過していれば`PostFlow`、そうでなければ`MapView`を表示
- URLに`?demo`を付けると6時間制限を無視して常に投稿画面を表示(デモ用スイッチ)

### 投稿フロー(`PostFlow.tsx`)
- Geolocation APIで現在地取得 → 23区の代表座標との最近傍判定(15km超は区外扱い)
- 位置情報取得不可・拒否時は23区セレクトボックスにフォールバック
- 気分度1〜5をニコチャンマーク(😭😟😐🙂😄)のボタンで選択、コメントは100文字まで任意
- 送信後`localStorage`に投稿時刻を保存し地図画面へ

### 地図画面(`MapView.tsx`)
Leaflet + OpenStreetMapタイルの上に、23区の実際の境界に近い簡易ポリゴンを重ねて表示。

- **遠景(ズーム15未満)**: 各区の平均気分度に応じた色のポリゴンをSVGネイティブの`feGaussianBlur`でぼかして「雲」として表示。データ不足の区は色をつけない(非表示)
- **拡大(ズーム15以上)**: 雲が消え、直近6時間の個別投稿がピン(逆しずく型)として区の実形状内にランダム散布される。ピンの色・顔はスコア1〜5ごとに専用の5段階配色(青→水色→緑→黄→オレンジ)
- コメント付きピンは上向きの吹き出しで常時コメントを表示(クリック不要)
- 上部に東京全体平均、アラート(低/高)をバナー表示
- 30秒ごとに`/api/summary`と`/api/moods/recent`を再取得して自動更新
- パフォーマンスのため、ピンはズームが拡大段階に入ったときだけDOMに追加(遠景では空)
- 地図の表示範囲は23区のバウンディングボックス内に制限(`maxBounds`)

### 共通定義(`shared/wards.ts`)
- 23区のid/表示名/代表座標(緯度経度)
- `findNearestWard`: ハーサバイン公式による最近傍判定
- しきい値定数: `ALERT_LOW=2.5` `ALERT_HIGH=3.5` `MIN_COUNT=3` `WINDOW_HOURS=6`
- `scoreToWeather`: 平均値→天気カテゴリ(雨/くもり時々雨/くもり/晴れ)の変換としきい値
- `WEATHER_COLOR` / `WEATHER_EMOJI`: 区平均の雲に使う4カテゴリの色・絵文字
- `SCORE_COLOR` / `SCORE_EMOJI`: 個別ピン用の5段階(1〜5)専用の色・絵文字
- `isPointInPolygon` / `polygonBounds`: 個別ピンを区の実形状内にランダム配置するためのユーティリティ

### 区ポリゴン(`shared/wardPolygons.ts`)
`niiyz/JapanCityGeoJson`(国土数値情報ベース)から23区の境界データを取得し、Douglas-Peucker法で間引いて生成(1区あたり十数〜数十点)。江戸川区・江東区は元データが不完全だったため座標を手動補正。

---

## シードデータ(`scripts/seed.mjs`)

- 過去7日分: 23区 × 各日2〜3件(直近6時間の窓とは重ならないよう調整)
- 直近6時間: 各区ターゲット50件
  - 低アラート区: 渋谷区(平均2.0程度になるようスコア分布を調整)
  - 高アラート区: 世田谷区(平均4.2程度)
  - データ不足区: 葛飾区(0〜2件のみ)
  - その他の通常区: 閾値をまたがないよう2.6〜3.4程度に収まる分布
  - 各区最低5件は具体的なコメント付き投稿を保証(吹き出し表示のデモ用)
- `node scripts/seed.mjs`で`migrations/seed.sql`を生成し、`wrangler d1 execute --local`/`--remote`の両方に投入

---

## 未実装・今後の課題(OPTION)

- 属性収集(性別・年齢層)画面
- AIによる天気の一文生成・アラート原因推測(Workers AI)
- 区タップでコメント一覧表示
- 時間帯スライダー(6時間の推移アニメーション)
- 曜日・時間帯別の傾向グラフ
- 平常値との差分アラート方式への移行
