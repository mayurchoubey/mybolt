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
    const { filePath, content, serverPath, timestamp, isBinary } = (await request.json()) as SaveCodeRequest;

    logger.debug('Saving code to server:', {
      filePath,
      serverPath,
      timestamp,
      isBinary,
      contentLength: content?.length || 0,
    });

    // Validate input
    if (!filePath || !content || !serverPath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: filePath, content, or serverPath' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Security: Prevent directory traversal attacks
    const sanitizedPath = filePath.replace(/\.\./g, '').replace(/^\//, '');
    if (sanitizedPath !== filePath.replace(/^\//, '')) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid file path detected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if we're in a Node environment (filesystem available)
    const isNode = typeof process !== 'undefined' && !!(process as any).versions?.node;
    if (!isNode) {
      // Not supported on non-Node runtimes (e.g., Cloudflare Workers)
      logger.warn('Server-side filesystem not available in this runtime.');
      return new Response(JSON.stringify({ success: false, error: 'Filesystem not available in this runtime' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Dynamically import Node modules to avoid bundling issues on non-Node targets
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');

    // Expand '~' to HOME directory
    const homeDir = os.homedir();
    const basePath = serverPath.startsWith('~/') || serverPath === '~' ? serverPath.replace(/^~(?=$|\/)/, homeDir) : serverPath;

    // Resolve absolute base directory and target file path
    const fullBaseDir = path.resolve(basePath);
    const targetFilePath = path.join(fullBaseDir, sanitizedPath);
    const targetDir = path.dirname(targetFilePath);

    // Ensure directories exist
    await fs.mkdir(targetDir, { recursive: true });

    // Write file (always UTF-8 string as sent by client)
    await fs.writeFile(targetFilePath, content, 'utf8');

    logger.info(`Saved ${sanitizedPath} to ${targetFilePath}`);

    // Return success response
    return new Response(
      JSON.stringify({ success: true, serverPath: targetFilePath, filePath: sanitizedPath, timestamp, isBinary }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    logger.error('Failed to save code to server:', error);

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
