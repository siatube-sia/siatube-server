# SiaTube API Documentation

このドキュメントは `comment/index.js`, `video/index.js`, `search/index.js`, `channel/index.js`, `suggest/index.js`, `playlist/index.js` の実装をもとにした API 仕様です。

## Base URLs

| API | Process name | File | Base URL |
|---|---|---|---|
| Comments | `comment-api` | `comment/index.js` | `http://localhost:8000` |
| Video | `video-api` | `video/index.js` | `http://localhost:8001` |
| Search | `search-api` | `search/index.js` | `http://localhost:8002` |
| Channel | `channel-api` | `channel/index.js` | `http://localhost:8003` |
| Suggest | `suggest-api` | `suggest/index.js` | `http://localhost:8004` |
| Playlist | `playlist-api` | `playlist/index.js` | `http://localhost:8005` |

## 共通事項

- すべて JSON を返します。
- YouTube 側の HTML / Innertube レスポンス構造に依存しているため、YouTube の仕様変更でフィールドが `null`, 空文字, 空配列になる場合があります。
- サムネイルは API によって URL の場合と `data:image/...;base64,...` の場合があります。
- 継続取得は各レスポンス内の `nextContinuationToken`, `nextContinuation`, `nextToken`, `continuationToken` を次回リクエストの `token` または `continuation` に渡します。

## comment-api

Base URL: `http://localhost:8000`

### GET `/`

ヘルスチェック相当の簡易レスポンスです。

```bash
curl 'http://localhost:8000/'
```

Response:

```json
{
  "ok": true,
  "service": "youtube-comments-api"
}
```

### GET `/api/comments`

Alias: `/comment/comments`

動画コメントを取得します。初回取得では `videoId` と任意の `sort` を指定します。次ページ取得では `continuation` を指定します。

Query:

| Name | Required | Description |
|---|---:|---|
| `videoId` | yes | YouTube 動画 ID |
| `sort` | no | `top` または `new`。省略時は `top` |
| `continuation` | no | 次ページ用トークン。指定時は `sort` より優先 |

Examples:

```bash
curl 'http://localhost:8000/api/comments?videoId=dQw4w9WgXcQ'
curl 'http://localhost:8000/api/comments?videoId=dQw4w9WgXcQ&sort=new'
curl 'http://localhost:8000/api/comments?videoId=dQw4w9WgXcQ&continuation=CONTINUATION_TOKEN'
```

Response example:

```json
{
  "success": true,
  "mode": "initial",
  "videoId": "dQw4w9WgXcQ",
  "sort": "top",
  "continuation": "COMMENT_SORT_TOKEN",
  "nextContinuation": "NEXT_COMMENTS_TOKEN",
  "fetchedAt": "2026-06-14T08:00:00.000Z",
  "totalComments": 2,
  "comments": [
    {
      "entityKey": "comment-entity-key",
      "commentId": "Ugx...",
      "text": "コメント本文",
      "publishedTime": "1 年前",
      "replyLevel": 0,
      "author": {
        "channelId": "UC...",
        "name": "User Name",
        "avatar": "https://yt3.ggpht.com/...",
        "verified": false,
        "creator": false,
        "artist": false
      },
      "likes": {
        "text": "123",
        "count": 123
      },
      "replies": {
        "text": "5",
        "count": 5
      },
      "toolbar": {
        "likeCountA11y": "123 件の高評価",
        "replyCountA11y": "5 件の返信",
        "stateKey": "toolbar-state-key"
      },
      "replyContinuation": "REPLIES_TOKEN"
    }
  ]
}
```

Errors:

```json
{ "error": "videoId is required" }
```

```json
{ "error": "Internal server error" }
```

### GET `/api/replies`

Alias: `/comment/replies`

コメントの返信一覧を取得します。`replyContinuation` を `/api/comments` のコメントから取得して渡します。

Query:

| Name | Required | Description |
|---|---:|---|
| `videoId` | yes | YouTube 動画 ID |
| `continuation` | yes | 返信取得用 continuation token |

Example:

```bash
curl 'http://localhost:8000/api/replies?videoId=dQw4w9WgXcQ&continuation=REPLIES_TOKEN'
```

Response example:

```json
{
  "success": true,
  "videoId": "dQw4w9WgXcQ",
  "continuation": "REPLIES_TOKEN",
  "nextContinuation": "NEXT_REPLIES_TOKEN",
  "fetchedAt": "2026-06-14T08:00:00.000Z",
  "totalReplies": 1,
  "replies": [
    {
      "commentId": "Ugy...",
      "text": "返信本文",
      "publishedTime": "2 か月前",
      "replyLevel": 1,
      "author": {
        "channelId": "UC...",
        "name": "Reply User",
        "avatar": "https://yt3.ggpht.com/...",
        "verified": false,
        "creator": false,
        "artist": false
      },
      "likes": {
        "text": "10",
        "count": 10
      },
      "replies": {
        "text": "0",
        "count": 0
      },
      "replyContinuation": null
    }
  ]
}
```

### GET `/api/raw`

Alias: `/comment/raw`

YouTube Innertube の raw response を返します。デバッグ用途です。

Query:

| Name | Required | Description |
|---|---:|---|
| `videoId` | yes | YouTube 動画 ID |
| `continuation` | yes | continuation token |

Example:

```bash
curl 'http://localhost:8000/api/raw?videoId=dQw4w9WgXcQ&continuation=TOKEN'
```

Response: YouTube から返った JSON をそのまま返します。

## video-api

Base URL: `http://localhost:8001`

### GET `/health`

```bash
curl 'http://localhost:8001/health'
```

Response:

```json
{ "status": "ok" }
```

### GET `/api/video2/:id`

Alias: `/video/:id`

動画詳細と関連動画を取得します。

Path:

| Name | Required | Description |
|---|---:|---|
| `id` | yes | YouTube 動画 ID。独自形式で `token` や `depth` を埋め込むことも可能 |

Query:

| Name | Required | Description |
|---|---:|---|
| `token` | no | 関連動画の追加取得用 continuation token |
| `depth` | no | `2` 指定時、初回ロード時に関連動画を追加取得 |

Supported parameter styles:

- Standard: `/api/video2/dQw4w9WgXcQ?token=TOKEN`
- Embedded: `/api/video2/dQw4w9WgXcQ====token==i==TOKEN==p==depth==i==2`
- Embedded: `/api/video2/dQw4w9WgXcQ&token=TOKEN&depth=2`
- Embedded: `/api/video2/dQw4w9WgXcQ==p==token==i==TOKEN`

Examples:

```bash
curl 'http://localhost:8001/api/video2/dQw4w9WgXcQ'
curl 'http://localhost:8001/video/dQw4w9WgXcQ?depth=2'
curl 'http://localhost:8001/api/video2/dQw4w9WgXcQ?token=CONTINUATION_TOKEN'
```

Initial response example:

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Video title",
  "views": "1.6億 回視聴",
  "relativeDate": "14 年前",
  "likes": "高評価 100万",
  "thumbnail": "data:image/jpeg;base64,...",
  "author": {
    "id": "UC...",
    "name": "Channel Name",
    "subscribers": "登録者数 100万人",
    "thumbnail": "https://yt3.ggpht.com/...",
    "collaborator": false,
    "collaborators": []
  },
  "description": {
    "text": "説明文\n2行目",
    "formatted": "説明文<br>2行目",
    "run0": "説明文",
    "run1": "2行目",
    "run2": "",
    "run3": ""
  },
  "Related-videos": {
    "relatedCount": 1,
    "nextContinuationToken": "NEXT_RELATED_TOKEN",
    "relatedVideos": [
      {
        "type": "video",
        "videoId": "abc123def45",
        "title": "Related video title",
        "channelName": "Related Channel",
        "viewCountText": "10万 回視聴",
        "publishedTimeText": "1 年前",
        "duration": "3:21",
        "badge": null,
        "thumbnails": [
          { "url": "data:image/jpeg;base64,..." }
        ],
        "thumbnail": "data:image/jpeg;base64,...",
        "channelAvatar": "",
        "playlistId": null,
        "overlayIcon": null
      }
    ]
  },
  "extended_stats": {
    "views_original": "160,000,000 回視聴",
    "views_short": "1.6億 回視聴",
    "date_simple": "2009/10/25",
    "date_relative_label": "14 年前"
  },
  "extended_badges": [],
  "extended_superTitle": "",
  "trackingParams": "..."
}
```

Continuation response example:

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "",
  "Related-videos": {
    "relatedCount": 1,
    "nextContinuationToken": "NEXT_RELATED_TOKEN",
    "relatedVideos": [
      {
        "type": "playlist",
        "videoId": "abc123def45",
        "title": "More related content",
        "channelName": "Channel",
        "viewCountText": "5万 回視聴",
        "publishedTimeText": "2 週間前",
        "duration": "12:00",
        "badge": null,
        "thumbnails": [
          { "url": "data:image/jpeg;base64,..." }
        ],
        "thumbnail": "data:image/jpeg;base64,...",
        "channelAvatar": "",
        "playlistId": "PL..."
      }
    ]
  }
}
```

Unavailable response example:

```json
{
  "id": "dQw4w9WgXcQ",
  "unavailable": true,
  "reason": "Failed to extract data",
  "Related-videos": {
    "relatedVideos": []
  }
}
```

## search-api

Base URL: `http://localhost:8002`

### GET `/search`

Alias: `/search/:q`

YouTube 検索結果を取得します。初回検索は `q`、次ページ以降は `token` を使います。

Query / Path:

| Name | Required | Description |
|---|---:|---|
| `q` | conditional | 検索語。`token` が無い場合は必須 |
| `token` | conditional | 次ページ用 continuation token。指定時は `q` なしでも可 |

Examples:

```bash
curl 'http://localhost:8002/search?q=猫'
curl 'http://localhost:8002/search/猫'
curl 'http://localhost:8002/search?token=CONTINUATION_TOKEN'
```

Response example:

```json
{
  "items": [
    {
      "type": "video",
      "videoId": "abc123def45",
      "title": "Video title",
      "thumbnails": [
        {
          "url": "https://i.ytimg.com/vi/abc123def45/hqdefault.jpg",
          "width": 360,
          "height": 202
        }
      ],
      "duration": "10:01",
      "badges": ["公式"],
      "viewCounts": {
        "full": "1,234 回視聴",
        "short": "1234 回視聴",
        "raw": "1234"
      },
      "publishedTime": "1 日前",
      "playlistId": null,
      "channelId": "UC...",
      "channelName": "Channel Name",
      "channelIcons": [],
      "channelBadges": []
    },
    {
      "type": "channel",
      "channelId": "UC...",
      "channelName": "Channel Name",
      "handle": "@handle",
      "channelIcons": [],
      "description": "チャンネル説明",
      "subscriberCount": "登録者数 10万人",
      "videoCount": "100 本",
      "badges": []
    },
    {
      "type": "playlist",
      "videoId": "abc123def45",
      "title": "Playlist title",
      "thumbnails": [],
      "duration": "",
      "badges": [],
      "viewCounts": {
        "full": "",
        "short": "",
        "raw": ""
      },
      "publishedTime": "",
      "playlistId": "PL...",
      "channelId": "UC...",
      "channelName": "Channel Name",
      "channelIcons": [],
      "channelBadges": []
    }
  ],
  "continuationToken": "NEXT_SEARCH_TOKEN",
  "estimatedResults": "12345",
  "targetId": "search-feed"
}
```

Errors:

```json
{
  "error": "Bad Request",
  "message": "query parameter 'q' or 'token' is required"
}
```

```json
{
  "error": "Bad Gateway",
  "message": "Failed to fetch data from upstream service."
}
```

## channel-api

Base URL: `http://localhost:8003`

### GET `/api/channel/:id`

Alias: `/channel/:id`

チャンネル情報、トップ動画、チャンネル内プレイリストセクションを取得します。

Path:

| Name | Required | Description |
|---|---:|---|
| `id` | yes | YouTube チャンネル ID。通常は `UC...` |

Example:

```bash
curl 'http://localhost:8003/api/channel/UCxxxxxxxxxxxxxxxxxxxxxx'
```

Response example:

```json
{
  "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "title": "Channel Name",
  "avatar": "https://yt3.ggpht.com/...",
  "banner": "https://yt3.googleusercontent.com/...",
  "videoCount": "100 本の動画",
  "description": "チャンネル説明",
  "topVideo": {
    "title": "Top video title",
    "videoId": "abc123def45",
    "viewCount": "1万 回視聴",
    "published": "1 日前",
    "description": "動画説明<br>2行目",
    "thumbnail": "data:image/webp;base64,..."
  },
  "playlists": [
    {
      "title": "Uploads",
      "playlistId": "UUxxxxxxxxxxxxxxxxxxxxxx",
      "items": [
        {
          "videoId": "abc123def45",
          "title": "Video title",
          "duration": "10:00",
          "published": "1 日前",
          "author": "Channel Name",
          "viewCount": "1万 回視聴",
          "thumbnail": "data:image/webp;base64,...",
          "icon": "https://yt3.ggpht.com/..."
        }
      ]
    }
  ],
  "uploadsPlaylistId": "UUxxxxxxxxxxxxxxxxxxxxxx"
}
```

Errors:

```json
{ "error": "YouTube APIがまだ初期化されていません" }
```

```json
{ "error": "チャンネル情報の取得中にエラーが発生しました" }
```

## suggest-api

Base URL: `http://localhost:8004`

### GET `/`

Alias: `/suggest`, `/suggest/:keyword`

Google Suggest の YouTube サジェストを取得します。

Query / Path:

| Name | Required | Description |
|---|---:|---|
| `keyword` | yes | サジェスト元の検索語 |

Examples:

```bash
curl 'http://localhost:8004/?keyword=猫'
curl 'http://localhost:8004/suggest?keyword=猫'
curl 'http://localhost:8004/suggest/猫'
```

Response example:

```json
[
  "猫",
  "猫ミーム",
  "猫 動画",
  "猫 鳴き声"
]
```

Errors:

```json
{ "error": "keywordクエリが必要です" }
```

```json
{ "error": "JSONの解析に失敗しました" }
```

```json
{ "error": "外部リクエストでエラーが発生しました" }
```

## playlist-api

Base URL: `http://localhost:8005`

### GET `/api/playlist/:id`

Alias: `/playlist/:id`

YouTube プレイリスト情報と動画一覧を取得します。チャンネル ID `UC...` を渡すとアップロードプレイリスト `UU...` に変換します。`====` で複数 ID を指定すると、複数プレイリストをマージして公開日時順に並べます。

Path:

| Name | Required | Description |
|---|---:|---|
| `id` | yes | Playlist ID, Channel ID, RD playlist ID, または `====` 区切りの複数 ID |

Query:

| Name | Required | Description |
|---|---:|---|
| `token` | no | 通常プレイリストの次ページ用 token |
| `v` | conditional | `RD...` プレイリストで必須の動画 ID |

Supported parameter styles:

- Standard: `/api/playlist/PL...?token=TOKEN`
- RD playlist: `/api/playlist/RD...?v=VIDEO_ID`
- Channel uploads: `/api/playlist/UCxxxxxxxxxxxxxxxxxxxxxx`
- Multiple IDs: `/api/playlist/UU...====PL...`
- Embedded: `/api/playlist/PL...==p==token==i==TOKEN`
- Embedded: `/api/playlist/PL...&token=TOKEN`

Examples:

```bash
curl 'http://localhost:8005/api/playlist/PLxxxxxxxxxxxxxxxx'
curl 'http://localhost:8005/playlist/UCxxxxxxxxxxxxxxxxxxxxxx'
curl 'http://localhost:8005/api/playlist/RDxxxxxxxxxxx?v=dQw4w9WgXcQ'
curl 'http://localhost:8005/api/playlist/PLxxxxxxxxxxxxxxxx?token=NEXT_TOKEN'
curl 'http://localhost:8005/api/playlist/UUxxxxxxxxxxxxxxxxxxxxxx====PLyyyyyyyyyyyyyyyy'
```

Normal response example:

```json
{
  "playlistId": "PLxxxxxxxxxxxxxxxx",
  "title": "Playlist title",
  "author": "Channel Name",
  "description": "Playlist description",
  "responseItems": "2",
  "totalItems": "100本",
  "url": "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx",
  "lastUpdated": "2026/06/14",
  "views": "1,234 回視聴",
  "items": [
    {
      "videoId": "abc123def45",
      "title": "Video title",
      "duration": "10:00",
      "published": "1 日前",
      "author": "Channel Name",
      "viewCount": "1万 回視聴",
      "thumbnail": "data:image/webp;base64,...",
      "icon": "https://yt3.ggpht.com/..."
    }
  ],
  "nextToken": "NEXT_PLAYLIST_TOKEN"
}
```

Merged response example:

```json
{
  "playlistId": "UUxxxxxxxxxxxxxxxxxxxxxx,PLyyyyyyyyyyyyyyyy",
  "title": "",
  "author": "Multiple Channels",
  "description": "Merged Playlist",
  "responseItems": "2",
  "totalItems": "2 本",
  "url": "",
  "lastUpdated": "2026-06-14T08:00:00.000Z",
  "views": null,
  "items": [
    {
      "videoId": "abc123def45",
      "title": "Video title",
      "duration": "10:00",
      "published": "1 日前",
      "author": "Channel Name",
      "viewCount": "1万 回視聴",
      "thumbnail": "data:image/webp;base64,...",
      "icon": "https://yt3.ggpht.com/..."
    }
  ],
  "nextToken": null
}
```

RD playlist response example:

```json
{
  "playlistId": "RDxxxxxxxxxxx",
  "title": "Mix",
  "author": "",
  "description": "",
  "responseItems": "25",
  "totalItems": "25本",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDxxxxxxxxxxx",
  "lastUpdated": "",
  "views": "",
  "items": [
    {
      "videoId": "abc123def45",
      "title": "Mix item title",
      "duration": "3:30",
      "published": "",
      "author": "Channel Name",
      "viewCount": "",
      "thumbnail": "data:image/webp;base64,...",
      "icon": ""
    }
  ],
  "nextToken": null
}
```

Errors:

```json
{ "error": "RD プレイリストには v パラメータが必要です" }
```

```json
{ "error": "エラーメッセージ" }
```

## pm2 Commands

Status:

```bash
pm2 list
pm2 describe comment-api
pm2 describe video-api
pm2 describe search-api
pm2 describe channel-api
pm2 describe suggest-api
pm2 describe playlist-api
```

Logs:

```bash
pm2 logs comment-api --lines 100
pm2 logs video-api --lines 100
pm2 logs search-api --lines 100
pm2 logs channel-api --lines 100
pm2 logs suggest-api --lines 100
pm2 logs playlist-api --lines 100
```

Restart:

```bash
pm2 restart comment-api --update-env
pm2 restart video-api --update-env
pm2 restart search-api --update-env
pm2 restart channel-api --update-env
pm2 restart suggest-api --update-env
pm2 restart playlist-api --update-env
```

Save current process list:

```bash
pm2 save
```
