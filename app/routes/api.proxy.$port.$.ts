import type { LoaderFunctionArgs } from '@remix-run/node';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { port, ...rest } = params;
  
  // Get base URL from environment variable or fallback to localhost for local development
  const getBaseUrl = () => {
    // Check environment variable first
    const envBaseUrl = process.env.PREVIEW_BASE_URL || process.env.PUBLIC_BASE_URL;
    if (envBaseUrl) {
      return envBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    }
    
    // Fallback to localhost for local development
    return 'http://localhost';
  };
  
  const baseUrl = getBaseUrl();
  const targetUrl = `${baseUrl}:${port}/${rest['*'] || ''}`;
  
  try {
    // Forward the request with original headers
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'Accept': request.headers.get('Accept') || '*/*',
        'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
        'Cache-Control': request.headers.get('Cache-Control') || 'no-cache',
      }
    });
    
    // Get the content type from the original response
    const contentType = response.headers.get('Content-Type') || 'text/plain';
    let content = await response.text();
    
    // Debug logging
    console.log('🔍 Proxy Debug:', {
      baseUrl,
      targetUrl,
      contentType,
      contentLength: content.length,
      first100Chars: content.substring(0, 100)
    });

    // If it's HTML, rewrite relative URLs to go through the proxy (only for document HTML)
    if (contentType.includes('text/html') && (targetUrl.endsWith('/') || targetUrl.endsWith('.html'))) {
      console.log('🔍 Rewriting HTML URLs for port:', port);
      
      // Rewrite src="/..." and href="/..." to use proxy
      const beforeContent = content;
      content = content.replace(/(src|href)="\/([^"]+)"/g, `$1="/api/proxy/${port}/$2"`);
      
      // Rewrite import statements like from "/@react-refresh"
      content = content.replace(/(from\s+["'])\/([^"']+)["']/g, `$1/api/proxy/${port}/$2"`);
      
      console.log('🔍 URL rewriting complete. Changes made:', {
        before: beforeContent.substring(0, 200),
        after: content.substring(0, 200)
      });
    }

    // If it's JavaScript, rewrite bare-leading-slash import specifiers to go through proxy
    if (contentType.includes('javascript')) {
      const beforeJs = content;
      // import "..."
      content = content.replace(/(import\s+["'])\/([^"']+)["']/g, `$1/api/proxy/${port}/$2"`);
      // from "..."
      content = content.replace(/(from\s+["'])\/([^"']+)["']/g, `$1/api/proxy/${port}/$2"`);
      // dynamic import("/...")
      content = content.replace(/(import\()\s*["']\/([^"']+)["']\s*(\))/g, `$1"/api/proxy/${port}/$2"$3`);
      if (beforeJs !== content) {
        console.log('🔍 JS import specifiers rewritten for port:', port);
      }
    }

    // If it's CSS, rewrite url(/...) to go through proxy
    if (contentType.includes('text/css')) {
      const beforeCss = content;
      content = content.replace(/url\(\/(?!data:)([^)]+)\)/g, `url(/api/proxy/${port}/$1)`);
      if (beforeCss !== content) {
        console.log('🔍 CSS asset URLs rewritten for port:', port);
      }
    }
    
    return new Response(content, {
      headers: {
        'Content-Type': contentType,
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Proxy Error: Unable to fetch from generated app', { 
      status: 500,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}
