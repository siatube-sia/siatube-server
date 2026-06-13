## 1. 開発環境の準備と起動方法

本スクリプトはexpressと ES モジュール（`import` 構文）を使用しています。

### サーバーの起動

実行方法は以下の 2 通りのいずれかを選択してください。

* **方法 A:** ファイル名を `youtube-comment.js` とし、同じディレクトリにある `package.json` に `"type": "module"` を追記して実行する。
```bash
node youtube-comment.js

```


* **方法 B:** ファイル名を `youtube-comment.mjs` （拡張子を `.mjs` に変更）にして直接実行する。
```bash
node youtube-comment.mjs

```



起動に成功すると、コンソールに `Server running on port 3000` と表示され、`http://localhost:3000` で接続可能になります。

---

## 2. API エンドポイント詳細

### ① ヘルスチェック（稼働確認）

サーバーが正常に動作しているかを確認するためのエンドポイントです。

* **パス:** `GET /`
* **クエリパラメータ:** なし
* **リクエスト例:** `http://localhost:3000/`

#### レスポンス形式 (JSON)

```json
{
  "ok": true,
  "service": "youtube-comments-api"
}

```

---

### ② コメント一覧の取得

指定した YouTube 動画の親コメント（トップレベルのコメント）を取得します。ページネーション（次ページの読み込み）に対応しています。

* **パス:** `GET /api/comments`
* **クエリパラメータ:**
* `videoId` **(必須)**: YouTube 動画の ID（例: `watch?v=ABC123xyz` の `ABC123xyz` の部分）
* `sort` *(任意)*: コメントの並び順。`top`（人気順・デフォルト）または `new`（新しい順）
* `continuation` *(任意)*: 2 ページ目以降のコメントを取得するためのトークン。指定した場合、`sort` パラメータは無視されます。



#### リクエスト例

* 初回取得（人気順）: `http://localhost:3000/api/comments?videoId=YOUR_VIDEO_ID`
* 初回取得（新しい順）: `http://localhost:3000/api/comments?videoId=YOUR_VIDEO_ID&sort=new`
* 2 ページ目以降の取得: `http://localhost:3000/api/comments?videoId=YOUR_VIDEO_ID&continuation=NEXT_CONTINUATION_TOKEN`

#### レンスポンス形式 (JSON)

```json
{
  "success": true,
  "mode": "initial", 
  "videoId": "YOUR_VIDEO_ID",
  "sort": "top",
  "continuation": "AIxxxx...", 
  "nextContinuation": "AJxxxx...", 
  "fetchedAt": "2026-05-18T14:21:09.000Z",
  "totalComments": 20,
  "comments": [
    {
      "entityKey": "ECAisdB...",
      "commentId": "Ugwxxxx...",
      "text": "動画最高でした！ 👍✨",
      "publishedTime": "1日前",
      "replyLevel": 0,
      "author": {
        "channelId": "UCxxxx...",
        "name": "ユーザー名",
        "avatar": "https://yt3.ggpht.com/...",
        "verified": false,
        "creator": false,
        "artist": false
      },
      "likes": {
        "text": "1.2万",
        "count": 12000
      },
      "replies": {
        "text": "5",
        "count": 5
      },
      "toolbar": {
        "likeCountA11y": "12000 人が [高く評価] にしました",
        "replyCountA11y": "5 件の返信",
        "stateKey": "..."
      },
      "replyContinuation": "AKxxxx..."
    }
  ]
}

```

> **注意キーの解説:**
> * `nextContinuation`: 次のページのコメント一覧を取得するためのトークンです。これ以上コメントがない場合は `null` になります。
> * `replyContinuation`: このコメントに対する「返信（リプライ）」を取得するためのトークンです。返信がない場合は `null` になります。
> 
> 

---

### ③ リプライ（返信）の取得

特定のコメントにぶら下がっている返信（リプライ）の一覧を取得します。

* **パス:** `GET /api/replies`
* **クエリパラメータ:**
* `videoId` **(必須)**: YouTube 動画の ID
* `continuation` **(必須)**: `/api/comments` で取得した各コメント内にある `replyContinuation` の文字列



#### リクエスト例

`http://localhost:3000/api/replies?videoId=YOUR_VIDEO_ID&continuation=REPLY_CONTINUATION_TOKEN`

#### レスポンス形式 (JSON)

```json
{
  "success": true,
  "videoId": "YOUR_VIDEO_ID",
  "continuation": "AKxxxx...",
  "nextContinuation": "ALxxxx...",
  "fetchedAt": "2026-05-18T14:22:00.000Z",
  "totalReplies": 5,
  "replies": [
    {
      "entityKey": "ECAisdB...",
      "commentId": "Ugwxxxx...",
      "text": "同感です！",
      "publishedTime": "18時間前",
      "replyLevel": 1,
      "author": {
        "channelId": "UCyyyy...",
        "name": "返信したユーザー名",
        "avatar": "https://yt3.ggpht.com/...",
        "verified": false,
        "creator": false,
        "artist": false
      },
      "likes": {
        "text": "15",
        "count": 15
      },
      "replies": {
        "text": "0",
        "count": 0
      },
      "toolbar": {
        "likeCountA11y": "15 人が [高く評価] にしました",
        "replyCountA11y": "0 件の返信",
        "stateKey": "..."
      },
      "replyContinuation": null
    }
  ]
}

```

> **注意キーの解説:**
> * リプライの数が多く、一度に表示しきれない場合は `nextContinuation` にさらに続きのリプライを読み込むためのトークンが格納されます。
> 
> 

---

### ④ YouTube API 生データ（デバッグ用）

YouTube の内部エンドポイント（`/youtubei/v1/next`）から返却された、パース（整形）される前の生のレスポンスデータをそのまま取得します。データの構造解析や、拡張したい情報を探すデバッグ用途に使用します。

* **パス:** `GET /api/raw`
* **クエリパラメータ:**
* `videoId` **(必須)**: YouTube 動画の ID
* `continuation` **(必須)**: コメントまたはリプライの各種 `continuation` トークン



#### リクエスト例

`http://localhost:3000/api/raw?videoId=YOUR_VIDEO_ID&continuation=ANY_CONTINUATION_TOKEN`

#### レスポンス形式 (JSON)

YouTube の InnerTube API が返却するJSONがそのまま返却されます。
