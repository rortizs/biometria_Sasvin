import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { Notification } from '../models/notification.model';

@Injectable({
  providedIn: 'root',
})
export class WebSocketNotificationService {
  private socket: WebSocket | null = null;
  private readonly notificationsSubject = new Subject<Notification>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryCount = 0;
  private readonly maxRetryDelay = 30_000;
  private currentToken: string | null = null;
  private tokenProvider: (() => string | null) | null = null;
  private intentionalDisconnect = false;

  readonly notifications$: Observable<Notification> = this.notificationsSubject.asObservable();

  connect(token: string, tokenProvider?: () => string | null): void {
    this.intentionalDisconnect = false;
    this.currentToken = token;
    this.tokenProvider = tokenProvider ?? null;
    this.retryCount = 0;
    this.openSocket(token);
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.currentToken = null;
    this.clearTimers();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private openSocket(token: string): void {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${protocol}://${host}/api/v1/ws/notifications?token=${token}`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.retryCount = 0;
      this.startPing();
    };

    this.socket.onmessage = (event: MessageEvent) => {
      if (event.data === 'pong') return;
      try {
        const notification: Notification = JSON.parse(event.data as string);
        this.notificationsSubject.next(notification);
      } catch {
        // ignore non-JSON frames
      }
    };

    this.socket.onclose = () => {
      this.clearPing();
      if (!this.intentionalDisconnect && this.currentToken) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send('ping');
      }
    }, 30_000);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(Math.pow(2, this.retryCount) * 1_000, this.maxRetryDelay);
    this.retryCount++;
    this.reconnectTimer = setTimeout(() => {
      if (this.intentionalDisconnect) return;
      const freshToken = this.tokenProvider?.() ?? this.currentToken;
      if (freshToken) {
        this.currentToken = freshToken;
        this.openSocket(freshToken);
      }
    }, delay);
  }

  private clearTimers(): void {
    this.clearPing();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
