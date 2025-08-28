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
      
      // Check if npm install is needed
      const needsInstall = await this.needsInstall(projectPath);
      let npmInstallSuccess = true;
      
      if (needsInstall) {
        logger.info(`Running npm install for project: ${projectPath}`);
        npmInstallSuccess = await this.runNpmInstall(projectPath);
      } else {
        logger.debug(`npm install not needed for project: ${projectPath}`);
      }
      
      // Run npm run dev if install was successful and dev script exists
      let npmDevSuccess = false;
      if (npmInstallSuccess && this.config.runDevScript) {
        const hasDevScript = await this.hasDevScript(projectPath);
        if (hasDevScript) {
          logger.info(`Running npm run dev for project: ${projectPath}`);
          npmDevSuccess = await this.runNpmDev(projectPath);
        } else {
          logger.debug(`No dev script found for project: ${projectPath}`);
        }
      }
      
      const result: AutoInstallResult = {
        success: npmInstallSuccess,
        projectPath,
        npmInstallSuccess,
        npmDevSuccess,
        duration: Date.now() - startTime
      };
      
      logger.info(`Auto-install completed for project: ${projectPath}`, result);
      return result;
      
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
      const fs = await import('node:fs/promises');
      
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
      const fs = await import('node:fs/promises');
      
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      
      return !!(packageJson.scripts && packageJson.scripts.dev);
    } catch (error) {
      logger.debug(`Error checking dev script for ${projectPath}:`, error);
      return false;
    }
  }
  
  /**
   * Check if npm install is needed (node_modules missing or package-lock.json outdated)
   */
  private async needsInstall(projectPath: string): Promise<boolean> {
    try {
      const fs = await import('node:fs/promises');
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      const packageLockPath = path.join(projectPath, 'package-lock.json');
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      // Check if node_modules exists
      try {
        const nodeModulesStats = await fs.stat(nodeModulesPath);
        if (!nodeModulesStats.isDirectory()) {
          return true;
        }
      } catch {
        // node_modules doesn't exist
        return true;
      }
      
      // Check if package-lock.json is newer than package.json
      try {
        const packageLockStats = await fs.stat(packageLockPath);
        const packageJsonStats = await fs.stat(packageJsonPath);
        
        if (packageLockStats.mtime < packageJsonStats.mtime) {
          return true;
        }
      } catch {
        // package-lock.json doesn't exist
        return true;
      }
      
      return false;
    } catch (error) {
      logger.debug(`Error checking if install is needed for ${projectPath}:`, error);
      return true; // Default to installing if we can't determine
    }
  }
  
  /**
   * Run npm install in the project directory
   */
  private async runNpmInstall(projectPath: string): Promise<boolean> {
    try {
      const { spawn } = await import('node:child_process');
      const { promisify } = await import('node:util');
      
      return new Promise((resolve) => {
        const npmProcess = spawn('npm', ['install'], {
          cwd: projectPath,
          stdio: 'pipe',
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        npmProcess.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        npmProcess.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        // Set timeout
        const timeout = setTimeout(() => {
          npmProcess.kill('SIGTERM');
          logger.warn(`npm install timeout for project: ${projectPath}`);
          resolve(false);
        }, this.config.timeout);
        
        npmProcess.on('close', (code) => {
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
        
        npmProcess.on('error', (error) => {
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
   * Run npm run dev in the project directory
   */
  private async runNpmDev(projectPath: string): Promise<boolean> {
    try {
      const { spawn } = await import('node:child_process');
      
      return new Promise((resolve) => {
        const npmProcess = spawn('npm', ['run', 'dev'], {
          cwd: projectPath,
          stdio: 'pipe',
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        npmProcess.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        npmProcess.stderr?.on('data', (data) => {
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
        
        npmProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Local:') || output.includes('ready') || output.includes('started')) {
            hasStarted = true;
            clearTimeout(timeout);
            logger.info(`npm run dev started successfully for project: ${projectPath}`);
            resolve(true);
          }
        });
        
        npmProcess.on('close', (code) => {
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
        
        npmProcess.on('error', (error) => {
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
