import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Settings, SettingsCreate, SettingsUpdate } from '../models/settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private api = inject(ApiService);

  getSettings(): Observable<Settings> {
    return this.api.get<Settings>('/settings/');
  }

  createSettings(settings: SettingsCreate): Observable<Settings> {
    return this.api.post<Settings>('/settings/', settings);
  }

  updateSettings(settings: SettingsUpdate): Observable<Settings> {
    return this.api.put<Settings>('/settings/', settings);
  }
}
