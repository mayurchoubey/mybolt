import { createScopedLogger } from '~/utils/logger';
import { path } from '~/utils/path';

const logger = createScopedLogger('AutoInstallService');

export interface AutoInstallConfig {
  enabled: boolean;
  timeout: number;
  retryAttempts: number;
  runDevScript: boolean;
  maxConcurrentProjects: number;
}

export interface AutoInstallResult {
  success: boolean;
  projectPath: string;
  npmInstallSuccess: boolean;
  npmDevSuccess: boolean;
  port?: number;
  error?: string;
  duration: number;
}

export class AutoInstallService {
  private static instance: AutoInstallService;
  private runningProjects = new Set<string>();
  private config: AutoInstallConfig;
  
  private constructor() {
    this.config = this.loadConfig();
    logger.info('AutoInstallService initialized with config:', this.config);
  }
  
  public static getInstance(): AutoInstallService {
    if (!AutoInstallService.instance) {
      AutoInstallService.instance = new AutoInstallService();
    }
    return AutoInstallService.instance;
  }
  
  private loadConfig(): AutoInstallConfig {
    return {
      enabled: import.meta.env.VITE_AUTO_INSTALL_ENABLED !== 'false',
      timeout: parseInt(import.meta.env.VITE_AUTO_INSTALL_TIMEOUT || '300000'), // 5 minutes
      retryAttempts: parseInt(import.meta.env.VITE_AUTO_INSTALL_RETRY_ATTEMPTS || '2'),
      runDevScript: import.meta.env.VITE_AUTO_INSTALL_DEV_SCRIPT !== 'false',
      maxConcurrentProjects: parseInt(import.meta.env.VITE_AUTO_INSTALL_MAX_CONCURRENT || '3')
    };
  }
  
  /**
   * Main method to auto-install and run dev for a project
   */
  async autoInstallAndRun(projectPath: string): Promise<AutoInstallResult> {
    const startTime = Date.now();
    
    // Check if feature is enabled
    if (!this.config.enabled) {
      logger.debug('Auto-install feature is disabled');
      return {
        success: false,
        projectPath,
        npmInstallSuccess: false,
        npmDevSuccess: false,
        error: 'Feature disabled',
        duration: Date.now() - startTime
      };
    }
    
    // Check if project is already running
    if (this.runningProjects.has(projectPath)) {
      logger.debug(`Project ${projectPath} is already being processed`);
      return {
        success: false,
        projectPath,
        npmInstallSuccess: false,
        npmDevSuccess: false,
        error: 'Already processing',
        duration: Date.now() - startTime
      };
    }
    
    // Check concurrent project limit
    if (this.runningProjects.size >= this.config.maxConcurrentProjects) {
      logger.warn(`Maximum concurrent projects (${this.config.maxConcurrentProjects}) reached`);
      return {
        success: false,
        projectPath,
        npmInstallSuccess: false,
        npmDevSuccess: false,
        error: 'Max concurrent projects reached',
        duration: Date.now() - startTime
      };
    }
    
    try {
      this.runningProjects.add(projectPath);
      logger.info(`Starting auto-install for project: ${projectPath}`);
      
      // Check if project has valid package.json
      const hasValidPackage = await this.hasValidPackageJson(projectPath);
      if (!hasValidPackage) {
        logger.debug(`Project ${projectPath} does not have valid package.json`);
        return {
          success: false,
          projectPath,
          npmInstallSuccess: false,
          npmDevSuccess: false,
          error: 'No valid package.json found',
          duration: Date.now() - startTime
        };
      }
      
      // 🚀 SIMPLE: Run both commands in one go with &&
      if (this.config.runDevScript) {
        const hasDevScript = await this.hasDevScript(projectPath);
        if (hasDevScript) {
          // 🎲 Generate random port between 3001-4999 to avoid conflicts
          const randomPort = Math.floor(Math.random() * (4999 - 3001 + 1)) + 3001;
          
          logger.info(`Running 'npm install && npm run dev' for project: ${projectPath} (will use random port 3001-4999)`);
          const success = await this.runNpmInstallAndDev(projectPath, randomPort);
          
          const result: AutoInstallResult = {
            success,
            projectPath,
            npmInstallSuccess: success,
            npmDevSuccess: success,
            port: success ? randomPort : undefined,
            duration: Date.now() - startTime
          };
          
          logger.info(`Auto-install completed for project: ${projectPath}`, result);
          return result;
        } else {
          logger.debug(`No dev script found, running only npm install for project: ${projectPath}`);
          const npmInstallSuccess = await this.runNpmInstall(projectPath);
          
          const result: AutoInstallResult = {
            success: npmInstallSuccess,
            projectPath,
            npmInstallSuccess,
            npmDevSuccess: false,
            duration: Date.now() - startTime
          };
          
          logger.info(`Auto-install completed for project: ${projectPath}`, result);
          return result;
        }
      } else {
        // Only run npm install
        logger.info(`Running npm install for project: ${projectPath}`);
        const npmInstallSuccess = await this.runNpmInstall(projectPath);
        
        const result: AutoInstallResult = {
          success: npmInstallSuccess,
          projectPath,
          npmInstallSuccess,
          npmDevSuccess: false,
          duration: Date.now() - startTime
        };
        
        logger.info(`Auto-install completed for project: ${projectPath}`, result);
        return result;
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Auto-install failed for project: ${projectPath}:`, error);
      
      return {
        success: false,
        projectPath,
        npmInstallSuccess: false,
        npmDevSuccess: false,
        error: errorMessage,
        duration: Date.now() - startTime
      };
    } finally {
      this.runningProjects.delete(projectPath);
    }
  }
  
  /**
   * Check if project has a valid package.json file
   */
  private async hasValidPackageJson(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const fs = await import('fs/promises');
      
      const stats = await fs.stat(packageJsonPath);
      if (!stats.isFile()) {
        return false;
      }
      
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      
      // Basic validation
      return !!(packageJson.name && packageJson.version);
    } catch (error) {
      logger.debug(`Error checking package.json for ${projectPath}:`, error);
      return false;
    }
  }
  
  /**
   * Check if project has a dev script
   */
  private async hasDevScript(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const fs = await import('fs/promises');
      
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      
      return !!(packageJson.scripts && packageJson.scripts.dev);
    } catch (error) {
      logger.debug(`Error checking dev script for ${projectPath}:`, error);
      return false;
    }
  }
  
  // needsInstall method removed - we now always run npm install with &&
  
  /**
   * Run npm install in the project directory
   */
  private async runNpmInstall(projectPath: string): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        const npmProcess = spawn('npm', ['install'], {
          cwd: projectPath,
          stdio: 'pipe',
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        npmProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        
        npmProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        // Set timeout
        const timeout = setTimeout(() => {
          npmProcess.kill('SIGTERM');
          logger.warn(`npm install timeout for project: ${projectPath}`);
          resolve(false);
        }, this.config.timeout);
        
        npmProcess.on('close', (code: number) => {
          clearTimeout(timeout);
          
          if (code === 0) {
            logger.info(`npm install completed successfully for project: ${projectPath}`);
            resolve(true);
          } else {
            logger.warn(`npm install failed for project: ${projectPath} with code ${code}`);
            logger.debug(`npm install stderr: ${stderr}`);
            resolve(false);
          }
        });
        
        npmProcess.on('error', (error: Error) => {
          clearTimeout(timeout);
          logger.error(`npm install error for project: ${projectPath}:`, error);
          resolve(false);
        });
      });
    } catch (error) {
      logger.error(`Failed to run npm install for project: ${projectPath}:`, error);
      return false;
    }
  }
  
  /**
   * Run npm install && npm run dev in the project directory
   */
  private async runNpmInstallAndDev(projectPath: string, port: number): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        // 🚀 Run both commands with && and random port - much simpler!
        const npmProcess = spawn(`npm install && npm run dev -- --port ${port}`, [], {
          cwd: projectPath,
          stdio: 'pipe',
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        npmProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
          logger.debug(`[${projectPath}] npm output: ${data.toString()}`);
        });
        
        npmProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
          logger.debug(`[${projectPath}] npm stderr: ${data.toString()}`);
        });
        
        // Set timeout for the combined command
        const timeout = setTimeout(() => {
          npmProcess.kill('SIGTERM');
          logger.warn(`npm install && npm run dev timeout for project: ${projectPath}`);
          resolve(false);
        }, this.config.timeout);
        
        // For the combined command, we consider it successful if npm run dev starts
        let hasStarted = false;
        
        npmProcess.stdout?.on('data', (data: Buffer) => {
          const output = data.toString();
          if (output.includes('Local:') || output.includes('ready') || output.includes('started') || output.includes('dev server')) {
            hasStarted = true;
            clearTimeout(timeout);
            logger.info(`✅ npm install && npm run dev completed successfully for project: ${projectPath} on port ${port}`);
            resolve(true);
          }
        });
        
        npmProcess.on('close', (code: number) => {
          clearTimeout(timeout);
          
          if (hasStarted) {
            // Already resolved as successful
            return;
          }
          
          if (code === 0) {
            logger.info(`✅ npm install && npm run dev completed for project: ${projectPath} on port ${port}`);
            resolve(true);
          } else {
            logger.warn(`⚠️ npm install && npm run dev failed for project: ${projectPath} with code ${code}`);
            logger.debug(`npm stderr: ${stderr}`);
            resolve(false);
          }
        });
        
        npmProcess.on('error', (error: Error) => {
          clearTimeout(timeout);
          logger.error(`❌ npm install && npm run dev error for project: ${projectPath}:`, error);
          resolve(false);
        });
      });
    } catch (error) {
      logger.error(`Failed to run npm install && npm run dev for project: ${projectPath}:`, error);
      return false;
    }
  }
  
  /**
   * Run npm run dev in the project directory
   */
  private async runNpmDev(projectPath: string): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        const npmProcess = spawn('npm', ['run', 'dev'], {
          cwd: projectPath,
          stdio: 'pipe',
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        npmProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        
        npmProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        // Set timeout for dev command
        const timeout = setTimeout(() => {
          npmProcess.kill('SIGTERM');
          logger.warn(`npm run dev timeout for project: ${projectPath}`);
          resolve(false);
        }, this.config.timeout);
        
        // For dev command, we consider it successful if it starts without immediate errors
        let hasStarted = false;
        
        npmProcess.stdout?.on('data', (data: Buffer) => {
          const output = data.toString();
          if (output.includes('Local:') || output.includes('ready') || output.includes('started')) {
            hasStarted = true;
            clearTimeout(timeout);
            logger.info(`npm run dev started successfully for project: ${projectPath}`);
            resolve(true);
          }
        });
        
        npmProcess.on('close', (code: number) => {
          clearTimeout(timeout);
          
          if (hasStarted) {
            // Already resolved as successful
            return;
          }
          
          if (code === 0) {
            logger.info(`npm run dev completed for project: ${projectPath}`);
            resolve(true);
          } else {
            logger.warn(`npm run dev failed for project: ${projectPath} with code ${code}`);
            logger.debug(`npm run dev stderr: ${stderr}`);
            resolve(false);
          }
        });
        
        npmProcess.on('error', (error: Error) => {
          clearTimeout(timeout);
          logger.error(`npm run dev error for project: ${projectPath}:`, error);
          resolve(false);
        });
      });
    } catch (error) {
      logger.error(`Failed to run npm run dev for project: ${projectPath}:`, error);
      return false;
    }
  }
  
  /**
   * Get current status of the service
   */
  getStatus() {
    return {
      config: this.config,
      runningProjects: Array.from(this.runningProjects),
      runningCount: this.runningProjects.size
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AutoInstallConfig>) {
    this.config = { ...this.config, ...newConfig };
    logger.info('AutoInstallService config updated:', this.config);
  }
  
  /**
   * Stop all running processes for a project
   */
  async stopProject(projectPath: string): Promise<boolean> {
    try {
      // This would need to be implemented to track and kill npm processes
      // For now, just remove from running projects
      this.runningProjects.delete(projectPath);
      logger.info(`Stopped auto-install for project: ${projectPath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to stop project: ${projectPath}:`, error);
      return false;
    }
  }
}
