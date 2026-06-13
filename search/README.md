### APIの呼び出し（リクエスト例）

ブラウザやAPIクライアント（Postman、cURL等）から、`q` パラメータに検索キーワードを指定して `GET` リクエストを送信します。

* **例（「猫」で検索する場合）**:
`http://localhost:3000/search?q=猫`

---

## 2. 全機能の詳細解説

### ① エンドポイント制御（`app.get("/search")`）

* **必須パラメータチェック**: クエリパラメータ `q`（検索キーワード）が含まれていない場合、`400 Bad Request` を返します。
* **YouTube内部API（InnerTube）への偽装リクエスト**:
YouTube公式のWEBブラウザ（DESKTOP環境）からのアクセスを模倣するため、クライアントバージョンやユーザーエージェント、リファラなどのヘッダーを厳密に設定して `POST` リクエストを送信します。
* **アップストリームエラーハンドリング**: YouTube側へのリクエストが失敗（ステータスコードが200番台以外）した場合は、`502 Bad Gateway` を返します。
* **環境に応じたエラー詳細出力**: サーバー内部で例外（500エラー）が発生した際、環境変数 `NODE_ENV` が `development` の場合のみスタックトレース等のメッセージをレスポンスに含めます。

### ② サムネイルURLの最適化処理

* 抽出された各アイテムのサムネイル配列から、**最も解像度が高い最後の画像URL**を自動で選択します。
* URLが相対パス（`//example.com/...`）で始まっている場合、先頭に `https:` を補完して完全なURLに整形します。

### ③ データ抽出ロジック（`extractYouTubeData` 関数）

YouTubeから返される超巨大なネスト（階層）JSONを、再帰関数（`traverse`）を用いて走査し、以下の4つの形式に分類して抽出します。

| コンテンツ型 (`type`) | 判定オブジェクト | 抽出される主な情報 |
| --- | --- | --- |
| **video** (通常の動画) | `videoRenderer` | 動画ID、タイトル、サムネイル、再生時間、バッジ、視聴回数、投稿時期、チャンネル情報（名前、ID、アイコン、公式バッジ） |
| **shorts** (ショート) | `shortsLockupViewModel`<br>

<br>`reelItemRenderer` | 動画ID、タイトル、サムネイル、視聴回数（新旧両方のUI構造に対応） |
| **playlist** (再生リスト) | `lockupViewModel` (PLAYLIST型)<br>

<br>`playlistRenderer` | リストID、タイトル、サムネイル、動画本数、作成チャンネル情報（新旧両方のUI構造に対応） |
| **channel** (チャンネル) | `channelRenderer` | チャンネルID、名前、ハンドル名（@...）、アイコン、説明文、登録者数、動画本数、公式バッジ |

* **視聴回数の数値化機能 (`parseViewCount`)**:
「100万回」や「5.5万回」のような日本語表記の文字列を正規表現で解析し、純粋な数値の文字列（`1000000` や `55000`）に変換して `raw` フィールドに格納します。
* **ページネーション用トークンの取得**:
次ページの検索結果を読み込むために必要な `continuationToken` を自動で抽出します。

---

## 3. レスポンス形式（JSON）

正常に処理が完了した場合（ステータスコード `200`）、以下の構造のJSONが返却されます。

```json
{
  "items": [
    {
      "type": "video",
      "videoId": "dQw4w9WgXcQ",
      "title": "サンプル動画タイトル",
      "thumbnails": [
        {
          "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          "width": 360,
          "height": 202
        }
      ],
      "duration": "3:32",
      "badges": ["4K", "字幕"],
      "viewCounts": {
        "full": "1,234,567 回視聴",
        "short": "123万回視聴",
        "raw": "1234567"
      },
      "publishedTime": "3 日前",
      "playlistId": null,
      "channelId": "UC_x5XG1OV2P6uYZ5pxFChwA",
      "channelName": "公式チャンネル名",
      "channelIcons": [
        {
          "url": "https://yt3.ggpht.com/ytc/AIdro5...",
          "width": 68,
          "height": 68
        }
      ],
      "channelBadges": ["確認済み"]
    },
    {
      "type": "shorts",
      "videoId": "sYn8W1Axxxx",
      "title": "おもしろショート動画",
      "thumbnails": [...],
      "duration": "",
      "badges": [],
      "viewCounts": {
        "full": "",
        "short": "50万回視聴",
        "raw": "500000"
      },
      "publishedTime": "",
      "playlistId": null,
      "channelId": "",
      "channelName": "",
      "channelIcons": [],
      "channelBadges": []
    },
    {
      "type": "channel",
      "channelId": "UC_x5XG1OV2P6uYZ5pxFChwA",
      "channelName": "クリエイターチャンネル",
      "handle": "@creator_handle",
      "channelIcons": [...],
      "description": "チャンネルの概要欄テキストがここに入ります。",
      "subscriberCount": "チャンネル登録者数 50万人",
      "videoCount": "420 本の動画",
      "badges": ["公式アーティスト"]
    }
  ],
  "continuationToken": "4qmF4okKZy...",
  "estimatedResults": "約 4,500,000 件",
  "targetId": "search-results-page"
}

```

### レスポンスの主要キー解説

* **`items`**: 検索結果にヒットしたコンテンツの配列。表示順にオブジェクトが格納されます。
* **`continuationToken`**: 追加で次のページを読み込む際に必要となるYouTube側の内部トークンです（※このスクリプト単体には次ページをリクエストする機能は未実装です）。
* **`estimatedResults`**: 検索ワードに対するYouTube上のヒット予測件数です。
* **`targetId`**: YouTubeのレスポンスコンテキストに含まれる識別IDです。
