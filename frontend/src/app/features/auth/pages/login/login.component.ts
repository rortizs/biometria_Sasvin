import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <h1>Control de Asistencia</h1>
        <h2>Iniciar Sesión</h2>

        <form (ngSubmit)="login()">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              [(ngModel)]="email"
              name="email"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label for="password">Contraseña</label>
            <input
              type="password"
              id="password"
              [(ngModel)]="password"
              name="password"
              required
              autocomplete="current-password"
            />
          </div>

          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }

          <button type="submit" [disabled]="isLoading()">
            @if (isLoading()) {
              Ingresando...
            } @else {
              Ingresar
            }
          </button>
        </form>

        <a routerLink="/kiosk" class="kiosk-link">← Volver al Kiosko</a>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 1rem;
    }

    .login-card {
      background: white;
      padding: 2.5rem;
      border-radius: 1rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    }

    h1 {
      color: #1a1a2e;
      font-size: 1.2rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    h2 {
      color: #333;
      font-size: 1.8rem;
      font-weight: 700;
      margin-bottom: 2rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #555;
    }

    input {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: border-color 0.2s;
    }

    input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .error-message {
      background: #fef2f2;
      color: #dc2626;
      padding: 0.75rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    button {
      width: 100%;
      padding: 0.875rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    button:hover:not(:disabled) {
      background: #2563eb;
    }

    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .kiosk-link {
      display: block;
      text-align: center;
      margin-top: 1.5rem;
      color: #6b7280;
      text-decoration: none;
      font-size: 0.9rem;
    }

    .kiosk-link:hover {
      color: #3b82f6;
    }
  `],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  login(): void {
    if (!this.email || !this.password) {
      this.error.set('Por favor complete todos los campos');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.authService
      .login({ username: this.email, password: this.password })
      .subscribe({
        next: () => {
          this.router.navigate(['/admin/dashboard']);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.error.set(err.error?.detail || 'Error al iniciar sesión');
        },
      });
  }
}
