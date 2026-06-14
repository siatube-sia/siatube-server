import express from "express";
import fetch from "node-fetch";
import https from "https"; 
import cors from "cors";
import {
  REQUEST_CLIENTS,
  createPlaylistHeaders,
} from "../shared/youtube-request-config.js";

const app = express();
const port = process.env.PORT || 8005;
app.use(cors());

// エンドポイント
const YT_API = "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false";

// Client Version (debug_rd.jsonから取得した最新版)
const CLIENT_VERSION = REQUEST_CLIENTS.playlist.clientVersion;

// メモリリーク対策: 通信エージェント
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 50,
  timeout: 30000,
});

// ヘッダー設定
const headers = createPlaylistHeaders();

// ==================================================
// ヘルパー関数
// ==================================================

// テキスト抽出 (runs配列 または simpleText)
function extractTitle(t) {
  if (!t) return null;
  if (t.simpleText) return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join("");
  if (t.text) return t.text; // 古い形式への備え
  return null;
}

// 時間表記パース
function parsePublishedToSeconds(publishedStr, durationStr) {
  if (!publishedStr) {
    if (durationStr === "配信予定") return -1;
    return 0;
  }

  const cleanStr = publishedStr.replace(" に配信済み", "").trim();
  const regex = /(\d+)\s*(秒|分|時間|日|週間|か?月|年)前/;
  const match = cleanStr.match(regex);

  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    let multiplier = 1;

    switch (unit) {
      case "秒": multiplier = 1; break;
      case "分": multiplier = 60; break;
      case "時間": multiplier = 3600; break;
      case "日": multiplier = 86400; break;
      case "週間": multiplier = 604800; break;
      case "か":
      case "か月":
      case "月": multiplier = 2592000; break;
      case "年": multiplier = 31536000; break;
    }
    return num * multiplier;
  }
  return 9999999999;
}

// サムネイル取得とBase64変換
async function convertImageToBase64(url) {
  try {
    const res = await fetch(url, { agent: httpsAgent });
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    const ext = url.endsWith(".jpg") ? "jpg" : "webp";
    return `data:image/${ext};base64,${Buffer.from(buf).toString("base64")}`;
  } catch (err) {
    console.error("[convertImageToBase64] Error:", err);
    return null;
  }
}

async function fetchThumbnailWithFallback(vid) {
  // webp優先、だめならjpg
  const webp = `https://i.ytimg.com/vi_webp/${vid}/default.webp`;
  const jpg = `https://i.ytimg.com/vi/${vid}/default.jpg`;

  const webpData = await convertImageToBase64(webp);
  if (webpData) return webpData;

  const jpgData = await convertImageToBase64(jpg);
  if (jpgData) return jpgData;

  // HQ画像などを試すフォールバックが必要ならここに追加
  return null;
}

// ==================================================
// データ取得ロジック
// ==================================================

// ytInitialData 抽出（RD用） - 改良版
async function extractInitialData(url) {
  try {
    const html = await fetch(url, { headers, agent: httpsAgent }).then((r) => r.text());
    
    // 1. 変数定義を探す
    const marker = "var ytInitialData =";
    const idx = html.indexOf(marker);
    if (idx === -1) throw new Error("ytInitialData not found");

    // 2. JSONの開始位置 ({) を特定
    const start = html.indexOf("{", idx);
    if (start === -1) throw new Error("JSON start not found");

    // 3. JSONの終了位置を探す
    // 単純な `indexOf("};")` だとJSON内部の文字列にマッチしてしまう可能性があるため、
    // 次の `<script` タグの手前までを取得し、末尾の `;` を取り除くアプローチをとる
    // もしくは、バランスをとるライブラリを使うのが正解だが、ここでは簡易的に
    // "}; var" や "}; <" など、文の区切りになりそうな場所を探す
    
    // ひとまず、scriptタグの終わりを探すのが最も安全
    let endScript = html.indexOf("</script>", start);
    if (endScript === -1) endScript = html.length;

    // 変数定義の行末（セミコロン）を探す。後ろから探索する
    const scriptContent = html.slice(start, endScript);
    // 末尾の空白とセミコロンを除去してパースを試みる
    let jsonStr = scriptContent.trim();
    if (jsonStr.endsWith(";")) {
        jsonStr = jsonStr.slice(0, -1);
    }
    
    // パース
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // 失敗した場合、従来の "};" 探索で再トライ
      const fallbackEnd = html.indexOf("};", start);
      if (fallbackEnd !== -1) {
          const fallbackJson = html.slice(start, fallbackEnd + 1);
          return JSON.parse(fallbackJson);
      }
      throw e;
    }

  } catch (err) {
    console.error("[extractInitialData] Error:", err);
    throw err;
  }
}

// 継続トークン取得
function getTokenFromAppendAction(json) {
  try {
    const items = json?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems || [];
    for (const it of items) {
      const token = it?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (token) return token;
    }
  } catch {}
  return "";
}

function getTokenFromVideoList(items) {
  if (!Array.isArray(items)) return "";
  for (const it of items) {
    // 通常のContinuationItem
    let token = it?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (token) return token;

    // CommandExecutor経由
    const cmds = it?.continuationItemRenderer?.continuationEndpoint?.commandExecutorCommand?.commands;
    if (Array.isArray(cmds)) {
      for (const c of cmds) {
        const t = c?.continuationCommand?.token;
        if (t) return t;
      }
    }
  }
  return "";
}

// ==================================================
// プレイリスト処理
// ==================================================

// RD (ミックス) プレイリスト
async function handleRDPlaylist(listId, videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}&list=${listId}`;
  const data = await extractInitialData(url);

  // RDリストは twoColumnWatchNextResults -> playlist -> playlist にある
  const playlistObj = data.contents?.twoColumnWatchNextResults?.playlist?.playlist;
  if (!playlistObj) throw new Error("RD playlist object not found in response");

  const rawItems = playlistObj.contents || [];

  const items = (
    await Promise.all(
      rawItems.map(async (entry) => {
        // 現在再生中の動画などは playlistPanelVideoRenderer
        const v = entry.playlistPanelVideoRenderer;
        if (!v) return null;

        const vid = v.videoId;
        const thumbnail = await fetchThumbnailWithFallback(vid);

        return {
          videoId: vid,
          title: extractTitle(v.title),
          // RDリストでは lengthText がある場合が多い
          duration: extractTitle(v.lengthText), 
          author: extractTitle(v.longBylineText) || "YouTube",
          channelId: null, // RDリスト画面からは取得しにくい場合がある
          views: null, // RDリスト画面には表示されないことが多い
          published: null,
          thumbnail,
        };
      })
    )
  ).filter(Boolean);

  const title = extractTitle(playlistObj.title) || "ミックスリスト";
  
  // 概要文
  let descRaw = null;
  if (playlistObj.description) {
      descRaw = extractTitle(playlistObj.description);
  }

  return {
    playlistId: listId,
    title,
    author: "YouTube",
    description: descRaw || "Mixes are playlists automatically created by YouTube",
    totalItems: `${items.length} 本`,
    views: null,
    url,
    thumbnail: null,
    lastUpdated: null,
    items,
    nextToken: null, // RDリストは基本的にHTML一発で取得（無限スクロールの場合は別途対応必要だが通常は固定長）
  };
}

// 通常プレイリスト
async function handleNormalPlaylist(listId, token) {
  const body = {
    context: {
      client: {
        hl: "ja",
        gl: "JP",
        clientName: "WEB",
        clientVersion: CLIENT_VERSION, // ここを更新
        originalUrl: `https://www.youtube.com/playlist?list=${listId}`,
      },
    },
  };

  if (token) body.continuation = token;
  else body.browseId = "VL" + listId;

  const response = await fetch(YT_API, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    agent: httpsAgent, 
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const json = await response.json();

  // メタデータ取得
  const meta = json?.metadata?.playlistMetadataRenderer || {};
  const sidebar = json?.sidebar?.playlistSidebarRenderer?.items || [];
  const primary = sidebar[0]?.playlistSidebarPrimaryInfoRenderer;
  const secondary = sidebar[1]?.playlistSidebarSecondaryInfoRenderer;

  // 動画リストの場所を探索
  const tabs = json?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const tabContent = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  
  // itemSectionRenderer -> playlistVideoListRenderer -> contents
  const itemSection = tabContent.find(c => c.itemSectionRenderer)?.itemSectionRenderer;
  const videoListRenderer = itemSection?.contents?.find(c => c.playlistVideoListRenderer)?.playlistVideoListRenderer;
  
  const firstPageItems = videoListRenderer?.contents || [];

  const extractVideo = async (arr) =>
    (
      await Promise.all(
        arr
          .map((v) => v.playlistVideoRenderer)
          .filter(Boolean)
          .map(async (v) => {
            const vid = v.videoId;
            const thumbnail = await fetchThumbnailWithFallback(vid);

            const title = extractTitle(v.title);
            
            // 時間の取得: lengthText があれば優先、なければ Overlay から
            let duration = extractTitle(v.lengthText);
            if (!duration) {
                duration = v.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText || "";
            }

            // 視聴回数と投稿日
            // videoInfo.runs = ["1.1億 回視聴", " • ", "5 年前"] のような形式
            let views = "";
            let published = "";
            if (v.videoInfo?.runs) {
                views = v.videoInfo.runs[0]?.text || "";
                published = v.videoInfo.runs[2]?.text || "";
            }

            return {
              videoId: vid,
              title,
              duration,
              channelId: v.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "",
              author: extractTitle(v.shortBylineText) || "",
              views,
              published,
              thumbnail,
            };
          })
      )
    ).filter(Boolean);

  const firstVideos = await extractVideo(firstPageItems);

  // 続きの読み込みアイテム（Continuation）
  const continuationItems =
    json?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems || [];
  
  const continuationVideos = await extractVideo(continuationItems);

  const items = [...firstVideos, ...continuationVideos];

  // 次ページのトークン
  const nextToken =
    getTokenFromAppendAction(json) ||
    getTokenFromVideoList(firstPageItems) ||
    "";

  return {
    playlistId: listId,
    title: meta.title || "",
    author: secondary?.videoOwner?.videoOwnerRenderer?.title?.runs?.[0]?.text || "",
    description: meta.description || "",
    responseItems: `${items.length}`,
    totalItems: (primary?.stats?.[0]?.runs?.[0]?.text || "") + "本",
    url: `https://www.youtube.com/playlist?list=${listId}`,
    lastUpdated: primary?.stats?.[2]?.runs?.[1]?.text || "",
    views: primary?.stats?.[1]?.simpleText || "",
    items,
    nextToken,
  };
}

// ==================================================
// ルート設定
// ==================================================

app.get(["/api/playlist/:id", "/playlist/:id"], async (req, res) => {
  let rawParams = req.params.id;
  
  let token = req.query.token || null;
  let videoId = req.query.v || null;

  try {
    // パラメータ解析 (既存ロジック維持)
    let decodedString = rawParams;
    try {
        const decoded = decodeURIComponent(rawParams);
        if (decoded !== rawParams) decodedString = decoded;
    } catch (e) {
        decodedString = rawParams;
    }

    let idString = decodedString;
    let paramStrings = [];

    if (decodedString.includes("==p==")) {
        const parts = decodedString.split("==p==");
        idString = parts[0];
        paramStrings = parts.slice(1);
    } else if (decodedString.includes("&")) {
        const parts = decodedString.split("&");
        idString = parts[0];
        paramStrings = parts.slice(1);
    }

    paramStrings.forEach(str => {
        let key, val;
        if (str.includes("==i==")) {
            [key, val] = str.split("==i==");
        } else if (str.includes("=")) {
            [key, val] = str.split("=");
        }

        if (key && val) {
            if (key === 'token') token = val;
            if (key === 'v') videoId = val;
        }
    });

    const idList = idString.split("====");

    // IDの変換処理
    const targetIds = idList.map((id) => {
      id = id.trim();
      if (id.startsWith("UC")) {
        return "UU" + id.slice(2);
      }
      return id;
    });

    // RD (ミックス) リストの場合
    if (targetIds[0].startsWith("RD")) {
      if (!videoId)
        throw new Error("RD プレイリストには v パラメータが必要です");
      const json = await handleRDPlaylist(targetIds[0], videoId);
      return res.json(json);
    }

    // 通常プレイリストの場合 (並列取得)
    const results = await Promise.all(
      targetIds.map((listId) => handleNormalPlaylist(listId, token))
    );

    // 複数ID指定時のマージ処理
    let allItems = results.flatMap((res) => res.items);

    const itemsWithSortKey = allItems.map((item) => {
      const secondsAgo = parsePublishedToSeconds(item.published, item.duration);
      return {
        ...item,
        _sortSeconds: secondsAgo,
      };
    });

    itemsWithSortKey.sort((a, b) => a._sortSeconds - b._sortSeconds);

    const finalItems = itemsWithSortKey.map((item) => {
      const { _sortSeconds, ...originalItem } = item;
      return originalItem;
    });

    const mergedTitle = targetIds.length > 1 ? "" : (results[0]?.title || "");

    const mergedResponse = {
      playlistId: targetIds.join(","),
      title: mergedTitle,
      author: "Multiple Channels",
      description: "Merged Playlist",
      responseItems: `${finalItems.length}`,
      totalItems: `${finalItems.length} 本`,
      url: "",
      lastUpdated: new Date().toISOString(),
      views: null,
      items: finalItems,
      nextToken: null,
    };

    return res.json(mergedResponse);
  } catch (err) {
    console.error("[/playlist] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
