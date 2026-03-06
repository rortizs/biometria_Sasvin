import { Injectable, signal, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import { App } from '@capacitor/app';

export interface CameraConfig {
  width: number;
  height: number;
  facingMode: 'user' | 'environment';
  maxCaptureWidth: number;
  jpegQuality: number;
}

const DEFAULT_CONFIG: CameraConfig = {
  width: 1280,
  height: 960,
  facingMode: 'user',
  maxCaptureWidth: 1280,
  jpegQuality: 0.8,
};

// Resolution fallback chain: try high-res first, fall back to lower resolutions
const RESOLUTION_CHAIN: Array<{ width: number; height: number }> = [
  { width: 1280, height: 960 },
  { width: 960, height: 720 },
  { width: 640, height: 480 },
];

@Injectable({
  providedIn: 'root',
})
export class CameraService {
  private readonly platformService = inject(PlatformService);

  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private visibilityHandler: (() => void) | null = null;
  private appStateListener: any = null;
  private wasPausedByVisibility = false;

  private readonly isActive = signal(false);
  private readonly hasError = signal<string | null>(null);
  private readonly isCapturing = signal(false);

  readonly active = this.isActive.asReadonly();
  readonly error = this.hasError.asReadonly();
  readonly capturing = this.isCapturing.asReadonly();

  async start(videoEl: HTMLVideoElement, config: Partial<CameraConfig> = {}): Promise<void> {
    const finalConfig = { 
      ...DEFAULT_CONFIG, 
      ...config,
      jpegQuality: this.platformService.jpegQuality()
    };

    // Try resolution fallback chain
    let lastError: Error | null = null;
    
    for (const resolution of RESOLUTION_CHAIN) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
            facingMode: finalConfig.facingMode,
          },
          audio: false,
        });
        break; // Success, exit loop
      } catch (error) {
        lastError = error as Error;
        // OverconstrainedError means this resolution is not supported, try next
        if (error instanceof Error && error.name !== 'OverconstrainedError') {
          // Other errors (permission denied, etc.) should fail immediately
          throw error;
        }
      }
    }

    // If all resolutions failed, try unconstrained (no resolution requirement)
    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: finalConfig.facingMode },
          audio: false,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to access camera';
        this.hasError.set(errorMessage);
        throw new Error(errorMessage);
      }
    }

    // Set video attributes for mobile compatibility
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('muted', 'true');
    videoEl.setAttribute('autoplay', 'true');
    
    videoEl.srcObject = this.stream;
    await videoEl.play();

    this.videoElement = videoEl;
    this.isActive.set(true);
    this.hasError.set(null);
    
    // Set up visibility change listeners
    this.setupVisibilityListeners();
  }

  stop(): void {
    this.removeVisibilityListeners();
    
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.isActive.set(false);
    this.wasPausedByVisibility = false;
  }

  pause(): void {
    if (this.stream && this.isActive()) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.isActive.set(false);
    }
  }

  async resume(): Promise<void> {
    if (!this.videoElement || this.isActive()) {
      return;
    }

    // Re-acquire stream with the same config
    try {
      await this.start(this.videoElement);
    } catch (error) {
      console.error('Failed to resume camera:', error);
    }
  }

  captureFrame(): string | null {
    if (!this.videoElement || !this.isActive()) {
      return null;
    }

    const maxWidth = DEFAULT_CONFIG.maxCaptureWidth;
    const videoWidth = this.videoElement.videoWidth;
    const videoHeight = this.videoElement.videoHeight;

    // Scale down if video exceeds max width
    let canvasWidth = videoWidth;
    let canvasHeight = videoHeight;
    
    if (videoWidth > maxWidth) {
      canvasWidth = maxWidth;
      canvasHeight = Math.floor((videoHeight / videoWidth) * maxWidth);
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.drawImage(this.videoElement, 0, 0, canvasWidth, canvasHeight);
    
    // Use platform-appropriate JPEG quality
    const quality = this.platformService.jpegQuality();
    return canvas.toDataURL('image/jpeg', quality);
  }

  async captureFrames(count: number = 3, delayMs: number = 250): Promise<string[]> {
    // Double-tap guard
    if (this.isCapturing()) {
      return [];
    }

    this.isCapturing.set(true);
    const frames: string[] = [];

    try {
      for (let i = 0; i < count; i++) {
        const frame = this.captureFrame();
        if (frame) {
          frames.push(frame);
        }
        
        // Wait between captures (except after the last one)
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    } finally {
      this.isCapturing.set(false);
    }

    return frames;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  private setupVisibilityListeners(): void {
    // Browser visibility change listener
    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.wasPausedByVisibility = true;
        this.pause();
      } else if (document.visibilityState === 'visible' && this.wasPausedByVisibility) {
        this.wasPausedByVisibility = false;
        this.resume();
      }
    };
    
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Capacitor app state listener
    if (this.platformService.isNative()) {
      this.appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          this.wasPausedByVisibility = true;
          this.pause();
        } else if (this.wasPausedByVisibility) {
          this.wasPausedByVisibility = false;
          this.resume();
        }
      });
    }
  }

  private removeVisibilityListeners(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = null;
    }
    
    this.wasPausedByVisibility = false;
  }
}
