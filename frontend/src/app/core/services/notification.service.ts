import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Notification, UnreadCountResponse } from '../models/notification.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly api = inject(ApiService);

  getAll(): Observable<Notification[]> {
    return this.api.get<Notification[]>('/notifications');
  }

  getUnreadCount(): Observable<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>('/notifications/unread-count');
  }

  markRead(id: string): Observable<Notification> {
    return this.api.patch<Notification>(`/notifications/${id}/read`, {});
  }

  markAllRead(): Observable<void> {
    return this.api.patch<void>('/notifications/read-all', {});
  }
}
