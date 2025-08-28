import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { AutoInstallService } from '~/lib/services/server-only/auto-install';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
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
