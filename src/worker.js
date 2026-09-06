const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env);
    }

    // Everything else is a static asset (index.html, guide pages, etc).
    return env.ASSETS.fetch(request);
  },
};

async function handleSubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ ok: false, error: "invalid_body" }, 400);
  }

  const email = String(body?.email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return jsonResponse({ ok: false, error: "invalid_email" }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return jsonResponse({ ok: false, error: "server_not_configured" }, 500);
  }

  const resendRes = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  // Resend treats re-adding an existing contact as a conflict; from the
  // visitor's point of view "already on the list" is still success.
  if (resendRes.ok || resendRes.status === 409) {
    return jsonResponse({ ok: true });
  }

  const detail = await resendRes.text().catch(() => "");
  console.error("Resend contact creation failed", resendRes.status, detail);
  return jsonResponse({ ok: false, error: "resend_error" }, 502);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
