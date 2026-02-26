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
                return await env.ASSETS.fetch(indexRequest);
            }
        }

        return response;
    },
};
