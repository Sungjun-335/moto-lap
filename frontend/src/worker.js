export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Try to get the asset from Cloudflare Assets
        let response = await env.ASSETS.fetch(request);

        // If the asset is not found (404), and it's a page navigation (GET),
        // serve index.html to support SPA client-side routing.
        if (response.status === 404 && request.method === "GET") {
            // Simple heuristic: if it doesn't have a file extension, it's likely a route
            if (!url.pathname.includes(".")) {
                // Fetch index.html
                const indexRequest = new Request(new URL("/", request.url), request);
                response = await env.ASSETS.fetch(indexRequest);
            }
        }

        // Prevent caching of HTML (so new deploys are picked up immediately)
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
            const newHeaders = new Headers(response.headers);
            newHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
            return new Response(response.body, {
                status: response.status,
                headers: newHeaders,
            });
        }

        return response;
    },
};
