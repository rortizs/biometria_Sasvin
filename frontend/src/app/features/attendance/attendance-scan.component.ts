import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ViewChild,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CameraService } from '../../core/services/camera.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { GeoPosition } from '../../core/models/geolocation.model';
import { AttendanceRecord } from '../../core/models/attendance.model';
import { HttpErrorResponse } from '@angular/common/http';

type ScanMode = 'idle' | 'scanning' | 'success' | 'error';

@Component({
  selector: 'app-attendance-scan',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="attendance-container">
      <!-- Camera Preview Area (60% height) -->
      <div class="camera-area">
        <video
          #videoElement
          autoplay
          playsinline
          muted
          class="camera-video"
        ></video>

        <!-- Face Guide Overlay -->
        <div class="face-overlay">
          <div class="face-guide"></div>
        </div>

        <!-- Permission Denied Message -->
        @if (cameraError()) {
          <div class="permission-error">
            <div class="error-icon">📷</div>
            <p class="error-title">Se necesita acceso a la cámara</p>
            <p class="error-message">{{ cameraError() }}</p>
            <button class="settings-btn" (click)="openSettings()">
              Abrir Configuración
            </button>
          </div>
        }

        <!-- Scanning Indicator -->
        @if (mode() === 'scanning') {
          <div class="scanning-overlay">
            <div class="spinner"></div>
            <p>Verificando rostro...</p>
          </div>
        }
      </div>

      <!-- Controls Area (40% height) -->
      <div class="controls-area">
        <!-- Instruction Text -->
        <p class="instruction-text">Centrá tu rostro y presioná escanear</p>

        <!-- GPS Status Badge -->
        <div class="gps-status" [class]="geoStatusClass()">
          @if (geoService.state() === 'acquiring') {
            <span class="gps-icon">📍</span>
            <span class="gps-text">Obteniendo ubicación...</span>
          } @else if (geoService.state() === 'acquired') {
            <span class="gps-icon">✓</span>
            <span class="gps-text">Ubicación obtenida</span>
            @if (lastGeoPosition() && lastGeoPosition()!.accuracy > 100) {
              <span class="gps-accuracy">({{ lastGeoPosition()!.accuracy.toFixed(0) }}m)</span>
            }
          } @else if (geoService.state() === 'error') {
            <span class="gps-icon">⚠</span>
            <span class="gps-text">{{ geoErrorMessage() }}</span>
          } @else {
            <span class="gps-icon">📍</span>
            <span class="gps-text">GPS inactivo</span>
          }
        </div>

        <!-- Scan Button -->
        <button
          class="scan-button"
          [disabled]="!canScan()"
          (click)="handleScan()"
        >
          @if (cameraService.capturing()) {
            <span class="button-spinner"></span>
            <span>Capturando...</span>
          } @else {
            <span>Escanear Rostro</span>
          }
        </button>

        <!-- Result Overlay (Tasks 3.2) -->
        @if (mode() === 'success' && lastRecord()) {
          <div class="result-overlay success">
            <div class="result-icon">✓</div>
            <h2 class="employee-name">{{ lastRecord()?.employee_name }}</h2>
            <p class="check-type">{{ isCheckIn() ? 'ENTRADA' : 'SALIDA' }}</p>
            <p class="check-time">
              {{ lastRecord()?.check_in || lastRecord()?.check_out | date: 'HH:mm' }}
            </p>
            @if (lastRecord()?.geo_validated !== undefined) {
              <p class="geo-status-result" [class.valid]="lastRecord()?.geo_validated">
                @if (lastRecord()?.geo_validated) {
                  ✓ Ubicación validada
                } @else {
                  ⚠ Fuera de la sede asignada
                }
              </p>
            }
          </div>
        }

        @if (mode() === 'error') {
          <div class="result-overlay error">
            <div class="result-icon">✗</div>
            <h2>Error</h2>
            <p class="error-description">{{ errorMessage() }}</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .attendance-container {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      background: linear-gradient(135deg, #0a0e17 0%, #1a1f2e 100%);
      overflow: hidden;
    }

    /* Camera Area - 60% */
    .camera-area {
      position: relative;
      height: 60%;
      background: #000;
      overflow: hidden;
    }

    .camera-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .face-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .face-guide {
      width: 240px;
      height: 320px;
      border: 3px solid rgba(74, 222, 128, 0.8);
      border-radius: 50%;
      box-shadow: 
        0 0 0 9999px rgba(0, 0, 0, 0.4),
        0 0 20px rgba(74, 222, 128, 0.5);
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        border-color: rgba(74, 222, 128, 0.8);
        box-shadow: 
          0 0 0 9999px rgba(0, 0, 0, 0.4),
          0 0 20px rgba(74, 222, 128, 0.5);
      }
      50% {
        border-color: rgba(74, 222, 128, 1);
        box-shadow: 
          0 0 0 9999px rgba(0, 0, 0, 0.4),
          0 0 30px rgba(74, 222, 128, 0.8);
      }
    }

    .permission-error {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      padding: 2rem;
      background: rgba(15, 23, 42, 0.95);
      border-radius: 12px;
      max-width: 320px;
      width: 90%;
    }

    .error-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .error-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 0.5rem;
    }

    .error-message {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }

    .settings-btn {
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      min-height: 48px;
      min-width: 48px;
    }

    .settings-btn:hover {
      background: #2563eb;
    }

    .scanning-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.125rem;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Controls Area - 40% */
    .controls-area {
      position: relative;
      height: 40%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.5rem;
      gap: 1.5rem;
    }

    .instruction-text {
      font-size: 1.125rem;
      color: #cbd5e1;
      text-align: center;
      margin: 0;
    }

    .gps-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      font-size: 0.875rem;
      transition: all 0.3s;
    }

    .gps-status.idle {
      background: rgba(71, 85, 105, 0.3);
      color: #94a3b8;
    }

    .gps-status.acquiring {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .gps-status.acquired {
      background: rgba(34, 197, 94, 0.2);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .gps-status.error {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .gps-icon {
      font-size: 1.25rem;
    }

    .gps-text {
      font-weight: 500;
    }

    .gps-accuracy {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .scan-button {
      width: 100%;
      max-width: 320px;
      min-height: 56px;
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1.125rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .scan-button:hover:not(:disabled) {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
    }

    .scan-button:active:not(:disabled) {
      transform: translateY(0);
    }

    .scan-button:disabled {
      background: rgba(71, 85, 105, 0.5);
      cursor: not-allowed;
      box-shadow: none;
      opacity: 0.6;
    }

    .button-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Result Overlays */
    .result-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
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

    .result-overlay.success {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(21, 128, 61, 0.95) 100%);
      color: white;
    }

    .result-overlay.error {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.95) 100%);
      color: white;
    }

    .result-icon {
      font-size: 4rem;
      font-weight: bold;
      margin-bottom: 1rem;
    }

    .employee-name {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
    }

    .check-type {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .check-time {
      font-size: 1.125rem;
      margin: 0 0 1rem 0;
      opacity: 0.9;
    }

    .geo-status-result {
      font-size: 0.875rem;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      margin: 0;
    }

    .geo-status-result.valid {
      background: rgba(255, 255, 255, 0.2);
    }

    .error-description {
      font-size: 1rem;
      margin: 0;
      line-height: 1.5;
      max-width: 280px;
    }
  `],
})
export class AttendanceScanComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElementRef!: ElementRef<HTMLVideoElement>;

  readonly cameraService = inject(CameraService);
  readonly geoService = inject(GeolocationService);
  private readonly attendanceService = inject(AttendanceService);

  readonly mode = signal<ScanMode>('idle');
  readonly cameraError = signal<string | null>(null);
  readonly lastRecord = signal<AttendanceRecord | null>(null);
  readonly errorMessage = signal<string>('');
  readonly lastGeoPosition = signal<GeoPosition | null>(null);

  // Auto-dismiss timer
  private autoDismissTimer: number | null = null;

  constructor() {
    // Start GPS acquisition in constructor (afterNextRender for camera)
    afterNextRender(() => {
      this.initializeCamera();
      this.startGPSAcquisition();
    });
  }

  ngOnInit(): void {
    // Initialization handled in afterNextRender
  }

  ngOnDestroy(): void {
    this.cameraService.stop();
    this.clearAutoDismissTimer();
  }

  private async initializeCamera(): Promise<void> {
    try {
      const videoEl = this.videoElementRef.nativeElement;
      await this.cameraService.start(videoEl, { facingMode: 'user' });
      this.cameraError.set(null);
    } catch (error) {
      console.error('Camera initialization failed:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.message.includes('Permission denied')) {
          this.cameraError.set('Permiso de cámara denegado');
        } else if (error.name === 'NotFoundError') {
          this.cameraError.set('No se encontró cámara en el dispositivo');
        } else {
          this.cameraError.set('Error al iniciar la cámara');
        }
      }
    }
  }

  private startGPSAcquisition(): void {
    this.geoService.getCurrentPosition().subscribe({
      next: (position) => {
        this.lastGeoPosition.set(position);
      },
      error: (error) => {
        console.warn('GPS acquisition failed:', error);
        // Don't block scan - backend validates location
      },
    });
  }

  canScan(): boolean {
    return (
      this.cameraService.active() &&
      !this.cameraService.capturing() &&
      this.mode() === 'idle' &&
      !this.cameraError()
    );
  }

  async handleScan(): Promise<void> {
    if (!this.canScan()) return;

    this.mode.set('scanning');
    this.clearAutoDismissTimer();

    try {
      // Capture 3 frames with 250ms delay
      const frames = await this.cameraService.captureFrames(3, 250);

      if (!frames || frames.length === 0) {
        throw new Error('No se pudieron capturar imágenes');
      }

      // Get GPS position if available
      const geoPos = this.lastGeoPosition();

      // Determine check-in vs check-out (for now, always check-in - could be enhanced)
      // TODO: Add logic to determine if it's check-in or check-out based on last record
      const request = {
        images: frames,
        latitude: geoPos?.latitude,
        longitude: geoPos?.longitude,
      };

      // Send to backend
      this.attendanceService.checkIn(request).subscribe({
        next: (record) => {
          this.lastRecord.set(record);
          this.mode.set('success');
          this.autoDismissAfter(5000); // 5 seconds for success
        },
        error: (error: HttpErrorResponse) => {
          this.handleError(error);
        },
      });
    } catch (error) {
      console.error('Scan error:', error);
      this.errorMessage.set('Error al capturar las imágenes');
      this.mode.set('error');
      this.autoDismissAfter(4000);
    }
  }

  private handleError(error: HttpErrorResponse): void {
    let message = 'Error desconocido';
    let dismissTime = 4000;

    if (error.status === 400) {
      // Anti-spoofing rejection
      message = 'No se detectó un rostro real. Mirá directo a la cámara e intentá de nuevo.';
    } else if (error.status === 404) {
      // Face not recognized
      message = 'Rostro no reconocido. Asegurate de tener tu rostro registrado en el sistema.';
    } else if (error.status === 0 || error.status >= 500) {
      // Network error
      message = 'Error de conexión. Verificá tu conexión a internet e intentá de nuevo.';
      dismissTime = 5000;
    } else {
      message = error.error?.message || 'Error al procesar la solicitud';
    }

    this.errorMessage.set(message);
    this.mode.set('error');
    this.autoDismissAfter(dismissTime);
  }

  private autoDismissAfter(ms: number): void {
    this.clearAutoDismissTimer();
    this.autoDismissTimer = window.setTimeout(() => {
      this.resetToIdle();
    }, ms);
  }

  private clearAutoDismissTimer(): void {
    if (this.autoDismissTimer !== null) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }

  private resetToIdle(): void {
    this.mode.set('idle');
    this.lastRecord.set(null);
    this.errorMessage.set('');
    // Re-acquire GPS for next scan
    this.startGPSAcquisition();
  }

  geoStatusClass(): string {
    const state = this.geoService.state();
    return state;
  }

  geoErrorMessage(): string {
    const error = this.geoService.lastError();
    return error?.message || 'Error de ubicación';
  }

  isCheckIn(): boolean {
    const record = this.lastRecord();
    return record?.check_in !== null && record?.check_in !== undefined;
  }

  openSettings(): void {
    // For Capacitor, this would open native settings
    // For browser, provide instructions
    alert('Por favor, ve a la configuración de tu navegador o dispositivo para habilitar el acceso a la cámara.');
  }
}
