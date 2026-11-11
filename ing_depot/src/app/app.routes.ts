import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/overview/overview.component') },
  {
    path: 'buchungen',
    loadComponent: () => import('./features/transactions/transactions.component'),
  },
  { path: 'import', loadComponent: () => import('./features/import/import.component') },
  { path: '**', redirectTo: '' },
];
