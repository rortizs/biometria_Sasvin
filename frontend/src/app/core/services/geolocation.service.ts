import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeolocationService {

  getCurrentPosition(): Observable<GeoPosition | null> {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      return of(null);
    }

    return from(
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      })
    ).pipe(
      map(position => ({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      })),
      catchError(error => {
        console.warn('Geolocation error:', error.message);
        return of(null);
      })
    );
  }

  isSupported(): boolean {
    return 'geolocation' in navigator;
  }
}
