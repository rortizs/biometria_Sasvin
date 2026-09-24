import { Route } from '@angular/router';
import { routes } from './app.routes';
import { permissionGuard } from './core/guards/auth.guard';

describe('app routes', () => {
  function adminChild(path: string): Route {
    const adminRoute = routes.find((route) => route.path === 'admin');
    const child = adminRoute?.children?.find((route) => route.path === path);
    if (!child) fail(`Missing /admin/${path} route`);
    return child as Route;
  }

  const protectedAdminRoutes: Record<string, string> = {
    dashboard: 'dashboard.view',
    employees: 'employees.view',
    attendance: 'attendance.view',
    settings: 'settings.view',
    locations: 'locations.view',
    schedules: 'schedules.view',
    departments: 'departments.view',
    positions: 'positions.view',
    'permission-requests': 'permission_requests.view',
    roles: 'roles.view',
    users: 'users.view',
    'user-scopes': 'user_scopes.manage',
  };

  for (const [path, permission] of Object.entries(protectedAdminRoutes)) {
    it(`requires ${permission} for /admin/${path}`, () => {
      const route = adminChild(path);

      expect(route.canActivate).toContain(permissionGuard);
      expect(route.data?.['permission']).toBe(permission);
    });
  }
});
