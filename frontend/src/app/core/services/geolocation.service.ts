import { Injectable, signal, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Geolocation } from '@capacitor/geolocation';
import { PlatformService } from './platform.service';
import {
  GeoPosition,
  GeoError,
  GeoConfig,
  GeoErrorCode,
  KIOSK_GEO_CONFIG,
  MOBILE_GEO_CONFIG,
  GEO_ERROR_MESSAGES,
} from '../models/geolocation.model';

export type GeoState = 'idle' | 'acquiring' | 'acquired' | 'error';

@Injectable({
  providedIn: 'root'
})
export class GeolocationService {
  private readonly platformService = inject(PlatformService);

  private readonly _state = signal<GeoState>('idle');
  private readonly _lastPosition = signal<GeoPosition | null>(null);
  private readonly _lastError = signal<GeoError | null>(null);

  readonly state = this._state.asReadonly();
  readonly lastPosition = this._lastPosition.asReadonly();
  readonly lastError = this._lastError.asReadonly();

  getCurrentPosition(config?: Partial<GeoConfig>): Observable<GeoPosition> {
    if (!this.isSupported()) {
      const error = new GeoError(
        'NOT_SUPPORTED',
        GEO_ERROR_MESSAGES.NOT_SUPPORTED
      );
      this._state.set('error');
      this._lastError.set(error);
      return throwError(() => error);
    }

    const finalConfig: GeoConfig = {
      ...(this.platformService.isNative() ? MOBILE_GEO_CONFIG : KIOSK_GEO_CONFIG),
      ...config,
    };

    this._state.set('acquiring');
    this._lastError.set(null);

    if (this.platformService.isNative()) {
      return this.getPositionNative(finalConfig);
    } else {
      return this.getPositionBrowser(finalConfig);
    }
  }

  checkPermission(): Observable<'granted' | 'prompt' | 'denied'> {
    if (this.platformService.isNative()) {
      return from(Geolocation.checkPermissions()).pipe(
        map(result => {
          const state = result.location;
          if (state === 'granted') return 'granted';
          if (state === 'denied') return 'denied';
          return 'prompt';
        }),
        catchError(() => {
          // Fallback if permission check fails
          return from(['prompt'] as const);
        })
      );
    } else {
      // Browser permissions API
      if (!('permissions' in navigator)) {
        // Fallback for browsers without permissions API
        return from(['prompt'] as const);
      }

      return from(
        navigator.permissions.query({ name: 'geolocation' as PermissionName })
      ).pipe(
        map(result => {
          if (result.state === 'granted') return 'granted';
          if (result.state === 'denied') return 'denied';
          return 'prompt';
        }),
        catchError(() => from(['prompt'] as const))
      );
    }
  }

  requestPermission(): Observable<'granted' | 'denied'> {
    if (this.platformService.isNative()) {
      return from(Geolocation.requestPermissions()).pipe(
        map(result => {
          return result.location === 'granted' ? 'granted' : 'denied';
        })
      );
    } else {
      // Browser doesn't have explicit requestPermission - it happens on getCurrentPosition
      // So we just check current state
      return this.checkPermission().pipe(
        map(state => state === 'granted' ? 'granted' : 'denied')
      );
    }
  }

  isSupported(): boolean {
    if (this.platformService.isNative()) {
      return true; // Capacitor always has geolocation
    }
    return 'geolocation' in navigator;
  }

  private getPositionNative(config: GeoConfig): Observable<GeoPosition> {
    return from(
      Geolocation.getCurrentPosition({
        enableHighAccuracy: config.enableHighAccuracy,
        timeout: config.timeout,
        maximumAge: config.maximumAge,
      })
    ).pipe(
      map(position => {
        const geoPos: GeoPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        this._state.set('acquired');
        this._lastPosition.set(geoPos);
        return geoPos;
      }),
      catchError(error => {
        const geoError = this.mapNativeError(error);
        this._state.set('error');
        this._lastError.set(geoError);
        return throwError(() => geoError);
      })
    );
  }

  private getPositionBrowser(config: GeoConfig): Observable<GeoPosition> {
    return from(
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: config.enableHighAccuracy,
          timeout: config.timeout,
          maximumAge: config.maximumAge,
        });
      })
    ).pipe(
      map(position => {
        const geoPos: GeoPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        this._state.set('acquired');
        this._lastPosition.set(geoPos);
        return geoPos;
      }),
      catchError(error => {
        const geoError = this.mapBrowserError(error);
        this._state.set('error');
        this._lastError.set(geoError);
        return throwError(() => geoError);
      })
    );
  }

  private mapBrowserError(error: GeolocationPositionError): GeoError {
    let code: GeoErrorCode;
    let hint: string | undefined;

    switch (error.code) {
      case error.PERMISSION_DENIED:
        code = 'PERMISSION_DENIED';
        hint = 'Abrí la configuración del navegador para habilitar la ubicación';
        break;
      case error.POSITION_UNAVAILABLE:
        code = 'POSITION_UNAVAILABLE';
        break;
      case error.TIMEOUT:
        code = 'TIMEOUT';
        break;
      default:
        code = 'POSITION_UNAVAILABLE';
    }

    return new GeoError(code, GEO_ERROR_MESSAGES[code], hint);
  }

  private mapNativeError(error: any): GeoError {
    // Capacitor geolocation errors don't have standard codes
    // Inspect error message to determine type
    const message = error.message || error.toString();
    
    if (message.toLowerCase().includes('permission')) {
      return new GeoError(
        'PERMISSION_DENIED',
        GEO_ERROR_MESSAGES.PERMISSION_DENIED,
        'Abrí Configuración > Aplicaciones > Sasvin > Permisos para habilitar la ubicación'
      );
    }
    
    if (message.toLowerCase().includes('timeout')) {
      return new GeoError('TIMEOUT', GEO_ERROR_MESSAGES.TIMEOUT);
    }

    return new GeoError('POSITION_UNAVAILABLE', GEO_ERROR_MESSAGES.POSITION_UNAVAILABLE);
  }
}
