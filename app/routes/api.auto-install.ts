import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
// AutoInstallService imported dynamically to avoid client-side bundling

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { AutoInstallService } = await import('~/lib/services/server-only/auto-install');
    const autoInstallService = AutoInstallService.getInstance();
    const status = autoInstallService.getStatus();
    
    return json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get auto-install status:', error);
    return json({
      success: false,
      error: 'Failed to get auto-install status',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const method = request.method;
    
    if (method === 'POST') {
      const body = await request.json() as { action?: string; projectPath?: string; config?: any };
      const { action, projectPath, config } = body;
      
      const { AutoInstallService } = await import('~/lib/services/server-only/auto-install');
      const autoInstallService = AutoInstallService.getInstance();
      
      switch (action) {
        case 'trigger':
          if (!projectPath) {
            return json({
              success: false,
              error: 'Project path is required for trigger action'
            }, { status: 400 });
          }
          
          const result = await autoInstallService.autoInstallAndRun(projectPath);
          
          // Log the result for debugging
          console.log('🎯 Auto-install API response:', {
            success: result.success,
            projectPath: result.projectPath,
            port: result.port,
            npmInstallSuccess: result.npmInstallSuccess,
            npmDevSuccess: result.npmDevSuccess,
            duration: result.duration
          });
          
          return json({
            success: true,
            result,
            timestamp: new Date().toISOString()
          });
          
        case 'update-config':
          if (!config) {
            return json({
              success: false,
              error: 'Configuration is required for update-config action'
            }, { status: 400 });
          }
          
          autoInstallService.updateConfig(config);
          return json({
            success: true,
            message: 'Configuration updated successfully',
            timestamp: new Date().toISOString()
          });
          
        case 'stop-project':
          if (!projectPath) {
            return json({
              success: false,
              error: 'Project path is required for stop-project action'
            }, { status: 400 });
          }
          
          const stopResult = await autoInstallService.stopProject(projectPath);
          return json({
            success: true,
            result: stopResult,
            timestamp: new Date().toISOString()
          });

        case 'stop-all-projects':
          // Stop all running projects to free up slots
          const allProjects = autoInstallService.getStatus().runningProjects;
          const stopResults = [];
          
          for (const project of allProjects) {
            const result = await autoInstallService.stopProject(project);
            stopResults.push({ project, result });
          }
          
          return json({
            success: true,
            message: `Stopped ${allProjects.length} projects`,
            results: stopResults,
            timestamp: new Date().toISOString()
          });
          
        case 'get-port':
          if (!projectPath) {
            return json({ success: false, error: 'Project path is required' }, { status: 400 });
          }

          // Check if projectPath is a UUID (project ID) or full path
          const isProjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectPath);
          
          let portResult;
          if (isProjectId) {
            // If it's a project ID, use the new method
            portResult = await autoInstallService.getProjectStatusById(projectPath);
          } else {
            // If it's a full path, use the existing method
            portResult = await autoInstallService.getProjectStatus(projectPath);
          }
          
          return json({
            success: true,
            port: portResult.port,
            status: portResult.status
          });

        case 'get-port-by-id':
          if (!projectPath) {
            return json({ success: false, error: 'Project ID is required' }, { status: 400 });
          }

          // Validate that projectPath is a UUID
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectPath)) {
            return json({ success: false, error: 'Invalid project ID format' }, { status: 400 });
          }

          const portByIdResult = await autoInstallService.getProjectStatusById(projectPath);
          return json({
            success: true,
            port: portByIdResult.port,
            status: portByIdResult.status
          });

        case 'get-latest-project':
          // Get the most recent running project with its port
          const runningProjects = autoInstallService.getStatus().runningProjects;
          let latestProject = null;
          let latestPort = null;
          
          if (runningProjects.length > 0) {
            // Get the most recent project (assuming it's the last one added)
            const mostRecentProject = runningProjects[runningProjects.length - 1];
            const projectId = autoInstallService.extractProjectIdFromPath(mostRecentProject);
            
            if (projectId) {
              latestProject = projectId;
              // Try to get port by project ID first, then by full path as fallback
              latestPort = autoInstallService.getProjectPortById(projectId) || 
                          autoInstallService.getProjectPort(mostRecentProject);
            }
          }
          
          return json({
            success: true,
            projectId: latestProject,
            port: latestPort,
            status: latestPort ? 'running' : 'not-running'
          });

        case 'get-current-port':
          // Get the current running auto-install port (if any)
          const currentRunningProjects = autoInstallService.getStatus().runningProjects;
          let currentPort = null;
          
          if (currentRunningProjects.length > 0) {
            // Get the first running project's port
            const firstProject = currentRunningProjects[0];
            currentPort = autoInstallService.getProjectPort(firstProject);
            
            // If no port found, try to extract project ID and get port by ID
            if (!currentPort) {
              const projectId = autoInstallService.extractProjectIdFromPath(firstProject);
              if (projectId) {
                currentPort = autoInstallService.getProjectPortById(projectId);
              }
            }
          }
          
          return json({
            success: true,
            port: currentPort,
            status: currentPort ? 'running' : 'not-running'
          });
          
        default:
          return json({
            success: false,
            error: `Unknown action: ${action}`
          }, { status: 400 });
      }
    }
    
    return json({
      success: false,
      error: 'Method not allowed'
    }, { status: 405 });
    
  } catch (error) {
    console.error('Auto-install API error:', error);
    return json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
