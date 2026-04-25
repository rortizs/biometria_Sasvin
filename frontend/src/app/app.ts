import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FirstLoginModalComponent } from './core/components/first-login-modal/first-login-modal.component';
import { PwaUpdateService } from './core/services/pwa-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FirstLoginModalComponent],
  template: `
    @if (pwaUpdate.updateAvailable()) {
      <div class="update-banner">
        <span>Nueva versión disponible</span>
        <button (click)="pwaUpdate.applyUpdate()">Actualizar ahora</button>
      </div>
    }
    <router-outlet />
    <app-first-login-modal />
  `,
  styles: [`
    .update-banner {
      position: fixed;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: white;
      padding: 0.75rem 1.25rem;
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      white-space: nowrap;
      font-size: 0.9rem;
    }

    .update-banner button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.4rem 0.9rem;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.85rem;
      transition: background 0.2s;
    }

    .update-banner button:hover {
      background: #2563eb;
    }
  `],
})
export class App {
  readonly pwaUpdate = inject(PwaUpdateService);
}
