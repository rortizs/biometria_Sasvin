import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Settings, SettingsUpdate } from '../models/settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private api = inject(ApiService);

  getSettings(): Observable<Settings> {
    return this.api.get<Settings>('/settings/');
  }

  updateSettings(settings: SettingsUpdate): Observable<Settings> {
    return this.api.put<Settings>('/settings/', settings);
  }
}
