import { Injectable, signal } from '@angular/core';

export interface CameraConfig {
  width: number;
  height: number;
  facingMode: 'user' | 'environment';
}

const DEFAULT_CONFIG: CameraConfig = {
  width: 640,
  height: 480,
  facingMode: 'user',
};

@Injectable({
  providedIn: 'root',
})
export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  private readonly isActive = signal(false);
  private readonly hasError = signal<string | null>(null);

  readonly active = this.isActive.asReadonly();
  readonly error = this.hasError.asReadonly();

  async start(videoEl: HTMLVideoElement, config: Partial<CameraConfig> = {}): Promise<void> {
    const { width, height, facingMode } = { ...DEFAULT_CONFIG, ...config };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode,
        },
        audio: false,
      });

      videoEl.srcObject = this.stream;
      await videoEl.play();

      this.videoElement = videoEl;
      this.isActive.set(true);
      this.hasError.set(null);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to access camera';
      this.hasError.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.isActive.set(false);
  }

  captureFrame(): string | null {
    if (!this.videoElement || !this.isActive()) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.drawImage(this.videoElement, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }
}
