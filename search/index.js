import express from "express";
import {
  REQUEST_CLIENTS,
  createSearchHeaders,
} from "../shared/youtube-request-config.js";

const app = express();

const PORT = 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * YouTubeの検索結果JSONから動画、ショート、再生リスト、チャンネル情報を抽出する関数
 */
function extractYouTubeData(json) {
  const items = [];
  let continuationToken = null;

  // 1ページ目、または2ページ目の構造からヒット件数を取得（2ページ目以降は含まれないことが多い）
  const estimatedResults =
    json?.estimatedResults || json?.estimatedResults?.simpleText || null;

  // 1ページ目と2ページ目（onResponseReceivedCommands）の両方の targetId に対応
  const targetId =
    json?.targetId ||
    json?.responseContext?.serviceTrackingParams?.[0]?.params?.find(
      (p) => p.key === "targetId"
    )?.value ||
    json?.onResponseReceivedCommands?.[0]?.appendContinuationItemsAction?.targetId || // 2ページ目用パス
    null;

  const parseViewCount = (fullText, shortText) => {
    const full = fullText || shortText || "";
    const short = shortText || fullText || "";
    let raw = "";

    if (fullText) {
      raw = fullText.replace(/[^0-9]/g, "");
    }

    if (!raw && shortText) {
      const match = shortText.match(/([0-9.]+)(万|億)?/);
      if (match) {
        let num = parseFloat(match[1]);
        if (match[2] === "万") num *= 10000;
        else if (match[2] === "億") num *= 100000000;
        raw = String(Math.floor(num));
      } else {
        raw = shortText.replace(/[^0-9]/g, "");
      }
    }

    return { full, short, raw };
  };

  function traverse(obj) {
    if (!obj || typeof obj !== "object") return;

    // 次のページ（3ページ目、4ページ目...）のためのトークン取得
    // 2ページ目の continuationItems の末尾にあるトークンもこれで自動キャッチします
    if (obj.continuationItemRenderer) {
      const token =
        obj.continuationItemRenderer?.continuationEndpoint?.continuationCommand
          ?.token;

      if (token) continuationToken = token;
      return;
    }

    if (obj.channelRenderer) {
      const channel = obj.channelRenderer;
      let subscriberText = "";
      let videoCountText = "";
      let handleText = "";

      const text1 =
        channel.videoCountText?.simpleText ||
        channel.videoCountText?.runs?.[0]?.text ||
        "";
      const text2 =
        channel.subscriberCountText?.simpleText ||
        channel.subscriberCountText?.runs?.[0]?.text ||
        "";

      [text1, text2].forEach((t) => {
        if (t.includes("登録者数")) subscriberText = t;
        else if (t.includes("本")) videoCountText = t;
        else if (t.startsWith("@")) handleText = t;
      });

      const description =
        channel.descriptionSnippet?.runs?.map((run) => run.text).join("") || "";

      items.push({
        type: "channel",
        channelId: channel.channelId || "",
        channelName:
          channel.title?.simpleText ||
          channel.title?.runs?.map((r) => r.text).join("") ||
          "",
        handle: handleText,
        channelIcons: channel.thumbnail?.thumbnails || [],
        description: description,
        subscriberCount: subscriberText,
        videoCount: videoCountText,
        badges: (channel.ownerBadges || [])
          .map((b) => b.metadataBadgeRenderer?.tooltip)
          .filter(Boolean),
      });
      return;
    }

    // 1ページ目でも、2ページ目の appendContinuationItemsAction の奥にあっても自動でここにヒットします
    if (obj.videoRenderer) {
      const v = obj.videoRenderer;
      const ownerRun =
        v.ownerText?.runs?.[0] || v.longBylineText?.runs?.[0] || {};

      let channelIcons = [];
      if (
        v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer
          ?.thumbnail?.thumbnails
      ) {
        channelIcons =
          v.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer
            .thumbnail.thumbnails;
      } else if (
        v.avatar?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image
          ?.sources
      ) {
        channelIcons =
          v.avatar.decoratedAvatarViewModel.avatar.avatarViewModel.image
            .sources;
      }

      items.push({
        type: "video",
        videoId: v.videoId || "",
        title: v.title?.runs?.map((r) => r.text).join("") || "",
        thumbnails: v.thumbnail?.thumbnails || [],
        duration: v.lengthText?.simpleText || "",
        badges: (v.badges || [])
          .map((b) => b.metadataBadgeRenderer?.label)
          .filter(Boolean),
        viewCounts: parseViewCount(
          v.viewCountText?.simpleText,
          v.shortViewCountText?.simpleText
        ),
        publishedTime: v.publishedTimeText?.simpleText || "",
        playlistId: v.navigationEndpoint?.watchEndpoint?.playlistId || null,
        channelId: ownerRun.navigationEndpoint?.browseEndpoint?.browseId || "",
        channelName: ownerRun.text || "",
        channelIcons: channelIcons,
        channelBadges: (v.ownerBadges || [])
          .map((b) => b.metadataBadgeRenderer?.tooltip)
          .filter(Boolean),
      });
      return;
    }

    if (obj.shortsLockupViewModel || obj.reelItemRenderer) {
      const isNewUi = !!obj.shortsLockupViewModel;
      const shorts = obj.shortsLockupViewModel || obj.reelItemRenderer;

      const videoId = isNewUi
        ? shorts.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId
        : shorts.videoId;
      const title = isNewUi
        ? shorts.overlayMetadata?.primaryText?.content
        : shorts.headline?.simpleText || shorts.headline?.runs?.[0]?.text;
      const thumbnails = isNewUi
        ? shorts.thumbnailViewModel?.thumbnailViewModel?.image?.sources ||
          shorts.onTap?.innertubeCommand?.reelWatchEndpoint?.thumbnail
            ?.thumbnails
        : shorts.thumbnail?.thumbnails;
      const viewTextShort = isNewUi
        ? shorts.overlayMetadata?.secondaryText?.content
        : shorts.viewCountText?.simpleText;

      items.push({
        type: "shorts",
        videoId: videoId || "",
        title: title || "",
        thumbnails: thumbnails || [],
        duration: "",
        badges: [],
        viewCounts: parseViewCount(null, viewTextShort),
        publishedTime: "",
        playlistId: null,
        channelId: "",
        channelName: "",
        channelIcons: [],
        channelBadges: [],
      });
      return;
    }

    if (
      (obj.lockupViewModel &&
        obj.lockupViewModel.contentType === "LOCKUP_CONTENT_TYPE_PLAYLIST") ||
      obj.playlistRenderer
    ) {
      const isNewUi = !!obj.lockupViewModel;
      const playlist = obj.lockupViewModel || obj.playlistRenderer;

      let videoId = "",
        title = "",
        thumbnails = [],
        videoCountText = "",
        playlistId = "",
        channelId = "",
        channelName = "";

      if (isNewUi) {
        const metaRows =
          playlist.metadata?.lockupMetadataViewModel?.metadata
            ?.contentMetadataViewModel?.metadataRows || [];
        videoId =
          playlist.itemPlayback?.inlinePlayerData?.onSelect?.innertubeCommand
            ?.watchEndpoint?.videoId || "";
        title =
          playlist.metadata?.lockupMetadataViewModel?.title?.content || "";
        thumbnails =
          playlist.contentImage?.collectionThumbnailViewModel?.primaryThumbnail
            ?.thumbnailViewModel?.image?.sources || [];
        channelName = metaRows[0]?.metadataParts?.[0]?.text?.content || "";
        videoCountText =
          metaRows.find((r) =>
            r.metadataParts?.some((p) => p.text?.content?.includes("本"))
          )?.metadataParts?.[0]?.text?.content || "";
        playlistId = playlist.contentId || "";
      } else {
        videoId = playlist.navigationEndpoint?.watchEndpoint?.videoId || "";
        title =
          playlist.playlistId || "";
        channelId =
          playlist.shortBylineText?.runs?.[0]?.navigationEndpoint
            ?.browseEndpoint?.browseId || "";
        channelName = playlist.shortBylineText?.runs?.[0]?.text || "";
      }

      items.push({
        type: "playlist",
        videoId,
        title,
        thumbnails,
        duration: "",
        badges: ["再生リスト"],
        viewCounts: {
          full: videoCountText,
          short: videoCountText,
          raw: videoCountText.replace(/[^0-9]/g, ""),
        },
        publishedTime: "",
        playlistId,
        channelId,
        channelName,
        channelIcons: [],
        channelBadges: [],
      });
      return;
    }

    // 再帰的にオブジェクトの全キー、配列の全要素を掘り下げる
    if (Array.isArray(obj)) {
      for (const v of obj) traverse(v);
    } else {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) traverse(obj[k]);
      }
    }
  }

  try {
    traverse(json);
  } catch (e) {
    console.error("extract error:", e);
  }

  return {
    items,
    continuationToken,
    estimatedResults,
    targetId,
  };
}

// ==========================================
// API エンドポイント
// ==========================================
app.get("/search", async (req, res) => {
  try {
    const q = req.query.q;
    const token = req.query.token; 

    if (!q && !token) {
      return res.status(400).json({
        error: "Bad Request",
        message: "query parameter 'q' or 'token' is required",
      });
    }

    // 1. YouTube API Fetch
    const url = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
    const body = {
      context: {
        client: {
          hl: "ja",
          gl: "JP",
          clientName: "WEB",
          clientVersion: REQUEST_CLIENTS.search.clientVersion,
          platform: "DESKTOP",
          utcOffsetMinutes: 540,
        },
        user: { lockedSafetyMode: false },
        request: { useSsl: true },
      },
    };

    if (token) {
      body.continuation = token; // 2ページ目以降は単にトークンを渡すだけでOK
    } else {
      body.query = q;
    }

    const refererQuery = q ? encodeURIComponent(String(q)) : "";
    const referer = `https://www.youtube.com/results?search_query=${refererQuery}`;

    const response = await fetch(url, {
      method: "POST",
      headers: createSearchHeaders(referer),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`YouTube API responded with status: ${response.status}`);
      return res.status(502).json({
        error: "Bad Gateway",
        message: "Failed to fetch data from upstream service.",
      });
    }

    const json = await response.json();

    // 2. JSON Parse + Extract (1ページ目も2ページ目以降も共通でパースする)
    const parsedData = extractYouTubeData(json);

    // ③ サムネイル処理の最適化（Base64変換の廃止、URL整形のみ）
    if (parsedData.items && parsedData.items.length > 0) {
      for (const item of parsedData.items) {
        if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
          const lastThumbnail = item.thumbnails[item.thumbnails.length - 1];

          if (lastThumbnail && lastThumbnail.url) {
            let imgUrl = lastThumbnail.url;
            if (imgUrl.startsWith("//")) {
              imgUrl = "https:" + imgUrl;
            }
            item.thumbnails = [{ ...lastThumbnail, url: imgUrl }];
          }
        }
      }
    }

    return res.status(200).json(parsedData);
  } catch (error) {
    console.error("Internal Server Error:", error);

    const errorResponse = { error: "Internal Server Error" };
    if (NODE_ENV === "development") {
      errorResponse.message = error.message;
    }

    return res.status(500).json(errorResponse);
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT} [${NODE_ENV}]`);
});
