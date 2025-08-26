import { json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.list-files');

interface FileMetadata {
  path: string;
  size: number;
  isBinary: boolean;
  lastModified: string;
}

export async function loader({ request }: { request: Request }) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    // Validate projectId
    if (!projectId) {
      return json(
        { success: false, error: 'Missing required parameter: projectId' },
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

    // Resolve the project directory path
    const homeDir = os.homedir();
    const basePath = path.join(homeDir, 'bolt-generated-code', projectId);

    // Security: Ensure the path is within the allowed directory
    const resolvedPath = path.resolve(basePath);
    const allowedRoot = path.resolve(path.join(homeDir, 'bolt-generated-code'));
    
    if (!resolvedPath.startsWith(allowedRoot)) {
      logger.error('Path traversal attempt detected');
      return json(
        { success: false, error: 'Invalid project path' },
        { status: 400 }
      );
    }

    // Check if project directory exists
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      return json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Recursively walk the directory to collect file metadata
    const files: FileMetadata[] = [];
    
    async function walkDirectory(dirPath: string, relativePath: string = '') {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip common directories that shouldn't be included
          if (['node_modules', '.git', 'dist', 'build', 'out', '.next'].includes(entry.name)) {
            continue;
          }
          await walkDirectory(fullPath, entryRelativePath);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(fullPath);
            
            // Determine if file is binary by checking file extension and size
            const isBinary = isBinaryFile(entry.name, stats.size);
            
            files.push({
              path: entryRelativePath,
              size: stats.size,
              isBinary,
              lastModified: stats.mtime.toISOString(),
            });
          } catch (error) {
            logger.warn(`Failed to read file ${entryRelativePath}:`, error);
            // Continue with other files
          }
        }
      }
    }

    await walkDirectory(resolvedPath);

    // Sort files by path for consistent ordering
    files.sort((a, b) => a.path.localeCompare(b.path));

    logger.info(`Listed ${files.length} files for project ${projectId}`);

    return json({
      success: true,
      projectId,
      files,
      totalFiles: files.length,
    });

  } catch (error) {
    logger.error('Failed to list files:', error);

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
