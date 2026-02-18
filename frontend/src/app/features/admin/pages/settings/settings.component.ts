import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SettingsService } from '../../../../core/services/settings.service';
import { Settings, SettingsCreate, SettingsUpdate } from '../../../../core/models/settings.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="settings-page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Configuración</h1>
        </div>
      </header>

      @if (loading()) {
        <div class="loading">Cargando...</div>
      } @else {
        @if (isFirstSetup()) {
          <div class="setup-banner">
            <span class="setup-icon">⚙️</span>
            <div>
              <strong>Primera configuración</strong>
              <p>Completá los datos de tu institución para comenzar a usar el sistema.</p>
            </div>
          </div>
        }

        <div class="settings-card">
          <form (ngSubmit)="isFirstSetup() ? createSettings() : saveSettings()">
            <div class="form-group">
              <label>Nombre de la Institución <span class="required">*</span></label>
              <input
                [(ngModel)]="formData.company_name"
                name="company_name"
                required
                placeholder="Ej: Universidad Mariano Gálvez"
              />
            </div>

            <div class="form-group">
              <label>Dirección</label>
              <textarea
                [(ngModel)]="formData.company_address"
                name="company_address"
                rows="2"
                placeholder="Dirección completa"
              ></textarea>
            </div>

            <div class="form-group">
              <label>Slogan</label>
              <input
                [(ngModel)]="formData.slogan"
                name="slogan"
                placeholder="Ej: Educación que transforma"
              />
            </div>

            <div class="form-group">
              <label>Dominio de Email Institucional <span class="required">*</span></label>
              <div class="email-domain-input">
                <span class="at-symbol">&#64;</span>
                <input
                  [(ngModel)]="formData.email_domain"
                  name="email_domain"
                  required
                  placeholder="Ej: miumg.edu.gt"
                />
              </div>
              <small class="hint">
                Solo se permitirán emails con este dominio para empleados
              </small>
            </div>

            <div class="form-group">
              <label>URL del Logo</label>
              <input
                [(ngModel)]="formData.logo_url"
                name="logo_url"
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                @if (saving()) {
                  Guardando...
                } @else if (isFirstSetup()) {
                  Crear Configuración
                } @else {
                  Guardar Cambios
                }
              </button>
            </div>
          </form>
        </div>

        @if (!isFirstSetup() && settings()) {
          <div class="info-card">
            <h3>Información</h3>
            <p><strong>Creado:</strong> {{ settings()?.created_at | date:'medium' }}</p>
            <p><strong>Última actualización:</strong> {{ settings()?.updated_at | date:'medium' }}</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .settings-page {
      min-height: 100vh;
      background: #f3f4f6;
      padding: 2rem;
    }

    .header {
      margin-bottom: 2rem;
    }

    .back-link {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
    }

    h1 {
      font-size: 1.8rem;
      color: #1f2937;
      margin-top: 0.5rem;
    }

    .settings-card {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 2rem;
      max-width: 600px;
      margin-bottom: 2rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #374151;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      box-sizing: border-box;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .email-domain-input {
      display: flex;
      align-items: center;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      overflow: hidden;
    }

    .email-domain-input:focus-within {
      border-color: #3b82f6;
    }

    .at-symbol {
      padding: 0.75rem;
      background: #f3f4f6;
      color: #6b7280;
      font-weight: 500;
    }

    .email-domain-input input {
      border: none;
      flex: 1;
    }

    .email-domain-input input:focus {
      outline: none;
    }

    .hint {
      display: block;
      margin-top: 0.5rem;
      color: #6b7280;
      font-size: 0.875rem;
    }

    .form-actions {
      margin-top: 2rem;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #2563eb;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .info-card {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      max-width: 600px;
    }

    .info-card h3 {
      margin: 0 0 1rem;
      color: #374151;
    }

    .info-card p {
      margin: 0.5rem 0;
      color: #6b7280;
    }

    .setup-banner {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 0.75rem;
      padding: 1rem 1.5rem;
      max-width: 600px;
      margin-bottom: 1.5rem;
    }

    .setup-icon {
      font-size: 1.5rem;
      line-height: 1;
    }

    .setup-banner strong {
      display: block;
      color: #1e40af;
      margin-bottom: 0.25rem;
    }

    .setup-banner p {
      margin: 0;
      color: #3b82f6;
      font-size: 0.875rem;
    }

    .required {
      color: #ef4444;
    }

    .loading, .error {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);

  readonly settings = signal<Settings | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isFirstSetup = signal(false);

  formData: SettingsCreate = {
    company_name: '',
    company_address: '',
    slogan: '',
    email_domain: '',
    logo_url: '',
  };

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading.set(true);
    this.settingsService.getSettings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.isFirstSetup.set(false);
        this.formData = {
          company_name: settings.company_name,
          company_address: settings.company_address || '',
          slogan: settings.slogan || '',
          email_domain: settings.email_domain,
          logo_url: settings.logo_url || '',
        };
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Primera vez — mostrar formulario de setup inicial vacío
          this.isFirstSetup.set(true);
        }
        this.loading.set(false);
      },
    });
  }

  createSettings(): void {
    this.saving.set(true);
    this.settingsService.createSettings(this.formData).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.isFirstSetup.set(false);
        this.saving.set(false);
        alert('Configuración inicial creada exitosamente');
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        alert(err.error?.detail || 'Error al crear la configuración');
      },
    });
  }

  saveSettings(): void {
    this.saving.set(true);
    this.settingsService.updateSettings(this.formData).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.saving.set(false);
        alert('Configuración guardada exitosamente');
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        alert(err.error?.detail || 'Error al guardar configuración');
      },
    });
  }
}
