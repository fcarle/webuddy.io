import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';

// Basic XML parser using regex
function parseSitemap(sitemapContent: string): string[] {
    const urls: string[] = [];
    const locRegex = /<loc>(.*?)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(sitemapContent)) !== null) {
        urls.push(match[1]);
    }
    return urls;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { websiteUrl } = await req.json();
        if (!websiteUrl) {
            throw new Error('websiteUrl is required.');
        }

        let pages = new Set<string>();

        // 1. Try to fetch and parse sitemap.xml
        try {
            const sitemapUrl = new URL('/sitemap.xml', websiteUrl).href;
            const sitemapResponse = await fetch(sitemapUrl);
            if (sitemapResponse.ok) {
                const sitemapText = await sitemapResponse.text();
                const sitemapUrls = parseSitemap(sitemapText);
                sitemapUrls.forEach(url => pages.add(url));
            }
        } catch (e) {
            console.error("Sitemap fetch/parse error:", e.message);
        }

        // 2. If sitemap is empty or failed, crawl the main page for links
        if (pages.size === 0) {
            const response = await fetch(websiteUrl);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            if (doc) {
                const links = doc.querySelectorAll('a');
                const baseUrl = new URL(websiteUrl);

                links.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href) {
                        try {
                            const absoluteUrl = new URL(href, baseUrl.href).href;
                            // Add only URLs that are on the same domain
                            if (new URL(absoluteUrl).hostname === baseUrl.hostname) {
                                pages.add(absoluteUrl.split('#')[0]); // Add URL without fragment
                            }
                        } catch (e) {
                            // Ignore invalid URLs
                        }
                    }
                });
            }
             // Always include the base URL itself
            pages.add(websiteUrl);
        }

        const uniquePages = Array.from(pages);

        return new Response(JSON.stringify({ pages: uniquePages }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
}); 