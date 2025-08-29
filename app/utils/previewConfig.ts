/**
 * Preview configuration utilities for handling local development vs public hosting
 */

/**
 * Get the base URL for preview functionality
 * Priority: Environment variable > Browser location > Fallback to localhost
 */
export function getPreviewBaseUrl(): string {
  // Check environment variable first (for server-side)
  if (typeof process !== 'undefined' && process.env) {
    const envBaseUrl = process.env.PREVIEW_BASE_URL || process.env.PUBLIC_BASE_URL;
    if (envBaseUrl) {
      return envBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    }
  }
  
  // Check browser location (for client-side)
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port } = window.location;
    // Only use browser location if it's not localhost (i.e., public domain)
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const baseUrl = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
      return baseUrl;
    }
  }
  
  // Fallback to localhost for local development
  return 'http://localhost';
}

/**
 * Check if running in public hosting environment
 */
export function isPublicHosting(): boolean {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
  }
  return false;
}

/**
 * Get the appropriate host binding for dev servers
 */
export function getDevServerHost(): string {
  // Always bind to 0.0.0.0 for public hosting compatibility
  return '0.0.0.0';
}

/**
 * Preview configuration object
 */
export const previewConfig = {
  getBaseUrl: getPreviewBaseUrl,
  isPublicHosting,
  getDevServerHost,
  // Default ports range
  portRange: {
    min: 3001,
    max: 4999
  }
};
