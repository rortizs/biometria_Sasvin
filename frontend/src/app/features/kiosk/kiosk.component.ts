import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ViewChild,
  ElementRef,
  computed,
  afterNextRender,
  isDevMode,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { CameraService } from '../../core/services/camera.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { PlatformService } from '../../core/services/platform.service';
import { GeoPosition } from '../../core/models/geolocation.model';
import { AttendanceRecord } from '../../core/models/attendance.model';

type KioskMode = 'idle' | 'scanning' | 'success' | 'error';
type GeoStatus = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-kiosk',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink],
  template: `
    <div class="kiosk-container">
      <!-- Orientation warning overlay for tablets in portrait mode -->
      @if (showOrientationWarning()) {
        <div class="orientation-warning-overlay">
          <div class="orientation-warning-content">
            <div class="rotate-icon">📱 → 📲</div>
            <p class="warning-title">Por favor, rota el dispositivo a horizontal</p>
            <p class="warning-subtitle">Esta aplicación funciona mejor en modo horizontal</p>
          </div>
        </div>
      }

      <!-- Header with clock -->
      <header class="kiosk-header">
        <div class="clock">
          <span class="time">{{ currentTime() }}</span>
          <span class="date">{{ currentDate() }}</span>
        </div>
        <div class="header-center">
          <h1 class="title">Control de Asistencia</h1>
          <div class="geo-status" [class]="geoStatus()">
            @if (geoStatus() === 'loading') {
              <span class="geo-icon">📍</span> Obteniendo ubicación...
            } @else if (geoStatus() === 'success') {
              <span class="geo-icon">✓</span> Ubicación verificada
            } @else if (geoStatus() === 'error') {
              <span class="geo-icon">⚠</span> {{ geoError() }}
            } @else {
              <span class="geo-icon">📍</span> Esperando ubicación
            }
          </div>
        </div>
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
            @if (lastRecord()?.geo_validated !== undefined) {
              <p class="geo-info" [class.valid]="lastRecord()?.geo_validated" [class.invalid]="!lastRecord()?.geo_validated">
                @if (lastRecord()?.geo_validated) {
                  📍 Ubicación validada ({{ lastRecord()?.check_in_distance_meters?.toFixed(0) || lastRecord()?.check_out_distance_meters?.toFixed(0) }}m)
                } @else {
                  ⚠ Fuera de la sede asignada
                }
              </p>
            }
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
            <button 
              class="scan-btn" 
              [disabled]="cameraService.capturing()"
              (click)="scan()"
            >
              @if (cameraService.capturing()) {
                <span class="button-spinner"></span>
                Capturando...
              } @else {
                Marcar Asistencia
              }
            </button>
          }
        </div>
      </main>

      <!-- Footer -->
      <footer class="kiosk-footer">
        <a routerLink="/admin/dashboard" class="admin-link">Administración</a>
        
        <!-- PWA Install Button (only shown when installable and not dismissed) -->
        @if (showInstallButton() && !isStandalone()) {
          <div class="install-prompt">
            <button class="install-btn" (click)="installPWA()">
              <span class="install-icon">📲</span>
              Instalar Aplicación
            </button>
            <button class="dismiss-btn" (click)="dismissInstallPrompt()" title="No mostrar nuevamente">
              ✕
            </button>
          </div>
        }
      </footer>
    </div>
  `,
  styles: [`
    .kiosk-container {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
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

    .header-center {
      text-align: center;
    }

    .title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .geo-status {
      font-size: 0.85rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .geo-status.loading {
      background: rgba(59, 130, 246, 0.3);
      color: #93c5fd;
    }

    .geo-status.success {
      background: rgba(34, 197, 94, 0.3);
      color: #86efac;
    }

    .geo-status.error {
      background: rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }

    .geo-icon {
      font-size: 1rem;
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

    .geo-info {
      font-size: 0.85rem;
      margin-top: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 0.25rem;
    }

    .geo-info.valid {
      background: rgba(34, 197, 94, 0.2);
      color: #86efac;
    }

    .geo-info.invalid {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }

    .mode-selector {
      display: flex;
      gap: 1rem;
    }

    .mode-btn {
      /* Touch target: min 44x44px for tablets */
      min-height: 44px;
      min-width: 44px;
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
      /* Touch target: min 44x44px for tablets */
      min-height: 44px;
      min-width: 44px;
      padding: 1rem 3rem;
      font-size: 1.2rem;
      font-weight: 600;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .scan-btn:hover:not(:disabled) {
      background: #2563eb;
      transform: scale(1.02);
    }

    .scan-btn:active:not(:disabled) {
      transform: scale(0.98);
    }

    .scan-btn:disabled {
      background: rgba(59, 130, 246, 0.5);
      cursor: not-allowed;
      opacity: 0.7;
    }

    .button-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .kiosk-footer {
      padding: 1rem;
      text-align: center;
      background: rgba(0, 0, 0, 0.3);
    }

    .admin-link {
      /* Touch target: min 44x44px via padding */
      display: inline-block;
      min-height: 44px;
      min-width: 44px;
      padding: 0.75rem 1rem;
      color: rgba(255, 255, 255, 0.5);
      text-decoration: none;
      font-size: 0.9rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .admin-link:hover {
      color: white;
    }

    /* PWA Install Prompt Styles */
    .install-prompt {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding: 0.5rem;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 0.5rem;
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .install-btn {
      /* Touch target: min 44x44px */
      min-height: 44px;
      min-width: 44px;
      padding: 0.75rem 1.25rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .install-btn:hover {
      background: #2563eb;
      transform: scale(1.02);
    }

    .install-btn:active {
      transform: scale(0.98);
    }

    .install-icon {
      font-size: 1.2rem;
    }

    .dismiss-btn {
      /* Touch target: min 44x44px */
      min-height: 44px;
      min-width: 44px;
      padding: 0.5rem;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.6);
      border: none;
      border-radius: 0.375rem;
      font-size: 1.2rem;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .dismiss-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    /* Hide install prompt in standalone mode (already installed) */
    @media (display-mode: standalone) {
      .install-prompt {
        display: none !important;
      }
    }

    /* Orientation warning overlay for tablets */
    .orientation-warning-overlay {
      position: fixed;
      inset: 0;
      background: rgba(10, 14, 23, 0.98);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      backdrop-filter: blur(8px);
    }

    .orientation-warning-content {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }

    .rotate-icon {
      font-size: 4rem;
      margin-bottom: 1.5rem;
      animation: rotateDevice 2s ease-in-out infinite;
    }

    @keyframes rotateDevice {
      0%, 100% {
        transform: rotate(0deg);
      }
      50% {
        transform: rotate(90deg);
      }
    }

    .warning-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: white;
    }

    .warning-subtitle {
      font-size: 1rem;
      opacity: 0.7;
      color: white;
    }

    /* Hide orientation warning on phones (max-width: 600px) */
    @media (max-width: 600px) {
      .orientation-warning-overlay {
        display: none !important;
      }
    }

    /* Hide orientation warning on desktop (min-width: 1024px) */
    @media (min-width: 1024px) {
      .orientation-warning-overlay {
        display: none !important;
      }
    }
  `],
})
export class KioskComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  readonly cameraService = inject(CameraService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly platformService = inject(PlatformService);
  private readonly swUpdate = inject(SwUpdate);

  private clockInterval?: ReturnType<typeof setInterval>;
  private resultTimeout?: ReturnType<typeof setTimeout>;
  private orientationMediaQuery?: MediaQueryList;
  private orientationChangeHandler?: () => void;
  private updateCheckInterval?: ReturnType<typeof setInterval>;
  private idleStartTime: number | null = null;
  private hasUpdateAvailable = false;

  readonly mode = signal<KioskMode>('idle');
  readonly isCheckIn = signal(true);
  readonly lastRecord = signal<AttendanceRecord | null>(null);
  readonly errorMessage = signal<string>('');

  readonly currentTime = signal(this.formatTime(new Date()));
  readonly currentDate = signal(this.formatDate(new Date()));

  readonly geoStatus = signal<GeoStatus>('idle');
  readonly geoError = signal<string>('');
  private currentPosition: GeoPosition | null = null;

  // Orientation handling for tablets: portrait orientation signal
  private readonly isPortrait = signal(false);
  
  // Show warning when tablet is in portrait mode (landscape recommended)
  readonly showOrientationWarning = computed(() => 
    this.platformService.isTablet() && this.isPortrait()
  );

  // PWA install prompt handling for kiosk tablets
  private deferredPrompt: any = null;
  readonly showInstallButton = signal(false);
  readonly isStandalone = signal(false);

  ngOnInit(): void {
    this.startClock();
    this.requestGeolocation();
    this.setupOrientationListener();
    this.setupPWAInstallPrompt();
  }

  private requestGeolocation(): void {
    if (!this.geolocationService.isSupported()) {
      this.geoError.set('Geolocalización no soportada');
      this.geoStatus.set('error');
      return;
    }

    this.geoStatus.set('loading');
    this.geolocationService.getCurrentPosition().subscribe({
      next: (position) => {
        if (position) {
          this.currentPosition = position;
          this.geoStatus.set('success');
        } else {
          this.geoError.set('No se pudo obtener la ubicación');
          this.geoStatus.set('error');
        }
      },
    });
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
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }
    this.cleanupOrientationListener();
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

  async scan(): Promise<void> {
    // Capture 3 frames with 250ms delay for anti-spoofing
    const images = await this.cameraService.captureFrames(3, 250);
    
    if (!images || images.length === 0) {
      this.errorMessage.set('No se pudo capturar la imagen');
      this.mode.set('error');
      return;
    }

    this.mode.set('scanning');

    const request: { images: string[]; latitude?: number; longitude?: number } = { images };

    if (this.currentPosition) {
      request.latitude = this.currentPosition.latitude;
      request.longitude = this.currentPosition.longitude;
    }

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

  /**
   * Setup orientation change listener for tablets.
   * Shows warning overlay when tablet is in portrait mode.
   * Phones (width <= 600px) and desktop (width >= 1024px) are excluded via CSS.
   */
  private setupOrientationListener(): void {
    // Only set up listener for tablets (determined by PlatformService)
    const isTablet = this.platformService.isTablet();
    
    if (!isTablet) {
      // Skip orientation handling on phones and desktop
      return;
    }

    // Create MediaQueryList for orientation detection
    this.orientationMediaQuery = window.matchMedia('(orientation: portrait)');
    
    // Initial check
    this.updateOrientationState();
    
    // Create handler function
    this.orientationChangeHandler = () => this.updateOrientationState();
    
    // Add listener for orientation changes
    this.orientationMediaQuery.addEventListener('change', this.orientationChangeHandler);
  }

  /**
   * Update orientation state signal.
   * The showOrientationWarning computed signal will show the overlay when tablet is in portrait mode.
   */
  private updateOrientationState(): void {
    if (!this.orientationMediaQuery) {
      return;
    }

    const isPortraitMode = this.orientationMediaQuery.matches;
    
    // Update portrait signal (showOrientationWarning is computed from this)
    this.isPortrait.set(isPortraitMode);
  }

  /**
   * Clean up orientation change listener on component destroy.
   */
  private cleanupOrientationListener(): void {
    if (this.orientationMediaQuery && this.orientationChangeHandler) {
      this.orientationMediaQuery.removeEventListener('change', this.orientationChangeHandler);
    }
  }

  /**
   * Setup PWA install prompt handling for kiosk tablets.
   * Listens for beforeinstallprompt event and displays install button when available.
   * Also checks if app is already installed (standalone mode).
   */
  private setupPWAInstallPrompt(): void {
    // Check if already installed (standalone mode)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    
    this.isStandalone.set(isStandalone);

    // If already installed, no need to show install button
    if (isStandalone) {
      return;
    }

    // Check if install prompt was dismissed before (localStorage flag)
    const installDismissed = localStorage.getItem('pwa-install-dismissed');
    if (installDismissed === 'true') {
      return;
    }

    // Listen for beforeinstallprompt event (Chrome/Edge on Android)
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      this.deferredPrompt = e;
      // Show the install button
      this.showInstallButton.set(true);
    });

    // Listen for appinstalled event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.showInstallButton.set(false);
      this.isStandalone.set(true);
    });
  }

  /**
   * Trigger PWA install prompt when user clicks install button.
   */
  async installPWA(): Promise<void> {
    if (!this.deferredPrompt) {
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferred prompt
    this.deferredPrompt = null;
    this.showInstallButton.set(false);
  }

  /**
   * Dismiss install prompt and don't show again (save to localStorage).
   */
  dismissInstallPrompt(): void {
    localStorage.setItem('pwa-install-dismissed', 'true');
    this.showInstallButton.set(false);
    this.deferredPrompt = null;
  }
}
