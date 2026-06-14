import express from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import pLimit from "p-limit";
import { LRUCache } from "lru-cache";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const app = express();
const PORT = 3015;

const YT_DLP_PATH = "yt-dlp";

const YT_DLP_TIMEOUT = 180_000;

// 並列数

const limit = pLimit(5);

// yt-dlp internal cache

const YT_CACHE_DIR = "/tmp/yt-dlp-cache";

// cookie file

const COOKIE_FILE = path.join(
  os.homedir(),
  "youtube",
  "cookie.txt"
);

// video cache

const videoCache = new LRUCache({
  max: 2000,
  ttl: 1000 * 60 * 60 * 6,
});

// in-flight dedupe

const inflight = new Map();

// 統計

const stats = {
  cacheHits: 0,
  cacheMiss: 0,
  inflightHits: 0,
  ytDlpCalls: 0,
};

function getExpireMs(info) {
  const now = Date.now();

  const formats = info.formats || [];

  let minExpire = Infinity;

  for (const f of formats) {
    if (!f.url) continue;

    try {
      const u = new URL(f.url);

      const expire = Number(
        u.searchParams.get("expire")
      );

      if (!expire) continue;

      const ms = expire * 1000;

      if (ms < minExpire) {
        minExpire = ms;
      }
    } catch {}
  }

  if (minExpire !== Infinity) {
    return minExpire - 60_000;
  }

  return now + 1000 * 60 * 30;
}

// yt-dlp 実行

async function runYtDlp(url) {
  stats.ytDlpCalls++;

  const start = performance.now();

  const args = [
    "--cookies",
    COOKIE_FILE,

    "--cache-dir",
    YT_CACHE_DIR,

    "--js-runtimes",
    "node",

    "--no-progress",
    "--skip-download",
    "--no-warnings",

    "-J",
    "--all-formats",

    url,
  ];

  try {
    const { stdout, stderr } =
      await execFileAsync(
        YT_DLP_PATH,
        args,
        {
          timeout: YT_DLP_TIMEOUT,
          maxBuffer: 1024 * 1024 * 64,
        }
      );

    if (stderr?.trim()) {
      console.log(
        `[yt-dlp stderr] ${stderr}`
      );
    }

    const jsonParseStart = performance.now();

    const info = JSON.parse(stdout);

    const end = performance.now();

    console.log(
      `[yt-dlp] total=${(
        end - start
      ).toFixed(1)}ms parse=${(
        end - jsonParseStart
      ).toFixed(1)}ms`
    );

    return info;
  } catch (err) {
    console.error("[yt-dlp fail]", {
      message: err.message,
      stderr: err.stderr,
      stdout: err.stdout,
    });

    throw err;
  }
}

function getCached(videoId) {
  const cached = videoCache.get(videoId);

  if (!cached) return null;

  if (cached.expire < Date.now()) {
    videoCache.delete(videoId);
    return null;
  }

  stats.cacheHits++;

  return cached.data;
}

function setCache(videoId, data) {
  const expire = getExpireMs(data);

  videoCache.set(videoId, {
    data,
    expire,
  });
}

// メイン取得

async function getVideoInfo(videoId) {

  const cached = getCached(videoId);

  if (cached) {
    return {
      source: "memory-cache",
      data: cached,
    };
  }

  stats.cacheMiss++;

 if (inflight.has(videoId)) {
    stats.inflightHits++;

    return {
      source: "inflight",
      data: await inflight.get(videoId),
    };
  }

  const promise = limit(async () => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const info = await runYtDlp(url);

    setCache(videoId, info);

    return info;
  });

  inflight.set(videoId, promise);

  try {
    const data = await promise;

    return {
      source: "yt-dlp",
      data,
    };
  } finally {
    inflight.delete(videoId);
  }
}

app.get(
  "/yt-dlp/:videoId",
  async (req, res) => {
    const start = performance.now();

    const { videoId } = req.params;

    if (
      !/^[a-zA-Z0-9_-]{11}$/.test(videoId)
    ) {
      return res.status(400).json({
        detail: "invalid video id",
      });
    }

    try {
      const result =
        await getVideoInfo(videoId);

      const end = performance.now();

      console.log(
        `[OK] ${videoId} source=${
          result.source
        } ${(
          end - start
        ).toFixed(1)}ms`
      );

      res.json({
        cached:
          result.source !== "yt-dlp",

        source: result.source,

        stats,

        data: result.data,
      });
    } catch (err) {
      const end = performance.now();

      console.log(
        `[ERR] ${videoId} ${(
          end - start
        ).toFixed(1)}ms ${err.message}`
      );

      if (
        err.killed ||
        err.signal === "SIGTERM"
      ) {
        return res.status(504).json({
          detail: "yt-dlp timeout",
        });
      }

      if (err.stderr) {
        return res.status(500).json({
          detail: err.stderr,
        });
      }

      return res.status(500).json({
        detail: err.message,
      });
    }
  }
);

app.get("/stats", (req, res) => {
  res.json({
    stats,
    videoCacheSize: videoCache.size,
    inflightSize: inflight.size,
    cookieFile: COOKIE_FILE,
  });
});

setInterval(() => {
  videoCache.purgeStale();

  console.log(
    `[CACHE] size=${videoCache.size} inflight=${inflight.size}`
  );
}, 60_000);

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );

  console.log(
    `Using cookie file: ${COOKIE_FILE}`
  );
});
