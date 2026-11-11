import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from './core/session.service.js';
import { ThemeService } from './core/theme.service.js';
import SetupComponent from './features/setup/setup.component.js';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, SetupComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly themeService = inject(ThemeService);
  readonly session = inject(SessionService);

  constructor() {
    this.session.load();
  }

  themeLabel(): string {
    const m = this.themeService.mode();
    if (m === 'light') return '☀️';
    if (m === 'dark') return '🌙';
    return '💻';
  }

  themeTitle(): string {
    const m = this.themeService.mode();
    if (m === 'light') return 'Hell (nächster Klick: Dunkel)';
    if (m === 'dark') return 'Dunkel (nächster Klick: System)';
    return 'System (nächster Klick: Hell)';
  }
}
