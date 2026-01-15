import { Routes } from '@angular/router';
import { authGuard, adminGuard, guestGuard } from './core/guards/auth.guard';

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
        loadComponent: () =>
          import('./features/admin/pages/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: 'employees',
        loadComponent: () =>
          import('./features/admin/pages/employees/employees.component').then(
            (m) => m.EmployeesComponent
          ),
      },
      {
        path: 'attendance',
        loadComponent: () =>
          import('./features/admin/pages/attendance/attendance.component').then(
            (m) => m.AttendanceComponent
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/admin/pages/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
      },
      {
        path: 'locations',
        loadComponent: () =>
          import('./features/admin/pages/locations/locations.component').then(
            (m) => m.LocationsComponent
          ),
      },
      {
        path: 'schedules',
        loadComponent: () =>
          import('./features/admin/pages/schedules/schedules.component').then(
            (m) => m.SchedulesComponent
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'kiosk',
  },
];
