import { Routes } from '@angular/router';
import { authGuard, adminGuard, guestGuard, permissionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'kiosk',
    pathMatch: 'full',
  },
  {
    path: 'kiosk',
    loadComponent: () =>
      import('./features/kiosk/kiosk.component').then((m) => m.KioskComponent),
  },
  {
    path: 'attendance',
    loadComponent: () =>
      import('./features/attendance/attendance-scan.component').then(
        (m) => m.AttendanceScanComponent
      ),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/pages/login/login.component').then((m) => m.LoginComponent),
      },
    ],
  },
  {
    path: 'requests',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/requests/pages/my-requests/my-requests.component').then(
        (m) => m.MyRequestsComponent
      ),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        canActivate: [permissionGuard],
        data: { permission: 'dashboard.view' },
        loadComponent: () =>
          import('./features/admin/pages/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: 'employees',
        canActivate: [permissionGuard],
        data: { permission: 'employees.view' },
        loadComponent: () =>
          import('./features/admin/pages/employees/employees.component').then(
            (m) => m.EmployeesComponent
          ),
      },
      {
        path: 'attendance',
        canActivate: [permissionGuard],
        data: { permission: 'attendance.view' },
        loadComponent: () =>
          import('./features/admin/pages/attendance/attendance.component').then(
            (m) => m.AttendanceComponent
          ),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard],
        data: { permission: 'settings.view' },
        loadComponent: () =>
          import('./features/admin/pages/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
      },
      {
        path: 'locations',
        canActivate: [permissionGuard],
        data: { permission: 'locations.view' },
        loadComponent: () =>
          import('./features/admin/pages/locations/locations.component').then(
            (m) => m.LocationsComponent
          ),
      },
      {
        path: 'schedules',
        canActivate: [permissionGuard],
        data: { permission: 'schedules.view' },
        loadComponent: () =>
          import('./features/admin/pages/schedules/schedules.component').then(
            (m) => m.SchedulesComponent
          ),
      },
      {
        path: 'departments',
        canActivate: [permissionGuard],
        data: { permission: 'departments.view' },
        loadComponent: () =>
          import('./features/admin/pages/departments/departments.component').then(
            (m) => m.DepartmentsComponent
          ),
      },
      {
        path: 'positions',
        canActivate: [permissionGuard],
        data: { permission: 'positions.view' },
        loadComponent: () =>
          import('./features/admin/pages/positions/positions.component').then(
            (m) => m.PositionsComponent
          ),
      },
      {
        path: 'permission-requests',
        canActivate: [permissionGuard],
        data: { permission: 'permission_requests.view' },
        loadComponent: () =>
          import('./features/admin/pages/permission-requests/permission-requests.component').then(
            (m) => m.AdminPermissionRequestsComponent
          ),
      },
      {
        path: 'roles',
        canActivate: [permissionGuard],
        data: { permission: 'roles.view' },
        loadComponent: () =>
          import('./features/admin/pages/roles/roles.component').then((m) => m.RolesComponent),
      },
      {
        path: 'users',
        canActivate: [permissionGuard],
        data: { permission: 'users.view' },
        loadComponent: () =>
          import('./features/admin/pages/users/users.component').then((m) => m.UsersComponent),
      },
      {
        // task 4.6, design.md D4: scope-admin surface, backed by task 3.8's
        // `user_scopes.manage`-gated `/user-scopes` endpoint. `permissionGuard`
        // (task 4.3) was built for exactly this — no prior route used it.
        path: 'user-scopes',
        canActivate: [permissionGuard],
        data: { permission: 'user_scopes.manage' },
        loadComponent: () =>
          import('./features/admin/pages/user-scopes/user-scopes.component').then(
            (m) => m.UserScopesComponent
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'kiosk',
  },
];
