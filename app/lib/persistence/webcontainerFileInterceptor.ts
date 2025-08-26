import type { WebContainer } from '@webcontainer/api';
import { ServerFileSaver } from './serverFileSaver';

export class WebContainerFileInterceptor {
  private webcontainer: WebContainer;
  private serverSaver: ServerFileSaver;
  private originalFs: any;

  constructor(webcontainer: WebContainer) {
    this.webcontainer = webcontainer;
    this.serverSaver = new ServerFileSaver();
    this.interceptFileOperations();
  }

  private interceptFileOperations() {
    // Store original file system methods
    this.originalFs = {
      writeFile: this.webcontainer.fs.writeFile.bind(this.webcontainer.fs),
      mkdir: this.webcontainer.fs.mkdir.bind(this.webcontainer.fs),
      rm: this.webcontainer.fs.rm.bind(this.webcontainer.fs),
    };

    // Intercept writeFile
    this.webcontainer.fs.writeFile = async (path: string, content: string | Uint8Array, options?: any) => {
      try {
        // Call original method first
        const result = await this.originalFs.writeFile(path, content, options);
        
        // Then save to server in parallel (non-blocking)
        if (this.serverSaver.isServerSavingEnabled()) {
          this.saveToServer(path, content).catch(error => {
            console.warn('Parallel server save failed (writeFile):', error);
          });
        }
        
        return result;
      } catch (error) {
        throw error;
      }
    };

    // Intercept mkdir (for tracking directory creation)
    this.webcontainer.fs.mkdir = async (path: string, options?: any) => {
      try {
        const result = await this.originalFs.mkdir(path, options);
        
        // Log directory creation for debugging
        if (this.serverSaver.isServerSavingEnabled()) {
          console.log(`Directory created: ${path}`);
        }
        
        return result;
      } catch (error) {
        throw error;
      }
    };

    // Intercept rm (for tracking file deletion)
    this.webcontainer.fs.rm = async (path: string, options?: any) => {
      try {
        const result = await this.originalFs.rm(path, options);
        
        // Log file deletion for debugging
        if (this.serverSaver.isServerSavingEnabled()) {
          console.log(`File/directory removed: ${path}`);
        }
        
        return result;
      } catch (error) {
        throw error;
      }
    };
  }

  private async saveToServer(path: string, content: string | Uint8Array) {
    try {
      // Convert path to absolute path if needed
      const absolutePath = path.startsWith('/') ? path : `/${path}`;
      
      // Save to server
      await this.serverSaver.saveCodeToServer(absolutePath, content);
      console.log(`Intercepted and saved: ${absolutePath}`);
    } catch (error) {
      console.error('Failed to save intercepted file:', error);
    }
  }

  // Method to check if interception is active
  isInterceptionActive() {
    return this.webcontainer.fs.writeFile !== this.originalFs.writeFile;
  }

  // Method to get server save status
  getServerSaveStatus() {
    return this.serverSaver.getStatus();
  }
}
