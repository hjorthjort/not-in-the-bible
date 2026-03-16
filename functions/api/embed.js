import { fetchSocialEmbed, SocialEmbedError } from "../../social-embed-service.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    status
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const postUrl = url.searchParams.get("url");

  if (!postUrl) {
    return json({ error: "Missing required url parameter." }, 400);
  }

  try {
    const payload = await fetchSocialEmbed(postUrl, {
      env: context.env,
      signal: context.request.signal
    });
    return json(payload);
  } catch (error) {
    if (error instanceof SocialEmbedError) {
      return json({ error: error.message }, error.status);
    }

    return json({ error: "Could not load that post." }, 500);
  }
}
