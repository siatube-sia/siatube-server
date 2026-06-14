import express from "express";
import fs from "fs";

const app = express();
loadDotEnv();
app.disable("x-powered-by");
app.set("trust proxy", true);

const HOST = process.env.HOST || "0.0.0.0";
const PORT = readPositiveInteger("PORT", 8006);
const PRIMARY_WORKER_MAX_ACTIVE = readPositiveInteger(
  "PRIMARY_WORKER_MAX_ACTIVE",
  3
);
const STREAM_CACHE_TTL_MS = readPositiveInteger(
  "STREAM_CACHE_TTL_MS",
  1000 * 60 * 60 * 6
);
const STREAM_CACHE_MAX_ENTRIES = readPositiveInteger(
  "STREAM_CACHE_MAX_ENTRIES",
  500
);
const UPSTREAM_TIMEOUT_MS = readPositiveInteger("UPSTREAM_TIMEOUT_MS", 180000);
const ENABLE_DASHBOARD = parseBoolean(process.env.ENABLE_DASHBOARD, false);
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || "";
const CORS_ALLOW_ORIGINS = parseCsv(process.env.CORS_ALLOW_ORIGINS || "*");
const UPSTREAM_WORKERS = parseWorkers(
  process.env.UPSTREAM_WORKERS || "http://192.168.11.5:3005"
);
const WORKER_NAMES = parseWorkerNames(process.env.UPSTREAM_WORKER_NAMES);
const workerActiveCounts = new Map(UPSTREAM_WORKERS.map((worker) => [worker, 0]));
const streamCache = new Map();
const inflightStreams = new Map();

app.use((req, res, next) => {
  applySecurityHeaders(res);
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

function applySecurityHeaders(res) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
}

function applyCors(req, res) {
  const origin = req.get("Origin");

  if (CORS_ALLOW_ORIGINS.includes("*")) {
    res.set("Access-Control-Allow-Origin", "*");
  } else if (origin && CORS_ALLOW_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }

  res.set({
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
}

function readPositiveInteger(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadDotEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseWorkers(value) {
  const workers = String(value || "")
    .split(",")
    .map((worker) => worker.trim())
    .filter(Boolean)
    .map((worker) => {
      if (/^https?:\/\//i.test(worker)) return worker.replace(/\/+$/, "");
      return `http://${worker}`.replace(/\/+$/, "");
    });

  if (workers.length === 0) {
    throw new Error("UPSTREAM_WORKERS must contain at least one worker");
  }

  return workers;
}

function parseWorkerNames(value) {
  const names = String(value || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return UPSTREAM_WORKERS.map((worker, index) => names[index] || `Worker ${index + 1}`);
}

function getWorkerName(worker) {
  const index = UPSTREAM_WORKERS.indexOf(worker);
  return WORKER_NAMES[index] || `Worker ${index + 1}`;
}

function selectWorker() {
  const primaryWorker = UPSTREAM_WORKERS[0];
  const primaryActive = workerActiveCounts.get(primaryWorker) || 0;

  if (primaryActive < PRIMARY_WORKER_MAX_ACTIVE || UPSTREAM_WORKERS.length === 1) {
    return primaryWorker;
  }

  return UPSTREAM_WORKERS
    .slice(1)
    .reduce((selected, worker) => {
      const selectedActive = workerActiveCounts.get(selected) || 0;
      const workerActive = workerActiveCounts.get(worker) || 0;

      return workerActive < selectedActive ? worker : selected;
    }, UPSTREAM_WORKERS[1]);
}

async function withWorkerSlot(worker, task) {
  workerActiveCounts.set(worker, (workerActiveCounts.get(worker) || 0) + 1);

  try {
    return await task();
  } finally {
    workerActiveCounts.set(
      worker,
      Math.max(0, (workerActiveCounts.get(worker) || 1) - 1)
    );
  }
}

function getCachedStream(videoid) {
  const cached = streamCache.get(videoid);

  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    streamCache.delete(videoid);
    return null;
  }

  return cached.data;
}

function setCachedStream(videoid, data) {
  streamCache.set(videoid, {
    data,
    expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
  });

  while (streamCache.size > STREAM_CACHE_MAX_ENTRIES) {
    const oldestKey = streamCache.keys().next().value;
    if (!oldestKey) break;
    streamCache.delete(oldestKey);
  }
}

function getCacheEntries() {
  const now = Date.now();
  const entries = [];

  for (const [videoid, cached] of streamCache.entries()) {
    if (cached.expiresAt <= now) {
      streamCache.delete(videoid);
      continue;
    }

    entries.push({
      videoid,
      title: cached.data?.title || null,
      expiresAt: new Date(cached.expiresAt).toISOString(),
      remainingMs: cached.expiresAt - now,
    });
  }

  return entries.sort((a, b) => a.remainingMs - b.remainingMs);
}

function getStatusSnapshot() {
  const now = Date.now();
  const cacheEntries = getCacheEntries();
  const inflightEntries = Array.from(inflightStreams.entries()).map(
    ([videoid, item]) => ({
      videoid,
      workerName: getWorkerName(item.worker),
      startedAt: new Date(item.startedAt).toISOString(),
      ageMs: now - item.startedAt,
    })
  );

  return {
    generatedAt: new Date(now).toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    config: {
      port: PORT,
      primaryWorkerMaxActive: PRIMARY_WORKER_MAX_ACTIVE,
      streamCacheTtlMs: STREAM_CACHE_TTL_MS,
      workerNames: WORKER_NAMES,
    },
    workers: UPSTREAM_WORKERS.map((worker, index) => ({
      name: getWorkerName(worker),
      active: workerActiveCounts.get(worker) || 0,
      primary: index === 0,
    })),
    inflight: {
      count: inflightEntries.length,
      items: inflightEntries.sort((a, b) => b.ageMs - a.ageMs),
    },
    cache: {
      count: cacheEntries.length,
      items: cacheEntries,
    },
  };
}

function makeHttpError(status, body, publicBody = null) {
  const error = new Error(body?.error || publicBody?.error || "HTTP Error");
  error.status = status;
  error.body = body;
  error.publicBody = publicBody;
  return error;
}

function makePublicError(status, error, message) {
  return {
    status,
    body: {
      error,
      message,
    },
  };
}

function isValidVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(value || ""));
}

function getBearerToken(req) {
  const header = req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function requireDashboardAccess(req, res, next) {
  if (!ENABLE_DASHBOARD) {
    return res.status(404).json({ error: "Not Found" });
  }

  if (!DASHBOARD_TOKEN) return next();

  const token = getBearerToken(req) || String(req.query.token || "");

  if (token !== DASHBOARD_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

function logRequestError(videoid, err) {
  console.error("[stream-url error]", {
    videoid,
    status: err.status || 502,
    message: err.message,
  });
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isM3u8Like(url = "", format = {}) {
  const protocol = String(format.protocol || "").toLowerCase();
  const lowerUrl = String(url).toLowerCase();

  return (
    lowerUrl.includes(".m3u8") ||
    lowerUrl.includes("/manifest/hls") ||
    lowerUrl.includes("hls_playlist") ||
    lowerUrl.includes("hls_variant") ||
    protocol.includes("m3u8") ||
    protocol.includes("hls")
  );
}

function isProbablyImageOrStoryboard(url = "", format = {}) {
  const parsed = safeUrl(url);
  const pathname = parsed?.pathname?.toLowerCase() || "";
  const protocol = String(format.protocol || "").toLowerCase();
  const ext = String(format.ext || "").toLowerCase();
  const note = String(format.format_note || "").toLowerCase();

  return (
    protocol === "mhtml" ||
    ext === "mhtml" ||
    note.includes("storyboard") ||
    pathname.includes("/sb/") ||
    pathname.includes("storyboard") ||
    /\.(jpg|jpeg|png|webp|gif|mhtml)$/i.test(pathname)
  );
}

function parseXtags(url) {
  const parsed = safeUrl(url);
  const xtags = parsed?.searchParams?.get("xtags");

  if (!xtags) return {};

  return Object.fromEntries(
    xtags
      .split(":")
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, rest.join("=")];
      })
      .filter(([key]) => key)
  );
}

function getLanguageNameFromCode(code) {
  if (!code) return null;

  try {
    const displayNames = new Intl.DisplayNames(["ja"], {
      type: "language",
    });

    return displayNames.of(code) || null;
  } catch {
    return null;
  }
}

function parseLanguageNameFromNote(note) {
  if (!note) return null;

  const first = String(note).split(",")[0].trim();

  // 144p / 360p / low / medium などは言語ではない
  if (/^\d+p/i.test(first)) return null;
  if (/^(low|medium|high|storyboard)$/i.test(first)) return null;

  return first
    .replace(/\s+original\b/i, "")
    .replace(/\s*\((default|original|dubbed|dubbed-auto).*?\)/gi, "")
    .trim() || null;
}

function extractLanguage(format = {}, url = "") {
  const xtags = parseXtags(url);
  const note = format.format_note || "";

  const code =
    format.language ||
    xtags.lang ||
    null;

  const name =
    getLanguageNameFromCode(code) ||
    parseLanguageNameFromNote(note);

  const audioContent = xtags.acont || null;

  const isOriginal =
    audioContent === "original" ||
    /original/i.test(note);

  const isDubbed =
    audioContent?.includes("dubbed") ||
    /dubbed/i.test(note);

  const isAutoDubbed =
    audioContent === "dubbed-auto";

  const isDefault =
    /default/i.test(note) ||
    Number(format.language_preference || 0) > 0;

  const isDrc =
    xtags.drc === "1" ||
    /(^|,|\s)DRC($|,|\s)/i.test(note) ||
    String(format.format_id || "").includes("drc");

  return {
    code,
    name,
    audioContent,
    isOriginal,
    isDubbed,
    isAutoDubbed,
    isDefault,
    isDrc,
    preference: format.language_preference ?? null,
  };
}

function guessMediaType(format = {}, url = "") {
  if (isM3u8Like(url, format)) return "hls";

  const hasVideo = format.vcodec && format.vcodec !== "none";
  const hasAudio = format.acodec && format.acodec !== "none";

  if (hasVideo && hasAudio) return "muxed";
  if (hasVideo) return "video_only";
  if (hasAudio) return "audio_only";

  return "unknown";
}

function shouldSkipFormat(format = {}) {
  const url = format.url || format.manifest_url || "";

  if (!isHttpUrl(url)) return true;
  if (isProbablyImageOrStoryboard(url, format)) return true;

  const mediaType = guessMediaType(format, url);

  // 映像・音声・HLS ではないものは stream として扱わない
  if (mediaType === "unknown") return true;

  return false;
}

function pickStreamDetails(format = {}, streamUrl = "", sourceKey = "url") {
  const language = extractLanguage(format, streamUrl);
  const mediaType = guessMediaType(format, streamUrl);

  return {
    streamUrl,
    sourceKey,

    mediaType,
    isM3u8: isM3u8Like(streamUrl, format),

    language,

    formatId: format.format_id ?? null,
    format: format.format ?? null,
    formatNote: format.format_note ?? null,

    ext: format.ext ?? null,
    protocol: format.protocol ?? null,
    container: format.container ?? null,

    resolution: format.resolution ?? null,
    width: format.width ?? null,
    height: format.height ?? null,
    fps: format.fps ?? null,
    aspectRatio: format.aspect_ratio ?? null,

    vcodec: format.vcodec ?? null,
    acodec: format.acodec ?? null,
    videoExt: format.video_ext ?? null,
    audioExt: format.audio_ext ?? null,
    dynamicRange: format.dynamic_range ?? null,

    tbr: format.tbr ?? null,
    vbr: format.vbr ?? null,
    abr: format.abr ?? null,
    asr: format.asr ?? null,
    audioChannels: format.audio_channels ?? null,

    filesize: format.filesize ?? null,
    filesizeApprox: format.filesize_approx ?? null,
    duration: format.duration ?? null,

    hasDrm: format.has_drm ?? null,
    quality: format.quality ?? null,

    httpHeaders: format.http_headers ?? null,
  };
}

function getLanguageGroupKey(item) {
  if (item.language?.code) return item.language.code;
  if (item.language?.name) return item.language.name;

  // m3u8で言語コードが取れないが original 判定だけある場合
  if (item.language?.isOriginal) return "original";

  return "und";
}

function groupByLanguage(items) {
  const grouped = {};

  for (const item of items) {
    const key = getLanguageGroupKey(item);

    if (!grouped[key]) {
      grouped[key] = {
        language: item.language ?? {
          code: null,
          name: null,
        },
        streams: [],
      };
    }

    grouped[key].streams.push(item);
  }

  return grouped;
}

function normalizeSubtitleMap(subtitleMap, kind) {
  const result = {};

  if (!subtitleMap || typeof subtitleMap !== "object") {
    return result;
  }

  for (const [languageCode, entries] of Object.entries(subtitleMap)) {
    const list = Array.isArray(entries) ? entries : [entries];

    const captions = list
      .filter((entry) => isHttpUrl(entry?.url))
      .map((entry) => ({
        url: entry.url,
        kind, // manual / automatic
        language: {
          code: languageCode,
          name: getLanguageNameFromCode(languageCode),
        },
        ext: entry.ext ?? null,
        protocol: entry.protocol ?? null,
        name: entry.name ?? null,
        formatId: entry.format_id ?? null,
      }));

    if (captions.length > 0) {
      result[languageCode] = {
        language: {
          code: languageCode,
          name: getLanguageNameFromCode(languageCode),
        },
        captions,
      };
    }
  }

  return result;
}

function countCaptionGroups(groups) {
  return Object.values(groups).reduce((sum, group) => {
    return sum + group.captions.length;
  }, 0);
}

function collectFallbackStreamUrls(raw) {
  const result = [];
  const seen = new Set();

  function walk(value, path = []) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walk(item, [...path, String(index)]);
      });
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const lowerPath = [...path, key].join(".").toLowerCase();
      const lowerKey = key.toLowerCase();

      // formats は通常抽出で処理済み。fragments / subtitles / thumbnails は混ぜない
      if (
        lowerPath.includes("formats.") ||
        lowerPath.includes("fragments") ||
        lowerPath.includes("thumbnail") ||
        lowerPath.includes("subtitles") ||
        lowerPath.includes("automatic_captions") ||
        lowerPath.includes("requested_subtitles") ||
        lowerPath.includes("webpage") ||
        lowerPath.includes("channel")
      ) {
        continue;
      }

      if (isHttpUrl(child)) {
        const looksLikeStreamKey =
          lowerKey === "url" ||
          lowerKey === "streamurl" ||
          lowerKey.includes("stream") ||
          lowerKey.includes("manifest") ||
          lowerKey.includes("hls");

        if (!looksLikeStreamKey) continue;
        if (isProbablyImageOrStoryboard(child)) continue;
        if (seen.has(child)) continue;

        seen.add(child);

        result.push({
          streamUrl: child,
          sourceKey: key,
          sourcePath: [...path, key].join("."),
          mediaType: isM3u8Like(child) ? "hls" : "unknown",
          isM3u8: isM3u8Like(child),
          language: {
            code: null,
            name: null,
            audioContent: null,
            isOriginal: false,
            isDubbed: false,
            isAutoDubbed: false,
            isDefault: false,
            isDrc: false,
            preference: null,
          },
        });
      } else {
        walk(child, [...path, key]);
      }
    }
  }

  walk(raw);

  return result;
}

function normalizeYtDlpResponse(raw) {
  const root = raw?.data ?? raw ?? {};
  const formats = Array.isArray(root.formats) ? root.formats : [];

  const seen = new Set();

  const muxed = [];
  const videoOnly = [];
  const audioOnly = [];
  const m3u8 = [];

  function addStream(item) {
    if (!item?.streamUrl) return;

    const dedupeKey = [
      item.streamUrl,
      item.formatId,
      item.mediaType,
      item.language?.code,
      item.language?.audioContent,
      item.language?.isDrc,
    ].join("|");

    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    if (item.isM3u8) {
      m3u8.push(item);
      return;
    }

    if (item.mediaType === "muxed") {
      muxed.push(item);
      return;
    }

    if (item.mediaType === "video_only") {
      videoOnly.push(item);
      return;
    }

    if (item.mediaType === "audio_only") {
      audioOnly.push(item);
      return;
    }
  }

  for (const format of formats) {
    if (!format || shouldSkipFormat(format)) continue;

    if (isHttpUrl(format.url)) {
      addStream(pickStreamDetails(format, format.url, "url"));
    }

    if (isHttpUrl(format.manifest_url)) {
      addStream(pickStreamDetails(format, format.manifest_url, "manifest_url"));
    }
  }

  // formats がない/形が違うレスポンス向けの保険。
  // ただし subtitles / thumbnails / fragments / formats は拾わない。
  for (const fallback of collectFallbackStreamUrls(raw)) {
    if (fallback.mediaType === "hls") {
      addStream(fallback);
    }
  }

  const manualSubtitles = normalizeSubtitleMap(root.subtitles, "manual");
  const automaticCaptions = normalizeSubtitleMap(
    root.automatic_captions,
    "automatic"
  );

  const audioByLanguage = groupByLanguage(audioOnly);
  const m3u8ByLanguage = groupByLanguage(m3u8);

  return {
    id: root.id ?? raw?.id ?? null,
    title: root.title ?? raw?.title ?? null,

    hasM3u8: m3u8.length > 0,
    hasSubtitles: countCaptionGroups(manualSubtitles) > 0,
    hasAutomaticCaptions: countCaptionGroups(automaticCaptions) > 0,

    counts: {
      total:
        muxed.length +
        videoOnly.length +
        audioOnly.length +
        m3u8.length +
        countCaptionGroups(manualSubtitles) +
        countCaptionGroups(automaticCaptions),

      muxed: muxed.length,
      videoOnly: videoOnly.length,
      audioOnly: audioOnly.length,
      m3u8: m3u8.length,

      manualSubtitles: countCaptionGroups(manualSubtitles),
      automaticCaptions: countCaptionGroups(automaticCaptions),

      audioLanguages: Object.keys(audioByLanguage).length,
      m3u8Languages: Object.keys(m3u8ByLanguage).length,
      manualSubtitleLanguages: Object.keys(manualSubtitles).length,
      automaticCaptionLanguages: Object.keys(automaticCaptions).length,
    },

    streams: {
      // 映像+音声が1本になっているもの
      muxed,

      // 映像のみ
      videoOnly,

      // 音声のみ。言語別。
      audioByLanguage,
    },

    // HLS / m3u8 系は別枠
    m3u8: {
      list: m3u8,
      byLanguage: m3u8ByLanguage,
    },

    // 字幕は stream と混ぜない
    subtitles: {
      manualByLanguage: manualSubtitles,
      automaticByLanguage: automaticCaptions,
    },
  };
}

async function fetchStreamInfo(videoid, userAgent, worker) {
  const upstreamUrl = `${worker}/yt-dlp/${encodeURIComponent(videoid)}`;

  const { upstreamResponse, contentType, text } = await withWorkerSlot(
    worker,
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

      try {
        const upstreamResponse = await fetch(upstreamUrl, {
          method: "GET",
          headers: {
            "User-Agent": userAgent || "",
          },
          signal: controller.signal,
        });

        return {
          upstreamResponse,
          contentType: upstreamResponse.headers.get("content-type") || "",
          text: await upstreamResponse.text(),
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  );

  if (!upstreamResponse.ok) {
    throw makeHttpError(
      upstreamResponse.status,
      {
        error: "Upstream Error",
        status: upstreamResponse.status,
        body: text,
      },
      makePublicError(502, "Bad Gateway", "Upstream server returned an error").body
    );
  }

  let raw;

  try {
    raw = JSON.parse(text);
  } catch {
    throw makeHttpError(
      502,
      {
        error: "Invalid upstream response",
        message: "Upstream response is not JSON",
        contentType,
      },
      makePublicError(502, "Bad Gateway", "Invalid upstream response").body
    );
  }

  const normalized = normalizeYtDlpResponse(raw);
  setCachedStream(videoid, normalized);

  return normalized;
}

function renderDashboardPage() {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stream Worker Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #637083;
      --line: #d9dee7;
      --primary: #1463ff;
      --ok: #0f8a45;
      --warn: #b77900;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1 { margin: 0; font-size: 20px; }
    main { padding: 20px 24px 32px; max-width: 1280px; margin: 0 auto; }
    .updated { color: var(--muted); font-size: 13px; }
    .grid { display: grid; gap: 14px; }
    .summary { grid-template-columns: repeat(4, minmax(160px, 1fr)); margin-bottom: 18px; }
    .sections { grid-template-columns: 1fr 1fr; align-items: start; }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }
    .metric-label { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
    .metric-value { font-size: 30px; font-weight: 700; line-height: 1; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; background: #fafbfc; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 600; background: #eef3ff; color: var(--primary); }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .muted { color: var(--muted); }
    .error { color: #b00020; white-space: pre-wrap; }
    @media (max-width: 900px) {
      header { align-items: flex-start; flex-direction: column; }
      main { padding: 16px; }
      .summary, .sections { grid-template-columns: 1fr; }
      table { display: block; overflow-x: auto; white-space: nowrap; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Stream Worker Dashboard</h1>
    <div class="updated" id="updated">読み込み中</div>
  </header>
  <main>
    <section class="grid summary">
      <div class="card"><div class="metric-label">処理中ID</div><div class="metric-value" id="inflightCount">-</div></div>
      <div class="card"><div class="metric-label">キャッシュ個数</div><div class="metric-value" id="cacheCount">-</div></div>
      <div class="card"><div class="metric-label">Worker数</div><div class="metric-value" id="workerCount">-</div></div>
      <div class="card"><div class="metric-label">稼働時間</div><div class="metric-value" id="uptime">-</div></div>
    </section>
    <section class="grid sections">
      <div class="card">
        <h2>Workers</h2>
        <table><thead><tr><th>Worker</th><th>処理中</th><th>役割</th></tr></thead><tbody id="workers"></tbody></table>
      </div>
      <div class="card">
        <h2>処理中ID</h2>
        <table><thead><tr><th>Video ID</th><th>Worker</th><th>経過</th><th>開始</th></tr></thead><tbody id="inflight"></tbody></table>
      </div>
      <div class="card" style="grid-column: 1 / -1;">
        <h2>キャッシュ</h2>
        <table><thead><tr><th>Video ID</th><th>Title</th><th>残り</th><th>期限</th></tr></thead><tbody id="cache"></tbody></table>
      </div>
    </section>
    <p class="error" id="error"></p>
  </main>
  <script>
    const yen = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'medium' });

    function fmtDuration(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h) return h + 'h ' + m + 'm ' + s + 's';
      if (m) return m + 'm ' + s + 's';
      return s + 's';
    }

    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function rowOrEmpty(items, html) {
      if (!items.length) return '<tr><td colspan="4" class="muted">なし</td></tr>';
      return items.map(html).join('');
    }

    async function refresh() {
      try {
        const statusUrl = new URL('/api/stream/dashboard/status', window.location.origin);
        const token = new URLSearchParams(window.location.search).get('token');
        if (token) statusUrl.searchParams.set('token', token);
        const res = await fetch(statusUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('status ' + res.status);
        const data = await res.json();

        document.getElementById('error').textContent = '';
        document.getElementById('updated').textContent = '更新: ' + yen.format(new Date(data.generatedAt));
        document.getElementById('inflightCount').textContent = data.inflight.count;
        document.getElementById('cacheCount').textContent = data.cache.count;
        document.getElementById('workerCount').textContent = data.workers.length;
        document.getElementById('uptime').textContent = fmtDuration(data.uptimeSeconds * 1000);

        document.getElementById('workers').innerHTML = data.workers.map((w) =>
          '<tr>' +
            '<td><code>' + esc(w.name) + '</code></td>' +
            '<td class="' + (w.active ? 'warn' : 'ok') + '">' + w.active + '</td>' +
            '<td>' + (w.primary ? '<span class="pill">primary</span>' : '<span class="muted">overflow</span>') + '</td>' +
          '</tr>'
        ).join('');

        document.getElementById('inflight').innerHTML = rowOrEmpty(data.inflight.items, (item) =>
          '<tr>' +
            '<td><code>' + esc(item.videoid) + '</code></td>' +
            '<td><code>' + esc(item.workerName) + '</code></td>' +
            '<td>' + fmtDuration(item.ageMs) + '</td>' +
            '<td>' + yen.format(new Date(item.startedAt)) + '</td>' +
          '</tr>'
        );

        document.getElementById('cache').innerHTML = rowOrEmpty(data.cache.items, (item) =>
          '<tr>' +
            '<td><code>' + esc(item.videoid) + '</code></td>' +
            '<td>' + esc(item.title || '') + '</td>' +
            '<td>' + fmtDuration(item.remainingMs) + '</td>' +
            '<td>' + yen.format(new Date(item.expiresAt)) + '</td>' +
          '</tr>'
        );
      } catch (err) {
        document.getElementById('error').textContent = '取得に失敗しました: ' + err.message;
      }
    }

    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;
}

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/stream/dashboard/status", requireDashboardAccess, (req, res) => {
  res.json(getStatusSnapshot());
});

app.get("/api/stream/dashboard", requireDashboardAccess, (req, res) => {
  res.type("html").send(renderDashboardPage());
});

app.get("/api/stream/:videoid", async (req, res) => {
  const { videoid } = req.params;

  if (!isValidVideoId(videoid)) {
    return res.status(400).json({
      error: "Bad Request",
      message: "videoid must be an 11-character YouTube video ID",
    });
  }

  try {
    const cached = getCachedStream(videoid);

    if (cached) {
      res.set("X-Stream-Cache", "HIT");
      return res.status(200).json(cached);
    }

    const existingRequest = inflightStreams.get(videoid);

    if (existingRequest) {
      res.set("X-Stream-Cache", "INFLIGHT");
      return res.status(200).json(await existingRequest.promise);
    }

    const worker = selectWorker();
    const request = fetchStreamInfo(videoid, req.get("User-Agent"), worker);
    const inflightItem = {
      promise: request,
      worker,
      startedAt: Date.now(),
    };

    inflightStreams.set(videoid, inflightItem);

    try {
      const result = await request;
      res.set("X-Stream-Cache", "MISS");
      return res.status(200).json(result);
    } finally {
      if (inflightStreams.get(videoid) === inflightItem) {
        inflightStreams.delete(videoid);
      }
    }
  } catch (err) {
    logRequestError(videoid, err);

    if (err.name === "AbortError") {
      return res.status(504).json({
        error: "Gateway Timeout",
        message: "Upstream server request timed out",
      });
    }

    if (err.status && err.publicBody) {
      const status = err.status >= 400 && err.status < 500 ? err.status : 502;
      return res.status(status).json(err.publicBody);
    }

    return res.status(502).json({
      error: "Bad Gateway",
      message: "Upstream server request failed",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(PORT, HOST, () => {
  console.log(`Stream URL API listening on http://${HOST}:${PORT}`);
  console.log(`Dashboard ${ENABLE_DASHBOARD ? "enabled" : "disabled"}`);
});
