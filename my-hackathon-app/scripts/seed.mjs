// デモ用シードデータ生成: 過去7日分の日次データ + 直近6時間の意図的なパターンを仕込む
import { writeFileSync } from 'node:fs'

const WARD_IDS = [
  'itabashi', 'kita', 'adachi',
  'nerima', 'toshima', 'arakawa', 'katsushika',
  'nakano', 'shinjuku', 'bunkyo', 'taito', 'sumida', 'edogawa',
  'suginami', 'shibuya', 'chiyoda', 'chuo', 'koto',
  'setagaya', 'meguro', 'minato',
  'ota', 'shinagawa',
]

const LOW_ALERT_WARD = 'shibuya'
const HIGH_ALERT_WARD = 'setagaya'
const INSUFFICIENT_WARDS = ['katsushika']

// 通常区を雨/くもり時々雨/くもり/晴れの4カテゴリにはっきり分けて、
// 地図の色分けが一目で区別できるようにする(元は全区がくもり寄りの一律パターンで、色の違いがほぼ見えなかった)
const WARD_BAND = {
  // 雨 (平均 <= 2.0)
  nerima: 'rain',
  suginami: 'rain',
  shinagawa: 'rain',
  // くもり時々雨 (2.0 < 平均 <= 2.8)
  adachi: 'rain_cloud',
  bunkyo: 'rain_cloud',
  edogawa: 'rain_cloud',
  koto: 'rain_cloud',
  minato: 'rain_cloud',
  // くもり (2.8 < 平均 <= 3.5)
  kita: 'cloud',
  toshima: 'cloud',
  nakano: 'cloud',
  taito: 'cloud',
  chuo: 'cloud',
  meguro: 'cloud',
  // 晴れ (平均 > 3.5)
  itabashi: 'sunny',
  arakawa: 'sunny',
  shinjuku: 'sunny',
  sumida: 'sunny',
  chiyoda: 'sunny',
  ota: 'sunny',
}

const BAND_SCORE_POOL = {
  rain: [1, 1, 2, 2, 2, 1, 2],
  rain_cloud: [2, 2, 3, 3, 2, 3, 2],
  cloud: [3, 3, 3, 4, 3, 4, 3],
  sunny: [4, 4, 5, 4, 5, 4, 4],
}

// 通常投稿で使う(空コメントを多めに混ぜる)
const COMMENTS = [
  '', '', '', '', '',
  'いい天気だった', '疲れた', 'まあまあ', '眠い', '楽しかった',
  '仕事が大変だった', 'のんびりできた', '特に何もなし', 'ちょっと憂鬱',
  '友達と会えた', '締め切りに追われてる',
]

// 各区で最低5件、吹き出しに表示する具体的なコメント(空文字なし)
const REAL_COMMENTS = [
  'ランチが美味しかった', '電車が遅延して疲れた', '公園でのんびりした',
  '会議が長引いた', '天気が良くて気持ちいい', '寝不足で辛い',
  '新しいカフェを見つけた', '仕事が一段落した', '雨で憂鬱',
  '友達とごはんに行った', '締め切りに追われてる', '散歩が気持ちよかった',
  '子どもと公園に行った', '残業続きでへとへと', '久しぶりに運動した',
  '美味しいコーヒーを飲んだ', '渋滞にはまった', '休憩できて良かった',
  '打ち合わせが多い一日', '夕日がきれいだった',
]

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)]
}

function toSqlDatetime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function esc(s) {
  if (s === null || s === undefined || s === '') return 'NULL'
  return `'${s.replace(/'/g, "''")}'`
}

const rows = []
const now = new Date()
const windowCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000)

// 過去7日分 (直近6時間の窓とは重ならないようにする): 23区 x 各日2〜3件程度(地図ピンが多くなりすぎないよう控えめに)
for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
  for (const ward of WARD_IDS) {
    const count = randInt(2, 3)
    for (let i = 0; i < count; i++) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - daysAgo)
      d.setUTCHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0)
      // 直近6時間の窓に入ってしまったら、窓の直前に押し戻す
      if (d >= windowCutoff) {
        d.setTime(windowCutoff.getTime() - randInt(60, 3600) * 1000)
      }
      const score = randInt(1, 5)
      rows.push({ ward, score, comment: pick(COMMENTS), createdAt: toSqlDatetime(d) })
    }
  }
}

// 直近6時間: 区ごとに意図的なパターンを仕込む
function recentTimestamp() {
  const d = new Date(now)
  d.setUTCHours(d.getUTCHours() - randInt(0, 5), d.getUTCMinutes() - randInt(0, 59), 0, 0)
  return toSqlDatetime(d)
}

const WARD_POST_TARGET = 50
const GUARANTEED_COMMENTS = 5

function addWardWindowPosts(ward, scorePool) {
  const usedComments = new Set()
  for (let i = 0; i < WARD_POST_TARGET; i++) {
    const score = pick(scorePool)
    const forceComment = i < GUARANTEED_COMMENTS
    let comment
    if (forceComment) {
      // 同じ区で同じコメントが重複しないようにする
      do {
        comment = pick(REAL_COMMENTS)
      } while (usedComments.has(comment) && usedComments.size < REAL_COMMENTS.length)
      usedComments.add(comment)
    } else {
      comment = pick(COMMENTS)
    }
    rows.push({ ward, score, comment, createdAt: recentTimestamp() })
  }
}

for (const ward of WARD_IDS) {
  if (ward === LOW_ALERT_WARD) {
    // 平均2.0程度に寄せる
    addWardWindowPosts(ward, [1, 1, 2, 2, 2, 2, 3])
  } else if (ward === HIGH_ALERT_WARD) {
    // 平均4.2程度に寄せる
    addWardWindowPosts(ward, [4, 4, 4, 4, 5, 5, 3])
  } else if (INSUFFICIENT_WARDS.includes(ward)) {
    // 投稿0〜2件のまま残す(データ不足のデモ用)
    const count = randInt(0, 2)
    for (let i = 0; i < count; i++) {
      rows.push({ ward, score: randInt(1, 5), comment: pick(REAL_COMMENTS), createdAt: recentTimestamp() })
    }
  } else {
    // 通常区: WARD_BANDで割り当てた天気カテゴリに応じたスコア分布を使う
    addWardWindowPosts(ward, BAND_SCORE_POOL[WARD_BAND[ward]])
  }
}

const BATCH_SIZE = 300
let sql = ''
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE)
  const values = batch
    .map((r) => `(${esc(r.ward)}, ${r.score}, ${esc(r.comment)}, NULL, NULL, ${esc(r.createdAt)})`)
    .join(',\n  ')
  sql += `INSERT INTO moods (ward, score, comment, gender, age_group, created_at) VALUES\n  ${values};\n\n`
}

writeFileSync(new URL('../migrations/seed.sql', import.meta.url), sql)
console.log(`Generated ${rows.length} rows -> migrations/seed.sql`)
console.log(`低アラート区: ${LOW_ALERT_WARD} / 高アラート区: ${HIGH_ALERT_WARD} / データ不足区: ${INSUFFICIENT_WARDS.join(', ')}`)
