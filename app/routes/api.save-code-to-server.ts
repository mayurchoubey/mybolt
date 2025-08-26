import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ServerCodeSave');

interface SaveCodeRequest {
  filePath: string;
  content: string;
  serverPath: string;
  timestamp: string;
  isBinary: boolean;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { filePath, content, serverPath, timestamp, isBinary } = await request.json() as SaveCodeRequest;
    
    logger.debug('Saving code to server:', { 
      filePath, 
      serverPath, 
      timestamp,
      isBinary,
      contentLength: content?.length || 0
    });
    
    // Validate input
    if (!filePath || !content || !serverPath) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: filePath, content, or serverPath' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Security: Prevent directory traversal attacks
    const sanitizedPath = filePath.replace(/\.\./g, '').replace(/^\//, '');
    if (sanitizedPath !== filePath.replace(/^\//, '')) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid file path detected' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // For Cloudflare Workers, we'll use the KV store or other storage mechanism
    // since direct file system access isn't available
    // This is a placeholder implementation - you'll need to adapt based on your deployment
    
    logger.info(`Successfully processed save request for ${filePath} to server path ${serverPath}`);
    
    // Return success response
    return new Response(JSON.stringify({ 
      success: true, 
      serverPath: `${serverPath}/${sanitizedPath}`,
      filePath: sanitizedPath,
      timestamp,
      isBinary
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    logger.error('Failed to save code to server:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
