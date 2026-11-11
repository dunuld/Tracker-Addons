import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/day/day.component') },
  { path: 'day/:date', loadComponent: () => import('./features/day/day.component') },
  { path: 'calendar', loadComponent: () => import('./features/calendar/calendar.component') },
  { path: 'projects', loadComponent: () => import('./features/projects/projects.component') },
  { path: 'settings', loadComponent: () => import('./features/settings/settings.component') },
  { path: '**', redirectTo: '' },
];
