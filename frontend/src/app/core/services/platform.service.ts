import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export type PlatformType = 'ios' | 'android' | 'web';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly _isNative = signal(Capacitor.isNativePlatform());
  private readonly _platform = signal<PlatformType>(
    Capacitor.getPlatform() as PlatformType
  );

  readonly isNative = this._isNative.asReadonly();
  readonly isBrowser = signal(!Capacitor.isNativePlatform()).asReadonly();
  readonly platform = this._platform.asReadonly();

  /** Heuristic: tablet if screen shortest side > 600px */
  readonly isTablet = signal(
    Math.min(window.innerWidth, window.innerHeight) > 600
  ).asReadonly();

  /** True if running inside Capacitor AND on iOS */
  isIOS(): boolean {
    return this._platform() === 'ios';
  }

  /** True if running inside Capacitor AND on Android */
  isAndroid(): boolean {
    return this._platform() === 'android';
  }

  /** JPEG quality for image capture: 0.7 for mobile/tablet, 0.8 for desktop */
  jpegQuality(): number {
    return this._isNative() || this.isTablet() ? 0.7 : 0.8;
  }
}
