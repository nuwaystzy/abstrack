export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("u");
    if (!username) return new Response("missing", { status: 400 });
  
    try {
      const res = await fetch(`https://unavatar.io/twitter/${username}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      if (!res.ok) return new Response("not found", { status: 404 });
  
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || "image/jpeg";
  
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return new Response("error", { status: 500 });
    }
  }