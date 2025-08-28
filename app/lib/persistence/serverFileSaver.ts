// Auto-install service is server-side only, imported dynamically

export class ServerFileSaver {
  private static instance: ServerFileSaver;
  private isEnabled = false;
  private serverPath: string = '~/bolt-generated-code';
  private projectUuid: string;
  private pendingSaves = new Map<string, { content: string; timer: NodeJS.Timeout }>();
  // Auto-install hook moved to chat completion - not needed on individual file saves
  private maxRetries = 2;
  
  private constructor() {
    this.initFromEnv();
    // Generate a unique project UUID for this session
    this.projectUuid = this.generateUuid();
  }
  
  public static getInstance(): ServerFileSaver {
    if (!ServerFileSaver.instance) {
      ServerFileSaver.instance = new ServerFileSaver();
    }
    return ServerFileSaver.instance;
  }
  
  private initFromEnv() {
    // Read from environment variables - enable by default for Phase 1
    this.isEnabled = import.meta.env.VITE_SERVER_CODE_SAVE_ENABLED !== 'false';
    this.serverPath = import.meta.env.VITE_SERVER_CODE_SAVE_PATH || import.meta.env.SERVER_SAVE_BASE_PATH || '~/bolt-generated-code';
    
    if (this.isEnabled) {
      console.log('Server-side code saving enabled for path:', this.serverPath);
    } else {
      console.log('Server-side code saving disabled');
    }
  }
  
  async saveCodeToServer(filePath: string, content: string | Uint8Array, debounceMs: number = 200) {
    if (!this.isEnabled) return false;
    
    // Convert content to string if it's Uint8Array
    const contentString = content instanceof Uint8Array 
      ? new TextDecoder().decode(content)
      : content;
    
    // Clear any pending save for this file
    if (this.pendingSaves.has(filePath)) {
      clearTimeout(this.pendingSaves.get(filePath)!.timer);
    }
    
    // Set up debounced save
    const timer = setTimeout(async () => {
      this.pendingSaves.delete(filePath);
      await this._saveWithRetry(filePath, contentString, content instanceof Uint8Array);
    }, debounceMs);
    
    this.pendingSaves.set(filePath, { content: contentString, timer });
    return true;
  }
  
  private async _saveWithRetry(filePath: string, content: string, isBinary: boolean, retryCount: number = 0): Promise<boolean> {
    try {
      // Create server path with UUID subfolder
      const serverPathWithUuid = `${this.serverPath}/${this.projectUuid}`;
      
      // Send file to server via API endpoint
      const response = await fetch('/api/save-code-to-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          content,
          serverPath: serverPathWithUuid,
          timestamp: new Date().toISOString(),
          isBinary
        }),
      });
      
      if (response.ok) {
        const result = await response.json() as { serverPath: string };
        console.log(`Saved ${filePath} to server at ${result.serverPath}`);
        
        // Track this file as saved
        // Auto-install hook moved to chat completion - not needed on individual file saves
        
        return true;
      } else {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(`Server save failed: ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Server-side save failed (attempt ${retryCount + 1}):`, error);
      
      // Retry with exponential backoff
      if (retryCount < this.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._saveWithRetry(filePath, content, isBinary, retryCount + 1);
      }
      
      return false;
    }
  }
  
  isServerSavingEnabled() {
    return this.isEnabled;
  }
  
  getServerPath() {
    return this.serverPath;
  }
  
  getProjectUuid() {
    return this.projectUuid;
  }
  
  isServerOnlyMode(): boolean {
    return import.meta.env.VITE_SERVER_ONLY_STORAGE === 'true';
  }
  
  // Method to check if the feature is properly configured
  getStatus() {
    return {
      enabled: this.isEnabled,
      serverPath: this.serverPath,
      projectUuid: this.projectUuid,
      serverOnlyMode: this.isServerOnlyMode(),
      configured: this.isEnabled && !!this.serverPath
    };
  }
  
  // Generate a simple UUID for project isolation
  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Auto-install hook moved to chat completion - not needed on individual file saves
}
