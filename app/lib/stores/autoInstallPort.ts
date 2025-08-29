import { atom } from 'nanostores';

export interface AutoInstallPortInfo {
  port: number | null;
  projectPath: string | null;
  status: 'running' | 'not-running';
  timestamp: number;
}

// Create a global store for auto-install port information
export const autoInstallPortStore = atom<AutoInstallPortInfo>({
  port: null,
  projectPath: null,
  status: 'not-running',
  timestamp: 0
});

// Helper functions to update the store
export const setAutoInstallPort = (port: number, projectPath: string) => {
  autoInstallPortStore.set({
    port,
    projectPath,
    status: 'running',
    timestamp: Date.now()
  });
};

export const clearAutoInstallPort = () => {
  autoInstallPortStore.set({
    port: null,
    projectPath: null,
    status: 'not-running',
    timestamp: Date.now()
  });
};
