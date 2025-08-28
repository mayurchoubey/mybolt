import { useState, useEffect, useCallback } from 'react';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useAutoInstall');

export interface AutoInstallStatus {
  config: {
    enabled: boolean;
    timeout: number;
    retryAttempts: number;
    runDevScript: boolean;
    maxConcurrentProjects: number;
  };
  runningProjects: string[];
  runningCount: number;
}

export interface AutoInstallResult {
  success: boolean;
  projectPath: string;
  npmInstallSuccess: boolean;
  npmDevSuccess: boolean;
  error?: string;
  duration: number;
}

export function useAutoInstall() {
  const [status, setStatus] = useState<AutoInstallStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AutoInstallResult | null>(null);

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/auto-install');
      const data = await response.json() as { success: boolean; status?: AutoInstallStatus; error?: string };
      
      if (data.success) {
        setStatus(data.status!);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to fetch status: ${errorMessage}`);
      logger.error('Failed to fetch auto-install status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger auto-install for a project
  const triggerAutoInstall = useCallback(async (projectPath: string): Promise<AutoInstallResult | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/auto-install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'trigger',
          projectPath
        }),
      });
      
      const data = await response.json() as { success: boolean; result?: AutoInstallResult; error?: string };
      
      if (data.success) {
        setLastResult(data.result!);
        // Refresh status after triggering
        await fetchStatus();
        return data.result!;
      } else {
        setError(data.error || 'Failed to trigger auto-install');
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to trigger auto-install: ${errorMessage}`);
      logger.error('Failed to trigger auto-install:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  // Update configuration
  const updateConfig = useCallback(async (newConfig: Partial<AutoInstallStatus['config']>): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/auto-install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update-config',
          config: newConfig
        }),
      });
      
      const data = await response.json() as { success: boolean; error?: string };
      
      if (data.success) {
        // Refresh status after updating config
        await fetchStatus();
        return true;
      } else {
        setError(data.error || 'Failed to update configuration');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to update configuration: ${errorMessage}`);
      logger.error('Failed to update configuration:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  // Stop a running project
  const stopProject = useCallback(async (projectPath: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/auto-install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'stop-project',
          projectPath
        }),
      });
      
      const data = await response.json() as { success: boolean; result?: boolean; error?: string };
      
      if (data.success) {
        // Refresh status after stopping project
        await fetchStatus();
        return data.result!;
      } else {
        setError(data.error || 'Failed to stop project');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to stop project: ${errorMessage}`);
      logger.error('Failed to stop project:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  // Auto-refresh status every 5 seconds when there are running projects
  useEffect(() => {
    if (status?.runningCount && status.runningCount > 0) {
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [status?.runningCount, fetchStatus]);

  // Initial status fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    lastResult,
    fetchStatus,
    triggerAutoInstall,
    updateConfig,
    stopProject,
    isEnabled: status?.config.enabled ?? false,
    runningProjects: status?.runningProjects ?? [],
    runningCount: status?.runningCount ?? 0
  };
}
