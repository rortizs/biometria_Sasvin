import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-first-login-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (authService.isAuthenticated() && authService.mustChangePassword()) {
      <div class="overlay">
        <div class="modal">
          <div class="modal-icon">🔐</div>
          <h2>Cambio de contraseña requerido</h2>
          <p class="subtitle">
            Esta es tu primera vez iniciando sesión. Por seguridad, debés establecer una contraseña propia.
          </p>

          <form (ngSubmit)="submit()">
            <div class="field">
              <label for="flp-password">Nueva contraseña</label>
              <div class="input-row">
                <input
                  id="flp-password"
                  [ngModel]="password()"
                  (ngModelChange)="password.set($event)"
                  name="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  placeholder="Mínimo 8 caracteres"
                  autocomplete="new-password"
                />
                <button type="button" class="btn-toggle" (click)="showPassword.set(!showPassword())" title="Mostrar/ocultar">
                  {{ showPassword() ? '🙈' : '👁️' }}
                </button>
              </div>

              @if (password()) {
                <div class="strength-track">
                  <div
                    class="strength-fill"
                    [style.width]="strengthPct() + '%'"
                    [style.background]="strengthColor()"
                  ></div>
                </div>
                <div class="strength-label" [style.color]="strengthColor()">{{ strengthLabel() }}</div>
              }
            </div>

            <div class="requirements">
              <div class="req-title">La contraseña debe tener:</div>
              <ul>
                <li [class.met]="req_length()">
                  <span class="req-icon">{{ req_length() ? '✓' : '○' }}</span>
                  Al menos 8 caracteres
                </li>
                <li [class.met]="req_upper()">
                  <span class="req-icon">{{ req_upper() ? '✓' : '○' }}</span>
                  Al menos 1 letra mayúscula
                </li>
                <li [class.met]="req_lower()">
                  <span class="req-icon">{{ req_lower() ? '✓' : '○' }}</span>
                  Al menos 1 letra minúscula
                </li>
                <li [class.met]="req_digit()">
                  <span class="req-icon">{{ req_digit() ? '✓' : '○' }}</span>
                  Al menos 1 número
                </li>
                <li [class.met]="req_special()">
                  <span class="req-icon">{{ req_special() ? '✓' : '○' }}</span>
                  Al menos 1 carácter especial (!&#64;#$%...)
                </li>
              </ul>
            </div>

            @if (error()) {
              <div class="error-msg">{{ error() }}</div>
            }

            <button
              type="submit"
              class="btn-submit"
              [disabled]="!isValid() || saving()"
            >
              {{ saving() ? 'Guardando...' : 'Establecer contraseña' }}
            </button>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 1rem;
    }

    .modal {
      background: white;
      border-radius: 1.25rem;
      padding: 2.5rem 2rem;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-icon {
      font-size: 2.5rem;
      text-align: center;
      margin-bottom: 1rem;
    }

    h2 {
      margin: 0 0 0.5rem;
      font-size: 1.35rem;
      color: #1f2937;
      text-align: center;
    }

    .subtitle {
      color: #6b7280;
      font-size: 0.875rem;
      text-align: center;
      margin: 0 0 1.75rem;
      line-height: 1.5;
    }

    .field {
      margin-bottom: 1.25rem;
    }

    label {
      display: block;
      font-weight: 600;
      font-size: 0.875rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .input-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    input[type="password"], input[type="text"] {
      flex: 1;
      padding: 0.625rem 0.875rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      font-family: inherit;
      box-sizing: border-box;
      transition: border-color 0.2s;
    }

    input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .btn-toggle {
      background: none;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 0.625rem;
      cursor: pointer;
      font-size: 1rem;
      flex-shrink: 0;
      line-height: 1;
    }

    .strength-track {
      height: 5px;
      background: #e5e7eb;
      border-radius: 3px;
      margin-top: 0.625rem;
      overflow: hidden;
    }

    .strength-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease, background 0.3s ease;
    }

    .strength-label {
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 0.25rem;
    }

    .requirements {
      background: #f9fafb;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }

    .req-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.625rem;
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: #9ca3af;
      transition: color 0.2s;
    }

    li.met {
      color: #059669;
    }

    .req-icon {
      font-size: 0.75rem;
      width: 1rem;
      flex-shrink: 0;
    }

    .error-msg {
      background: #fee2e2;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .btn-submit {
      width: 100%;
      padding: 0.75rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.625rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      font-family: inherit;
    }

    .btn-submit:hover:not(:disabled) {
      background: #2563eb;
    }

    .btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class FirstLoginModalComponent {
  readonly authService = inject(AuthService);

  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly req_length = computed(() => this.password().length >= 8);
  readonly req_upper = computed(() => /[A-Z]/.test(this.password()));
  readonly req_lower = computed(() => /[a-z]/.test(this.password()));
  readonly req_digit = computed(() => /[0-9]/.test(this.password()));
  readonly req_special = computed(() => /[^A-Za-z0-9]/.test(this.password()));

  readonly isValid = computed(() =>
    this.req_length() &&
    this.req_upper() &&
    this.req_lower() &&
    this.req_digit() &&
    this.req_special()
  );

  readonly strengthPct = computed(() => {
    const p = this.password();
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return Math.min(100, Math.round((score / 6) * 100));
  });

  readonly strengthColor = computed(() => {
    const pct = this.strengthPct();
    if (pct < 40) return '#ef4444';
    if (pct < 70) return '#f59e0b';
    return '#22c55e';
  });

  readonly strengthLabel = computed(() => {
    const pct = this.strengthPct();
    if (pct < 40) return 'Débil';
    if (pct < 70) return 'Media';
    return 'Fuerte';
  });

  submit(): void {
    if (!this.isValid() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    this.authService.changeFirstPassword(this.password()).subscribe({
      next: () => {
        this.saving.set(false);
        this.password.set('');
      },
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string } };
        this.error.set(e.error?.detail || 'Error al cambiar la contraseña. Intentá de nuevo.');
        this.saving.set(false);
      },
    });
  }
}
