export class ServerFileSaver {
  private isEnabled = false;
  private serverPath: string = '~/bolt-generated-code';
  private pendingSaves = new Map<string, { content: string; timer: NodeJS.Timeout }>();
  private maxRetries = 2;
  
  constructor() {
    this.initFromEnv();
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
      // Send file to server via API endpoint
      const response = await fetch('/api/save-code-to-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          content,
          serverPath: this.serverPath,
          timestamp: new Date().toISOString(),
          isBinary
        }),
      });
      
      if (response.ok) {
        const result = await response.json() as { serverPath: string };
        console.log(`Saved ${filePath} to server at ${result.serverPath}`);
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
  
  // Method to check if the feature is properly configured
  getStatus() {
    return {
      enabled: this.isEnabled,
      serverPath: this.serverPath,
      configured: this.isEnabled && !!this.serverPath
    };
  }
}
