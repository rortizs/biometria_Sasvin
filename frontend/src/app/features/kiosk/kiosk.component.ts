import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CameraService } from '../../core/services/camera.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { AttendanceRecord } from '../../core/models/attendance.model';

type KioskMode = 'idle' | 'scanning' | 'success' | 'error';

@Component({
  selector: 'app-kiosk',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="kiosk-container">
      <!-- Header with clock -->
      <header class="kiosk-header">
        <div class="clock">
          <span class="time">{{ currentTime() }}</span>
          <span class="date">{{ currentDate() }}</span>
        </div>
        <h1 class="title">Control de Asistencia</h1>
      </header>

      <!-- Main content -->
      <main class="kiosk-main">
        <!-- Camera view -->
        <div class="camera-container" [class.scanning]="mode() === 'scanning'">
          <video #videoElement autoplay playsinline muted class="camera-video"></video>
          <div class="camera-overlay">
            <div class="face-frame"></div>
          </div>
          @if (mode() === 'scanning') {
            <div class="scanning-indicator">
              <div class="spinner"></div>
              <span>Verificando rostro...</span>
            </div>
          }
        </div>

        <!-- Result panel -->
        @if (mode() === 'success' && lastRecord()) {
          <div class="result-panel success">
            <div class="result-icon">✓</div>
            <h2>¡Bienvenido!</h2>
            <p class="employee-name">{{ lastRecord()?.employee_name }}</p>
            <p class="check-time">
              {{ isCheckIn() ? 'Entrada' : 'Salida' }}:
              {{ lastRecord()?.check_in || lastRecord()?.check_out | date: 'HH:mm' }}
            </p>
            <p class="confidence">Confianza: {{ (lastRecord()?.confidence ?? 0) * 100 | number: '1.0-0' }}%</p>
          </div>
        }

        @if (mode() === 'error') {
          <div class="result-panel error">
            <div class="result-icon">✗</div>
            <h2>Error</h2>
            <p>{{ errorMessage() }}</p>
          </div>
        }

        <!-- Mode selector -->
        <div class="mode-selector">
          <button
            class="mode-btn"
            [class.active]="isCheckIn()"
            (click)="setCheckIn(true)"
          >
            Entrada
          </button>
          <button
            class="mode-btn"
            [class.active]="!isCheckIn()"
            (click)="setCheckIn(false)"
          >
            Salida
          </button>
        </div>

        <!-- Instructions -->
        <div class="instructions">
          @if (mode() === 'idle') {
            <p>Posicione su rostro frente a la cámara</p>
            <button class="scan-btn" (click)="scan()">Marcar Asistencia</button>
          }
        </div>
      </main>

      <!-- Footer -->
      <footer class="kiosk-footer">
        <a routerLink="/admin/dashboard" class="admin-link">Administración</a>
      </footer>
    </div>
  `,
  styles: [`
    .kiosk-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .kiosk-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 2rem;
      background: rgba(0, 0, 0, 0.3);
    }

    .clock {
      display: flex;
      flex-direction: column;
    }

    .clock .time {
      font-size: 2.5rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .clock .date {
      font-size: 1rem;
      opacity: 0.8;
    }

    .title {
      font-size: 1.5rem;
      font-weight: 600;
    }

    .kiosk-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      gap: 2rem;
    }

    .camera-container {
      position: relative;
      width: 100%;
      max-width: 500px;
      aspect-ratio: 4/3;
      border-radius: 1rem;
      overflow: hidden;
      background: #000;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    }

    .camera-container.scanning {
      box-shadow: 0 0 30px rgba(59, 130, 246, 0.5);
    }

    .camera-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }

    .camera-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .face-frame {
      width: 60%;
      height: 80%;
      border: 3px dashed rgba(255, 255, 255, 0.5);
      border-radius: 50%;
    }

    .scanning-indicator {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      gap: 1rem;
    }

    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .result-panel {
      padding: 2rem;
      border-radius: 1rem;
      text-align: center;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .result-panel.success {
      background: rgba(34, 197, 94, 0.2);
      border: 2px solid #22c55e;
    }

    .result-panel.error {
      background: rgba(239, 68, 68, 0.2);
      border: 2px solid #ef4444;
    }

    .result-icon {
      font-size: 3rem;
      margin-bottom: 0.5rem;
    }

    .employee-name {
      font-size: 1.5rem;
      font-weight: 600;
    }

    .check-time {
      font-size: 1.2rem;
      opacity: 0.9;
    }

    .confidence {
      font-size: 0.9rem;
      opacity: 0.7;
    }

    .mode-selector {
      display: flex;
      gap: 1rem;
    }

    .mode-btn {
      padding: 0.75rem 2rem;
      font-size: 1rem;
      font-weight: 500;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 0.5rem;
      background: transparent;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
    }

    .mode-btn:hover {
      border-color: rgba(255, 255, 255, 0.5);
    }

    .mode-btn.active {
      background: #3b82f6;
      border-color: #3b82f6;
    }

    .instructions {
      text-align: center;
    }

    .instructions p {
      margin-bottom: 1rem;
      opacity: 0.8;
    }

    .scan-btn {
      padding: 1rem 3rem;
      font-size: 1.2rem;
      font-weight: 600;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .scan-btn:hover {
      background: #2563eb;
      transform: scale(1.02);
    }

    .scan-btn:active {
      transform: scale(0.98);
    }

    .kiosk-footer {
      padding: 1rem;
      text-align: center;
      background: rgba(0, 0, 0, 0.3);
    }

    .admin-link {
      color: rgba(255, 255, 255, 0.5);
      text-decoration: none;
      font-size: 0.9rem;
    }

    .admin-link:hover {
      color: white;
    }
  `],
})
export class KioskComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  private readonly cameraService = inject(CameraService);
  private readonly attendanceService = inject(AttendanceService);

  private clockInterval?: ReturnType<typeof setInterval>;
  private resultTimeout?: ReturnType<typeof setTimeout>;

  readonly mode = signal<KioskMode>('idle');
  readonly isCheckIn = signal(true);
  readonly lastRecord = signal<AttendanceRecord | null>(null);
  readonly errorMessage = signal<string>('');

  readonly currentTime = signal(this.formatTime(new Date()));
  readonly currentDate = signal(this.formatDate(new Date()));

  ngOnInit(): void {
    this.startClock();
  }

  ngAfterViewInit(): void {
    this.startCamera();
  }

  ngOnDestroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
    if (this.resultTimeout) {
      clearTimeout(this.resultTimeout);
    }
    this.cameraService.stop();
  }

  private startClock(): void {
    this.clockInterval = setInterval(() => {
      const now = new Date();
      this.currentTime.set(this.formatTime(now));
      this.currentDate.set(this.formatDate(now));
    }, 1000);
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  async startCamera(): Promise<void> {
    try {
      await this.cameraService.start(this.videoElement.nativeElement);
    } catch (error) {
      this.errorMessage.set('No se pudo acceder a la cámara');
      this.mode.set('error');
    }
  }

  setCheckIn(value: boolean): void {
    this.isCheckIn.set(value);
  }

  scan(): void {
    const image = this.cameraService.captureFrame();
    if (!image) {
      this.errorMessage.set('No se pudo capturar la imagen');
      this.mode.set('error');
      return;
    }

    this.mode.set('scanning');

    const request = { image };
    const action$ = this.isCheckIn()
      ? this.attendanceService.checkIn(request)
      : this.attendanceService.checkOut(request);

    action$.subscribe({
      next: (record) => {
        this.lastRecord.set(record);
        this.mode.set('success');
        this.resetAfterDelay();
      },
      error: (error) => {
        this.errorMessage.set(
          error.error?.detail || 'Error al procesar la solicitud'
        );
        this.mode.set('error');
        this.resetAfterDelay();
      },
    });
  }

  private resetAfterDelay(): void {
    this.resultTimeout = setTimeout(() => {
      this.mode.set('idle');
      this.lastRecord.set(null);
      this.errorMessage.set('');
    }, 5000);
  }
}
