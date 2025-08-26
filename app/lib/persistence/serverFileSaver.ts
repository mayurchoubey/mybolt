export class ServerFileSaver {
  private isEnabled = false;
  private serverPath: string = './generated-code';
  
  constructor() {
    this.initFromEnv();
  }
  
  private initFromEnv() {
    // Read from environment variables
    this.isEnabled = import.meta.env.VITE_SERVER_CODE_SAVE_ENABLED === 'true';
    this.serverPath = import.meta.env.VITE_SERVER_CODE_SAVE_PATH || './generated-code';
    
    if (this.isEnabled) {
      console.log('Server-side code saving enabled for path:', this.serverPath);
    } else {
      console.log('Server-side code saving disabled');
    }
  }
  
  async saveCodeToServer(filePath: string, content: string | Uint8Array) {
    if (!this.isEnabled) return false;
    
    try {
      // Convert content to string if it's Uint8Array
      const contentString = content instanceof Uint8Array 
        ? new TextDecoder().decode(content)
        : content;
      
      // Send file to server via API endpoint
      const response = await fetch('/api/save-code-to-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          content: contentString,
          serverPath: this.serverPath,
          timestamp: new Date().toISOString(),
          isBinary: content instanceof Uint8Array
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
      console.error('Server-side save failed:', error);
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
      configured: this.isEnabled && this.serverPath !== './generated-code'
    };
  }
}
