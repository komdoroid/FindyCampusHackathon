const USER_ID_KEY = 'kibun-tenkizu:userId'

// ログイン機能は作らない前提のため、端末ごとの匿名IDで「自分の投稿」を判定する
export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}
