# Stream URL API 説明書

この API は YouTube の `videoid` を受け取り、上流の `yt-dlp` worker から取得した動画・音声・HLS・字幕情報を、クライアントが扱いやすい形に正規化して返します。

レスポンス重視で読む場合は、まず `GET /api/stream/:videoid` の成功レスポンスを確認してください。

## 起動概要

- `/api/stream/:videoid` でストリーム情報を取得する
- 同じ `videoid` の同時リクエストを 1 回にまとめる
- 取得済みレスポンスをメモリキャッシュする
- 上流 worker を負荷に応じて選択する
- 任意でダッシュボードを表示する
- CORS と基本的なセキュリティヘッダーを付ける

## 環境変数

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listen するホスト |
| `PORT` | `8006` | Listen するポート |
| `UPSTREAM_WORKERS` | `http://192.168.11..` | カンマ区切りの上流 worker URL |
| `UPSTREAM_WORKER_NAMES` | `Worker 1`, ... | worker 表示名。カンマ区切り |
| `PRIMARY_WORKER_MAX_ACTIVE` | `3` | 先頭 worker に割り当てる最大同時処理数 |
| `UPSTREAM_TIMEOUT_MS` | `180000` | 上流 worker へのタイムアウト |
| `STREAM_CACHE_TTL_MS` | `21600000` | 正規化レスポンスのキャッシュ TTL。デフォルト 6 時間 |
| `STREAM_CACHE_MAX_ENTRIES` | `500` | キャッシュ最大件数 |
| `ENABLE_DASHBOARD` | `false` | ダッシュボードを有効化するか |
| `DASHBOARD_TOKEN` | 空 | ダッシュボード用 Bearer/query token |
| `CORS_ALLOW_ORIGINS` | `*` | CORS 許可 Origin。カンマ区切り |

## 共通レスポンスヘッダー

全レスポンスに以下が付与されます。

| ヘッダー | 値 |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Cache-Control` | `no-store` |
| `Access-Control-Allow-Methods` | `GET,OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type,Authorization` |

`CORS_ALLOW_ORIGINS=*` の場合は `Access-Control-Allow-Origin: *` が返ります。特定 Origin のみ許可する設定では、リクエストの `Origin` が許可リストに含まれる時だけその Origin が返ります。

## エンドポイント一覧

| Method | Path | 説明 |
| --- | --- | --- |
| `GET` | `/api/stream/:videoid` | ストリーム情報の取得 |
| `GET` | `/api/stream/dashboard/status` | ダッシュボード用 JSON |
| `GET` | `/api/stream/dashboard` | ダッシュボード HTML |

## GET /health

ヘルスチェック用です。

### 成功レスポンス

```json
{
  "status": "ok"
}
```

## GET /api/stream/:videoid

YouTube の 11 文字 video ID を指定して、再生 URL、音声、HLS、字幕をまとめて取得します。

例:

```bash
curl 'http://localhost:8006/api/stream/v7fqWQ0BPfw'
```

`videoid` は次の正規表現に一致する必要があります。

```text
^[A-Za-z0-9_-]{11}$
```

### キャッシュヘッダー

成功時は `X-Stream-Cache` が返ります。

| 値 | 意味 |
| --- | --- |
| `MISS` | キャッシュになく、上流 worker から新規取得した |
| `HIT` | メモリキャッシュから返した |
| `INFLIGHT` | 同じ `videoid` の取得中リクエストに相乗りした |

### 成功レスポンス全体

実レスポンス `response.jsom` の先頭は次の形です。

```json
{
  "id": "v7fqWQ0BPfw",
  "title": "100万円分ドン・キホーテで好きなもの買ったらヤバイ量にwww",
  "hasM3u8": true,
  "hasSubtitles": true,
  "hasAutomaticCaptions": true,
  "counts": {
    "total": 1188,
    "muxed": 1,
    "videoOnly": 20,
    "audioOnly": 12,
    "m3u8": 55,
    "manualSubtitles": 1,
    "automaticCaptions": 1099,
    "audioLanguages": 2,
    "m3u8Languages": 3,
    "manualSubtitleLanguages": 1,
    "automaticCaptionLanguages": 157
  },
  "streams": {
    "muxed": [],
    "videoOnly": [],
    "audioByLanguage": {}
  },
  "m3u8": {
    "list": [],
    "byLanguage": {}
  },
  "subtitles": {
    "manualByLanguage": {},
    "automaticByLanguage": {}
  }
}
```

`streams.muxed`、`streams.videoOnly`、`streams.audioByLanguage`、`m3u8.list`、`m3u8.byLanguage`、`subtitles.*` には実データが入ります。上の例では読みやすさのため配列とオブジェクトを空で省略しています。完全な実データは `response.jsom` を参照してください。

### トップレベル項目

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | `string \| null` | 動画 ID |
| `title` | `string \| null` | 動画タイトル |
| `hasM3u8` | `boolean` | HLS/m3u8 系ストリームが 1 件以上あるか |
| `hasSubtitles` | `boolean` | 手動字幕が 1 件以上あるか |
| `hasAutomaticCaptions` | `boolean` | 自動字幕が 1 件以上あるか |
| `counts` | `object` | 各カテゴリの件数 |
| `streams` | `object` | 通常の動画・音声ストリーム |
| `m3u8` | `object` | HLS/m3u8 系ストリーム |
| `subtitles` | `object` | 字幕。動画/音声ストリームとは分離 |

### counts

| フィールド | 説明 |
| --- | --- |
| `total` | `muxed + videoOnly + audioOnly + m3u8 + manualSubtitles + automaticCaptions` の合計 |
| `muxed` | 映像と音声が 1 本にまとまったストリーム数 |
| `videoOnly` | 映像のみのストリーム数 |
| `audioOnly` | 音声のみのストリーム数 |
| `m3u8` | HLS/m3u8 系ストリーム数 |
| `manualSubtitles` | 手動字幕エントリ数 |
| `automaticCaptions` | 自動字幕エントリ数 |
| `audioLanguages` | 音声ストリームの言語グループ数 |
| `m3u8Languages` | HLS/m3u8 の言語グループ数 |
| `manualSubtitleLanguages` | 手動字幕の言語グループ数 |
| `automaticCaptionLanguages` | 自動字幕の言語グループ数 |

### streams

`streams` は通常のストリームを種類別に分けます。

| フィールド | 説明 |
| --- | --- |
| `streams.muxed` | 映像と音声が 1 URL にまとまったストリーム配列 |
| `streams.videoOnly` | 映像のみのストリーム配列。音声と結合する用途 |
| `streams.audioByLanguage` | 音声のみのストリームを言語コードごとにまとめたオブジェクト |

### m3u8

HLS/m3u8 系は通常ストリームと別枠です。

| フィールド | 説明 |
| --- | --- |
| `m3u8.list` | HLS/m3u8 系ストリームの全件配列 |
| `m3u8.byLanguage` | HLS/m3u8 系ストリームを言語コードごとにまとめたオブジェクト |

### subtitles

字幕は stream と混ぜず、手動字幕と自動字幕で分けます。

| フィールド | 説明 |
| --- | --- |
| `subtitles.manualByLanguage` | 手動字幕の言語別グループ |
| `subtitles.automaticByLanguage` | 自動字幕の言語別グループ |

### Stream オブジェクト

`muxed`、`videoOnly`、`audioByLanguage.*.streams`、`m3u8.list`、`m3u8.byLanguage.*.streams` の各要素は基本的に同じ形です。

```json
{
  "streamUrl": "https://省略...",
  "sourceKey": "url",
  "mediaType": "muxed",
  "isM3u8": false,
  "language": {
    "code": "ja",
    "name": "日本語",
    "audioContent": null,
    "isOriginal": false,
    "isDubbed": false,
    "isAutoDubbed": false,
    "isDefault": false,
    "isDrc": false,
    "preference": -1
  },
  "formatId": "18",
  "format": "18 - 640x360 (360p)",
  "formatNote": "360p",
  "ext": "mp4",
  "protocol": "https",
  "container": null,
  "resolution": "640x360",
  "width": 640,
  "height": 360,
  "fps": 30,
  "aspectRatio": 1.78,
  "vcodec": "avc1.42001E",
  "acodec": "mp4a.40.2",
  "videoExt": "mp4",
  "audioExt": "none",
  "dynamicRange": "SDR",
  "tbr": 726.305,
  "vbr": null,
  "abr": null,
  "asr": 44100,
  "audioChannels": 2,
  "filesize": 135767688,
  "filesizeApprox": 135767648,
  "duration": null,
  "hasDrm": false,
  "quality": 6,
  "httpHeaders": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-us,en;q=0.5",
    "Sec-Fetch-Mode": "navigate"
  }
}
```

#### Stream オブジェクトの項目

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `streamUrl` | `string` | 実際に取得・再生に使う URL |
| `sourceKey` | `string` | URL の取得元キー。通常は `url` または `manifest_url` |
| `sourcePath` | `string` | fallback 収集時のみ入る場合がある取得元パス |
| `mediaType` | `muxed \| video_only \| audio_only \| hls \| unknown` | メディア種別 |
| `isM3u8` | `boolean` | HLS/m3u8 系か |
| `language` | `object` | 言語と音声種別の判定情報 |
| `formatId` | `string \| null` | yt-dlp の `format_id` |
| `format` | `string \| null` | yt-dlp の `format` |
| `formatNote` | `string \| null` | 画質、言語、DRC などの補足 |
| `ext` | `string \| null` | 拡張子またはコンテナ種別 |
| `protocol` | `string \| null` | `https`, `m3u8_native` など |
| `container` | `string \| null` | `mp4_dash`, `webm_dash`, `m4a_dash` など |
| `resolution` | `string \| null` | `640x360`, `audio only` など |
| `width` | `number \| null` | 横幅 |
| `height` | `number \| null` | 高さ |
| `fps` | `number \| null` | フレームレート |
| `aspectRatio` | `number \| null` | アスペクト比 |
| `vcodec` | `string \| null` | 映像 codec。音声のみなら `none` |
| `acodec` | `string \| null` | 音声 codec。映像のみなら `none` |
| `videoExt` | `string \| null` | 映像側の拡張子 |
| `audioExt` | `string \| null` | 音声側の拡張子 |
| `dynamicRange` | `string \| null` | `SDR` など |
| `tbr` | `number \| null` | 総ビットレート目安 |
| `vbr` | `number \| null` | 映像ビットレート目安 |
| `abr` | `number \| null` | 音声ビットレート目安 |
| `asr` | `number \| null` | 音声サンプリングレート |
| `audioChannels` | `number \| null` | 音声チャンネル数 |
| `filesize` | `number \| null` | ファイルサイズ |
| `filesizeApprox` | `number \| null` | 推定ファイルサイズ |
| `duration` | `number \| null` | 長さ。上流値がなければ `null` |
| `hasDrm` | `boolean \| null` | DRM 有無 |
| `quality` | `number \| null` | yt-dlp の品質指標 |
| `httpHeaders` | `object \| null` | URL 取得時に必要な可能性がある HTTP ヘッダー |

### language オブジェクト

```json
{
  "code": "ja",
  "name": "日本語",
  "audioContent": "original",
  "isOriginal": true,
  "isDubbed": false,
  "isAutoDubbed": false,
  "isDefault": true,
  "isDrc": true,
  "preference": 10
}
```

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `code` | `string \| null` | 言語コード。例: `ja`, `en-US` |
| `name` | `string \| null` | 日本語表示の言語名。取得できない場合は `null` |
| `audioContent` | `string \| null` | `original`, `dubbed-auto` など。URL の `xtags` から取れる場合がある |
| `isOriginal` | `boolean` | オリジナル音声判定 |
| `isDubbed` | `boolean` | 吹き替え音声判定 |
| `isAutoDubbed` | `boolean` | 自動吹き替え判定 |
| `isDefault` | `boolean` | デフォルト音声判定 |
| `isDrc` | `boolean` | DRC 音声判定 |
| `preference` | `number \| null` | yt-dlp の `language_preference` |

### muxed の例

`streams.muxed` は映像と音声が 1 本になった URL です。単純再生や単純ダウンロードでは最初に見る候補です。

```json
{
  "streamUrl": "https://省略...",
  "sourceKey": "url",
  "mediaType": "muxed",
  "isM3u8": false,
  "language": {
    "code": "ja",
    "name": "日本語",
    "audioContent": null,
    "isOriginal": false,
    "isDubbed": false,
    "isAutoDubbed": false,
    "isDefault": false,
    "isDrc": false,
    "preference": -1
  },
  "formatId": "18",
  "format": "18 - 640x360 (360p)",
  "formatNote": "360p",
  "ext": "mp4",
  "protocol": "https",
  "container": null,
  "resolution": "640x360",
  "width": 640,
  "height": 360,
  "fps": 30,
  "aspectRatio": 1.78,
  "vcodec": "avc1.42001E",
  "acodec": "mp4a.40.2",
  "videoExt": "mp4",
  "audioExt": "none",
  "dynamicRange": "SDR",
  "tbr": 726.305,
  "vbr": null,
  "abr": null,
  "asr": 44100,
  "audioChannels": 2,
  "filesize": 135767688,
  "filesizeApprox": 135767648,
  "duration": null,
  "hasDrm": false,
  "quality": 6,
  "httpHeaders": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-us,en;q=0.5",
    "Sec-Fetch-Mode": "navigate"
  }
}
```

### videoOnly の例

`streams.videoOnly` は映像だけです。音声がないため、必要に応じて `streams.audioByLanguage` の音声と結合してください。

```json
{
  "streamUrl": "https://省略...",
  "sourceKey": "url",
  "mediaType": "video_only",
  "isM3u8": false,
  "language": {
    "code": null,
    "name": null,
    "audioContent": null,
    "isOriginal": false,
    "isDubbed": false,
    "isAutoDubbed": false,
    "isDefault": false,
    "isDrc": false,
    "preference": -1
  },
  "formatId": "299",
  "format": "299 - 1920x1080 (1080p60)",
  "formatNote": "1080p60",
  "ext": "mp4",
  "protocol": "https",
  "container": "mp4_dash",
  "resolution": "1920x1080",
  "width": 1920,
  "height": 1080,
  "fps": 60,
  "aspectRatio": 1.78,
  "vcodec": "avc1.64002a",
  "acodec": "none",
  "videoExt": "mp4",
  "audioExt": "none",
  "dynamicRange": "SDR",
  "tbr": 4997.678,
  "vbr": 4997.678,
  "abr": 0,
  "asr": null,
  "audioChannels": null,
  "filesize": 934176689,
  "filesizeApprox": 934176591,
  "duration": null,
  "hasDrm": false,
  "quality": 9,
  "httpHeaders": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-us,en;q=0.5",
    "Sec-Fetch-Mode": "navigate"
  }
}
```

### audioByLanguage の例

`streams.audioByLanguage` は言語コードをキーにしたオブジェクトです。各グループは `language` と `streams` を持ちます。

```json
{
  "ja": {
    "language": {
      "code": "ja",
      "name": "日本語",
      "audioContent": "original",
      "isOriginal": true,
      "isDubbed": false,
      "isAutoDubbed": false,
      "isDefault": true,
      "isDrc": true,
      "preference": 10
    },
    "streams": [
      {
        "streamUrl": "https://省略...",
        "sourceKey": "url",
        "mediaType": "audio_only",
        "isM3u8": false,
        "language": {
          "code": "ja",
          "name": "日本語",
          "audioContent": "original",
          "isOriginal": true,
          "isDubbed": false,
          "isAutoDubbed": false,
          "isDefault": true,
          "isDrc": true,
          "preference": 10
        },
        "formatId": "249-drc",
        "format": "249-drc - audio only (Japanese original (default), low, DRC)",
        "formatNote": "Japanese original (default), low, DRC",
        "ext": "webm",
        "protocol": "https",
        "container": "webm_dash",
        "resolution": "audio only",
        "width": null,
        "height": null,
        "fps": null,
        "aspectRatio": null,
        "vcodec": "none",
        "acodec": "opus",
        "videoExt": "none",
        "audioExt": "webm",
        "dynamicRange": null,
        "tbr": 51.082,
        "vbr": 0,
        "abr": 51.082,
        "asr": 48000,
        "audioChannels": 2,
        "filesize": 9548910,
        "filesizeApprox": 9548892,
        "duration": null,
        "hasDrm": false,
        "quality": 1.5,
        "httpHeaders": {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-us,en;q=0.5",
          "Sec-Fetch-Mode": "navigate"
        }
      }
    ]
  }
}
```

### m3u8 の例

`m3u8.list` は HLS/m3u8 系の全件です。`m3u8.byLanguage` は同じデータを言語別にまとめます。

```json
{
  "list": [
    {
      "streamUrl": "https://省略...",
      "sourceKey": "url",
      "mediaType": "hls",
      "isM3u8": true,
      "language": {
        "code": "en-US",
        "name": "アメリカ英語",
        "audioContent": null,
        "isOriginal": false,
        "isDubbed": false,
        "isAutoDubbed": false,
        "isDefault": false,
        "isDrc": false,
        "preference": null
      },
      "formatId": "91-0",
      "format": "91-0 - 256x144",
      "formatNote": null,
      "ext": "mp4",
      "protocol": "m3u8_native",
      "container": null,
      "resolution": "256x144",
      "width": 256,
      "height": 144,
      "fps": 30,
      "aspectRatio": 1.78,
      "vcodec": "avc1.4D400C",
      "acodec": "mp4a.40.5",
      "videoExt": "mp4",
      "audioExt": "none",
      "dynamicRange": "SDR",
      "tbr": 236.499,
      "vbr": null,
      "abr": null,
      "asr": null,
      "audioChannels": null,
      "filesize": null,
      "filesizeApprox": null,
      "duration": null,
      "hasDrm": false,
      "quality": 0,
      "httpHeaders": {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-us,en;q=0.5",
        "Sec-Fetch-Mode": "navigate"
      }
    }
  ],
  "byLanguage": {
    "en-US": {
      "language": {
        "code": "en-US",
        "name": "アメリカ英語",
        "audioContent": null,
        "isOriginal": false,
        "isDubbed": false,
        "isAutoDubbed": false,
        "isDefault": false,
        "isDrc": false,
        "preference": null
      },
      "streams": []
    }
  }
}
```

### 字幕の例

字幕グループは `language` と `captions` を持ちます。`captions` の要素は stream ではないため、`streamUrl` ではなく `url` を持ちます。

```json
{
  "manualByLanguage": {
    "live_chat": {
      "language": {
        "code": "live_chat",
        "name": null
      },
      "captions": [
        {
          "url": "https://省略...",
          "kind": "manual",
          "language": {
            "code": "live_chat",
            "name": null
          },
          "ext": "json",
          "protocol": "youtube_live_chat_replay",
          "name": null,
          "formatId": null
        }
      ]
    }
  },
  "automaticByLanguage": {
    "ja": {
      "language": {
        "code": "ja",
        "name": "日本語"
      },
      "captions": [
        {
          "url": "https://省略...",
          "kind": "automatic",
          "language": {
            "code": "ja",
            "name": "日本語"
          },
          "ext": "json3",
          "protocol": null,
          "name": "Japanese",
          "formatId": null
        }
      ]
    }
  }
}
```

#### Caption オブジェクトの項目

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `url` | `string` | 字幕 URL |
| `kind` | `manual \| automatic` | 手動字幕か自動字幕か |
| `language.code` | `string` | 言語コード |
| `language.name` | `string \| null` | 日本語表示の言語名 |
| `ext` | `string \| null` | `json3`, `srv1`, `vtt`, `ttml` など |
| `protocol` | `string \| null` | 字幕 protocol |
| `name` | `string \| null` | 上流の字幕名 |
| `formatId` | `string \| null` | 上流の format ID |

## 正規化ルール

### mediaType の判定

| 条件 | `mediaType` |
| --- | --- |
| URL や protocol が m3u8/HLS 系 | `hls` |
| `vcodec` と `acodec` がどちらも `none` ではない | `muxed` |
| `vcodec` があり、`acodec` が `none` | `video_only` |
| `acodec` があり、`vcodec` が `none` | `audio_only` |
| 判定不能 | `unknown` |

### 除外されるもの

次のようなものは stream として返しません。

- HTTP URL ではないもの
- storyboard / thumbnail / image / mhtml 系
- 映像・音声・HLS と判定できないもの
- `fragments`, `subtitles`, `automatic_captions`, `requested_subtitles`, `thumbnails`, `webpage`, `channel` 配下の fallback URL

### 重複排除

次の要素を連結したキーで重複を排除します。

```text
streamUrl | formatId | mediaType | language.code | language.audioContent | language.isDrc
```

## エラーレスポンス

### videoid が不正

HTTP status: `400`

```json
{
  "error": "Bad Request",
  "message": "videoid must be an 11-character YouTube video ID"
}
```

### 上流 worker がエラーを返した

HTTP status: `502`

```json
{
  "error": "Bad Gateway",
  "message": "Upstream server returned an error"
}
```

### 上流 worker のレスポンスが JSON ではない

HTTP status: `502`

```json
{
  "error": "Bad Gateway",
  "message": "Invalid upstream response"
}
```

### 上流 worker がタイムアウト

HTTP status: `504`

```json
{
  "error": "Gateway Timeout",
  "message": "Upstream server request timed out"
}
```

### その他の上流通信失敗

HTTP status: `502`

```json
{
  "error": "Bad Gateway",
  "message": "Upstream server request failed"
}
```

### 存在しないパス

HTTP status: `404`

```json
{
  "error": "Not Found"
}
```

## ダッシュボード

`ENABLE_DASHBOARD=true` の場合のみ有効です。

`DASHBOARD_TOKEN` が設定されている場合は、次のどちらかで token を渡します。

```bash
curl -H 'Authorization: Bearer YOUR_TOKEN' 'http://localhost:8006/api/stream/dashboard/status'
curl 'http://localhost:8006/api/stream/dashboard/status?token=YOUR_TOKEN'
```

### 無効時

HTTP status: `404`

```json
{
  "error": "Not Found"
}
```

### token 不一致

HTTP status: `401`

```json
{
  "error": "Unauthorized"
}
```

### GET /api/stream/dashboard/status 成功レスポンス

```json
{
  "generatedAt": "2026-06-15T00:00:00.000Z",
  "uptimeSeconds": 123,
  "config": {
    "port": 8006,
    "primaryWorkerMaxActive": 3,
    "streamCacheTtlMs": 21600000,
    "workerNames": ["Worker 1", "Worker 2"]
  },
  "workers": [
    {
      "name": "Worker 1",
      "active": 1,
      "primary": true
    },
    {
      "name": "Worker 2",
      "active": 0,
      "primary": false
    }
  ],
  "inflight": {
    "count": 1,
    "items": [
      {
        "videoid": "v7fqWQ0BPfw",
        "workerName": "Worker 1",
        "startedAt": "2026-06-15T00:00:00.000Z",
        "ageMs": 2500
      }
    ]
  },
  "cache": {
    "count": 1,
    "items": [
      {
        "videoid": "v7fqWQ0BPfw",
        "title": "100万円分ドン・キホーテで好きなもの買ったらヤバイ量にwww",
        "expiresAt": "2026-06-15T06:00:00.000Z",
        "remainingMs": 21600000
      }
    ]
  }
}
```

## クライアント側の使い分け

単純に再生できる URL が欲しい場合は、まず `streams.muxed` を見ます。高画質で処理したい場合は `streams.videoOnly` から映像を選び、`streams.audioByLanguage` から音声を選んで結合します。HLS 再生に対応したプレイヤーなら `m3u8.list` または `m3u8.byLanguage` を使います。字幕が必要な場合は `subtitles.manualByLanguage` を優先し、なければ `subtitles.automaticByLanguage` を使います。

`streamUrl` は期限付き URL である可能性があります。API 側のキャッシュ TTL はデフォルト 6 時間ですが、上流の URL 期限がそれより短い場合もあるため、再生直前に取得する運用が安全です。
