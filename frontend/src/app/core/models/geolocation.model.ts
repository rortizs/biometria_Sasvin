export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type GeoErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NOT_SUPPORTED';

export class GeoError extends Error {
  constructor(
    public readonly code: GeoErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'GeoError';
  }
}

export interface GeoConfig {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

export const KIOSK_GEO_CONFIG: GeoConfig = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 5000, // Fresh position for walk-up kiosk
};

export const MOBILE_GEO_CONFIG: GeoConfig = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 10000,
};

// Spanish error messages
export const GEO_ERROR_MESSAGES: Record<GeoErrorCode, string> = {
  PERMISSION_DENIED: 'Permiso de ubicación denegado',
  POSITION_UNAVAILABLE: 'GPS no disponible en este dispositivo',
  TIMEOUT: 'No se pudo obtener la ubicación a tiempo',
  NOT_SUPPORTED: 'Geolocalización no soportada en este navegador',
};
