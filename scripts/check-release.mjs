const origin = "https://gain-music-club.vercel.app";
try {
  const response = await fetch(origin, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (response.status !== 200) throw new Error("HTTP " + response.status);
  const expected = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (response.headers.get(key) !== value)
      throw new Error("Missing or unexpected header: " + key);
  }

  console.log(
    JSON.stringify({
      healthy: true,
      origin,
      status: response.status,
      finalUrl: response.url,
      securityHeaders: "verified",
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
