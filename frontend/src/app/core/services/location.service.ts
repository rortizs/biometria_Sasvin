import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Location, LocationCreate, LocationUpdate } from '../models/location.model';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private api = inject(ApiService);

  getLocations(activeOnly: boolean = true): Observable<Location[]> {
    return this.api.get<Location[]>(`/locations/?active_only=${activeOnly}`);
  }

  getLocation(id: string): Observable<Location> {
    return this.api.get<Location>(`/locations/${id}`);
  }

  createLocation(location: LocationCreate): Observable<Location> {
    return this.api.post<Location>('/locations/', location);
  }

  updateLocation(id: string, location: LocationUpdate): Observable<Location> {
    return this.api.patch<Location>(`/locations/${id}`, location);
  }

  deleteLocation(id: string): Observable<void> {
    return this.api.delete<void>(`/locations/${id}`);
  }
}
