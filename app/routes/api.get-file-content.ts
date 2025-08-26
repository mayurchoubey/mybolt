import { json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.get-file-content');

interface FileContent {
  path: string;
  content: string;
  isBinary: boolean;
  size: number;
  lastModified: string;
}

export async function loader({ request }: { request: Request }) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const filePath = url.searchParams.get('filePath');

    // Validate required parameters
    if (!projectId) {
      return json(
        { success: false, error: 'Missing required parameter: projectId' },
        { status: 400 }
      );
    }

    if (!filePath) {
      return json(
        { success: false, error: 'Missing required parameter: filePath' },
        { status: 400 }
      );
    }

    // Basic UUID validation (simple format check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return json(
        { success: false, error: 'Invalid projectId format' },
        { status: 400 }
      );
    }

    // Security: Prevent directory traversal
    if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('\\')) {
      logger.error('Path traversal attempt detected in filePath:', filePath);
      return json(
        { success: false, error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Check if we're in a Node environment (filesystem available)
    const isNode = typeof process !== 'undefined' && !!(process as any).versions?.node;
    if (!isNode) {
      logger.warn('Server-side filesystem not available in this runtime.');
      return json(
        { success: false, error: 'Filesystem not available in this runtime' },
        { status: 501 }
      );
    }

    // Dynamically import Node modules to avoid bundling issues on non-Node targets
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');

    // Resolve the project directory and file paths
    const homeDir = os.homedir();
    const projectDir = path.join(homeDir, 'bolt-generated-code', projectId);
    const fullFilePath = path.join(projectDir, filePath);

    // Security: Ensure the file path is within the allowed project directory
    const resolvedProjectDir = path.resolve(projectDir);
    const resolvedFilePath = path.resolve(fullFilePath);
    const allowedRoot = path.resolve(path.join(homeDir, 'bolt-generated-code'));
    
    if (!resolvedProjectDir.startsWith(allowedRoot) || !resolvedFilePath.startsWith(resolvedProjectDir)) {
      logger.error('Path traversal attempt detected');
      return json(
        { success: false, error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Check if project directory exists
    try {
      await fs.access(projectDir);
    } catch (error) {
      return json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check if file exists
    try {
      await fs.access(resolvedFilePath);
    } catch (error) {
      return json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Get file stats
    const stats = await fs.stat(resolvedFilePath);
    
    // Check if it's actually a file
    if (!stats.isFile()) {
      return json(
        { success: false, error: 'Path is not a file' },
        { status: 400 }
      );
    }

    // Determine if file is binary
    const isBinary = isBinaryFile(filePath, stats.size);

    // Read file content
    let content: string;
    
    if (isBinary) {
      // For binary files, read as buffer and convert to base64
      const buffer = await fs.readFile(resolvedFilePath);
      content = buffer.toString('base64');
    } else {
      // For text files, read as UTF-8 string
      content = await fs.readFile(resolvedFilePath, 'utf-8');
    }

    logger.info(`Retrieved file content for ${filePath} in project ${projectId}`);

    return json({
      success: true,
      projectId,
      file: {
        path: filePath,
        content,
        isBinary,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      },
    });

  } catch (error) {
    logger.error('Failed to get file content:', error);

    return json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Simple binary file detection based on extension and size
function isBinaryFile(filename: string, size: number): boolean {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
    '.db', '.sqlite', '.bin'
  ];
  
  // Simple extension extraction without path module
  const lastDotIndex = filename.lastIndexOf('.');
  const ext = lastDotIndex !== -1 ? filename.slice(lastDotIndex).toLowerCase() : '';
  
  // If it's a known binary extension, it's binary
  if (binaryExtensions.includes(ext)) {
    return true;
  }
  
  // If file is very large (>1MB), assume it's binary
  if (size > 1024 * 1024) {
    return true;
  }
  
  return false;
}
