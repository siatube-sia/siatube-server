const DEFAULT_YOUTUBE_COOKIE =
  "YSC=oLDdox6ntXU; VISITOR_INFO1_LIVE=vl-pF9Agntg; VISITOR_PRIVACY_METADATA=CgJKUBIEGgAgNA%3D%3D; GPS=1; _gcl_au=1.1.726696622.1769344213; LOGIN_INFO=AFmmF2swRAIgJ_Xc6ChPqF8Pp820nSBJ4uUY3te4CPhrVdf94BZnbOACID2ihpqWuvsXha7h95mlT-YAqDMFju3NElSBEeCYYOf0:QUQ3MjNmeUgwbmZzb1l3bVkydEZvdXI4YmtDTzJJQ2R3MmR1czlEM3FtRG5hRFgxbzVIZkMwTzVmS0tvQkJwVWQ3ZU0ybUt4UW1oaVVfanRLRE9LQUgxeTJmZ1VPWkllNDIxclkzSkp6Q0xxM1h4d0xFV3cwRHlvcG4tSVZ5MmxYWk9YdGRKbE0zNkpuY2NJcWtPamFDYkYybWZEVDVpWENR; PREF=tz=Asia.Tokyo&f5=20000&f7=100; SID=g.a0007wgMH5YFxZNEQe049yD6pEFKKLel-E_2ZNxhfW2dE6YruO7-bwcEPtH3JNsmB7r1Y6-QRAACgYKARgSARQSFQHGX2MidCRxCCtTx2Imwx4j6RP1MhoVAUF8yKqI9mnpqj7e81Rr3g3qaGeU0076; __Secure-1PSID=g.a0007wgMH5YFxZNEQe049yD6pEFKKLel-E_2ZNxhfW2dE6YruO7-ZW0jqw9F6qTIzil9lW2xcQACgYKATUSARQSFQHGX2MiyVPiW_lzjxYGb_rZ8VXyxhoVAUF8yKqbiVcvWUCan0s-eNIVR2Lx0076; __Secure-3PSID=g.a0007wgMH5YFxZNEQe049yD6pEFKKLel-E_2ZNxhfW2dE6YruO7-2efRXwPiv4xai568FECqugACgYKAXsSARQSFQHGX2MiQ1vCeLjATbQq56sTAQraHRoVAUF8yKodd6cm5oQBNH6dxLWmKMsc0076; HSID=A4xbdR5t3wqRgbGAQ; SSID=Ak_NyHoQaPxuzRjCA; APISID=Mie2tJy2lp00rn-c/ArILhE9kMjGWQnC8E; SAPISID=u2DTg_71cgkt9FPc/AyB82aOFIdPErNuxr; __Secure-1PAPISID=u2DTg_71cgkt9FPc/AyB82aOFIdPErNuxr; __Secure-3PAPISID=u2DTg_71cgkt9FPc/AyB82aOFIdPErNuxr; __Secure-YNID=18.YT=DxmMfVFlIPzU15cN67wXGo8qgEPod5EqQ_fRK4ANU2ua4cbo7MzV9agLVSvNvKdPT55Lixihl3qf9E4ueibagAPXvybnf8xbFa6qpUXXsD_BzxpRVWfJYFX39h7gAqH2y0aWd4-F06XHkOu_E32HK9PvYKQdy1SiZ3p16w9rZreYyKIU3qcYAp6IHHD-xujGmBPoccHEHrUgqOBBPN3IW9MvpqQgDQdsfAI5iMOp6T9jWBRkS--6cf84frV7ksvSeatFCGawiBhiEoPIpIBgaSa193VnbD6DhwfOfT9ZuQUZjCoSnaRIzoGAtogxHWHR5_daYDtJDuvoDNl1oIAVyA; __Secure-ROLLOUT_TOKEN=CIS9rsXcxvmy_QEQ7s_d9ZjDlAMY7s_d9ZjDlAM%3D; __Secure-1PSIDTS=sidts-CjEBBj1CYsjA0ZtjO6PiejQ3DIA50cwW8TE2xPNKG8EWPl6LVMNz3AgZlM3Q5uAUyPe9EAA; __Secure-3PSIDTS=sidts-CjEBBj1CYsjA0ZtjO6PiejQ3DIA50cwW8TE2xPNKG8EWPl6LVMNz3AgZlM3Q5uAUyPe9EAA; ST-tladcw=session_logininfo=AFmmF2swRAIgJ_Xc6ChPqF8Pp820nSBJ4uUY3te4CPhrVdf94BZnbOACID2ihpqWuvsXha7h95mlT-YAqDMFju3NElSBEeCYYOf0%3AQUQ3MjNmeUgwbmZzb1l3bVkydEZvdXI4YmtDTzJJQ2R3MmR1czlEM3FtRG5hRFgxbzVIZkMwTzVmS0tvQkJwVWQ3ZU0ybUt4UW1oaVVfanRLRE9LQUgxeTJmZ1VPWkllNDIxclkzSkp6Q0xxM1h4d0xFV3cwRHlvcG4tSVZ5MmxYWk9YdGRKbE0zNkpuY2NJcWtPamFDYkYybWZEVDVpWENR; SIDCC=AKEyXzW_1CshoHehn7R-El47Qr6jD9D2kq9FzLtY0G85-XYrDzKR9LCT_QleNjarBQrcO3QMUvQ; __Secure-1PSIDCC=AKEyXzWRSdEitvGP0PdBz__ln1eSF8yLbp31xhPqodHM2WhaQlwVo_mXTdx8QQ1_xcsrf32vhv4; __Secure-3PSIDCC=AKEyXzWQbD4hyYA-0vbO6XHzrB2JvY9cuL-04hn4PEOC4yjNH89QfIH0bYmZC9u-b4EKt53WHA";

export const REQUEST_CLIENTS = {
  comment: {
    clientVersion: "2.20260515.01.00",
    visitorData:
      "CgttdjdpbEp3WWxZVSjn-qXQBjIKCgJKUBIEGgAgI2LfAgrcAjE4LllUPXR6V0pVZG05X2pIVW53ck9sZ3JEVzcwWDY3QV9Odm5XcENjcFA2aEZiMDNOZmJKSGRNbGdPNE5vTjNCanY2Tk5MYktMOThFbk9teF8xUDc2bFc2NUJzeEk4NXc3ODI0a3BGQ2VWa3BROUhucW5kc1g4Y2JNU2xfUk9CTlM0YU5sQkgzUS1WaDcxcjdLVFdmZy1sSGZ6bi03TG5wSk94cjVYWXUzVFY5T3RfdFFVSWxTTWloaTRmNG5tVXkxU05STFJtLVVYU3c5bXVuX2E0OUQ2YWRNYTB1RGdhRzdfcy0tdUlEcTF2YmNQZDAtNUtPT0lrRWJJc2hHLVYtenZlQ3pEekU1TlpVRm5rem9POEZLOWh1Y3pZNHVXWnU0aDkzRnpfUDZQTnhBeXo2ZzB3bEZWV0lOalNaTzNwZGh6QWg0X0g0cG41MDFHQW1ZU2hXUmtlVXFfQQ==",
    userAgent:
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    secChUa:
      '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    secChUaPlatform: '"Chrome OS"',
  },
  playlist: {
    clientVersion: "2.20260206.01.00",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="121", "Google Chrome";v="121", "Not A(Brand";v="99"',
    secChUaPlatform: '"Windows"',
  },
  search: {
    clientVersion: "2.20260428.07.00",
    userAgent:
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  },
  suggest: {
    userAgent: "Mozilla/5.0",
  },
  video: {
    clientVersion: "2.20240214.01.00",
    userAgent:
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    cookie: process.env.YOUTUBE_COOKIE || DEFAULT_YOUTUBE_COOKIE,
    headers: {
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language": "ja,en;q=0.9",
      "cache-control": "no-cache",
      "device-memory": "8",
      origin: "https://www.youtube.com",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: "https://www.youtube.com/",
      "sec-ch-dpr": "1",
      "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      "sec-ch-ua-arch": '"x86"',
      "sec-ch-ua-bitness": '"64"',
      "sec-ch-ua-form-factors": '"Desktop"',
      "sec-ch-ua-full-version": '"144.0.7559.221"',
      "sec-ch-ua-full-version-list":
        '"Not(A:Brand";v="8.0.0.0", "Chromium";v="144.0.7559.221", "Google Chrome";v="144.0.7559.221"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-model": '""',
      "sec-ch-ua-platform": '"Chrome OS"',
      "sec-ch-ua-platform-version": '"16503.76.0"',
      "sec-ch-ua-wow64": "?0",
      "sec-ch-viewport-width": "915",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-browser-channel": "stable",
      "x-browser-copyright": "Copyright 2026 Google LLC. All Rights reserved.",
      "x-browser-validation": "ZiXHB9YFjQ/cenQyml/9zpPvvIU=",
      "x-browser-year": "2026",
      "x-client-data":
        "CIm2yQEIo7bJAQipncoBCIztygEIlaHLAQiIoM0BCNajzwEI1a3PAQi7rs8BCMevzwEIya/PAQj6r88BCLSwzwEInrHPAQifs88BCIW0zwEY7IXPAQ==",
    },
  },
};

export function createPlaylistHeaders() {
  return {
    "Content-Type": "application/json",
    "User-Agent": REQUEST_CLIENTS.playlist.userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ja,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "sec-ch-ua": REQUEST_CLIENTS.playlist.secChUa,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": REQUEST_CLIENTS.playlist.secChUaPlatform,
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "x-youtube-client-name": "1",
    "x-youtube-client-version": REQUEST_CLIENTS.playlist.clientVersion,
    Origin: "https://www.youtube.com",
    Referer: "https://www.youtube.com/",
  };
}

export function createSearchHeaders(referer) {
  return {
    "content-type": "application/json",
    "x-youtube-client-name": "1",
    "x-youtube-client-version": REQUEST_CLIENTS.search.clientVersion,
    "user-agent": REQUEST_CLIENTS.search.userAgent,
    origin: "https://www.youtube.com",
    referer,
  };
}

export function createCommentHeaders(videoId, contentLength) {
  return {
    accept: "*/*",
    origin: "https://www.youtube.com",
    referer: `https://www.youtube.com/watch?v=${videoId}`,
    "user-agent": REQUEST_CLIENTS.comment.userAgent,
    "accept-language": "ja,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "content-encoding": "gzip",
    "content-type": "application/json",
    "content-length": contentLength,
    "x-youtube-client-name": "1",
    "x-youtube-client-version": REQUEST_CLIENTS.comment.clientVersion,
    "x-goog-visitor-id": REQUEST_CLIENTS.comment.visitorData,
    "x-youtube-bootstrap-logged-in": "false",
    "sec-ch-ua": REQUEST_CLIENTS.comment.secChUa,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": REQUEST_CLIENTS.comment.secChUaPlatform,
    pragma: "no-cache",
    "cache-control": "no-cache",
  };
}

export function createCommentContext() {
  return {
    client: {
      hl: "ja",
      gl: "JP",
      clientName: "WEB",
      clientVersion: REQUEST_CLIENTS.comment.clientVersion,
      platform: "DESKTOP",
      visitorData: REQUEST_CLIENTS.comment.visitorData,
    },
  };
}

export function createVideoRequestHeaders() {
  return {
    ...REQUEST_CLIENTS.video.headers,
    cookie: REQUEST_CLIENTS.video.cookie,
    "user-agent": REQUEST_CLIENTS.video.userAgent,
  };
}

export function createVideoClientContext() {
  return {
    client: {
      hl: "ja",
      gl: "JP",
      clientName: "WEB",
      clientVersion: REQUEST_CLIENTS.video.clientVersion,
      ua: REQUEST_CLIENTS.video.userAgent,
    },
  };
}

export function createGoogleSuggestHeaders() {
  return {
    "User-Agent": REQUEST_CLIENTS.suggest.userAgent,
  };
}
