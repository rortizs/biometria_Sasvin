import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../services/notification.service';
import { WebSocketNotificationService } from '../../services/websocket-notification.service';
import { Notification } from '../../models/notification.model';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bell-wrapper">
      <button class="bell-btn" (click)="toggleDropdown()" aria-label="Notificaciones">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        @if (unreadCount() > 0) {
          <span class="badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
        }
      </button>

      @if (open()) {
        <div class="dropdown">
          <div class="dropdown-header">
            <span class="dropdown-title">Notificaciones</span>
            @if (unreadCount() > 0) {
              <button class="mark-all-btn" (click)="markAllRead()">
                Marcar todas como leídas
              </button>
            }
          </div>

          <div class="dropdown-list">
            @if (notifications().length === 0) {
              <div class="empty-state">Sin notificaciones</div>
            }
            @for (notif of notifications(); track notif.id) {
              <div
                class="notif-item"
                [class.unread]="!notif.read"
                (click)="markRead(notif)"
              >
                <div class="notif-title">{{ notif.title }}</div>
                <div class="notif-message">{{ notif.message }}</div>
                <div class="notif-time">{{ timeAgo(notif.created_at) }}</div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .bell-wrapper {
      position: relative;
      display: inline-block;
    }

    .bell-btn {
      position: relative;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 0.5rem;
      color: #374151;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .bell-btn:hover {
      background: #f3f4f6;
    }

    .badge {
      position: absolute;
      top: 2px;
      right: 2px;
      background: #ef4444;
      color: white;
      font-size: 0.6rem;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
      line-height: 1;
    }

    .dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 320px;
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      z-index: 1000;
      overflow: hidden;
    }

    .dropdown-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .dropdown-title {
      font-weight: 600;
      color: #1f2937;
      font-size: 0.9rem;
    }

    .mark-all-btn {
      background: none;
      border: none;
      color: #3b82f6;
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0;
    }

    .mark-all-btn:hover {
      text-decoration: underline;
    }

    .dropdown-list {
      max-height: 360px;
      overflow-y: auto;
    }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: #9ca3af;
      font-size: 0.875rem;
    }

    .notif-item {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background 0.15s;
    }

    .notif-item:last-child {
      border-bottom: none;
    }

    .notif-item:hover {
      background: #f9fafb;
    }

    .notif-item.unread {
      background: #eff6ff;
    }

    .notif-item.unread:hover {
      background: #dbeafe;
    }

    .notif-title {
      font-weight: 600;
      color: #1f2937;
      font-size: 0.875rem;
      margin-bottom: 0.25rem;
    }

    .notif-message {
      color: #6b7280;
      font-size: 0.8rem;
      margin-bottom: 0.25rem;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .notif-time {
      color: #9ca3af;
      font-size: 0.7rem;
    }

    @media (max-width: 480px) {
      .dropdown {
        width: 280px;
        right: -8px;
      }
    }
  `],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private readonly notifService = inject(NotificationService);
  private readonly wsService = inject(WebSocketNotificationService);
  private readonly elRef = inject(ElementRef);

  readonly notifications = signal<Notification[]>([]);
  readonly open = signal(false);

  readonly unreadCount = computed(
    () => this.notifications().filter((n) => !n.read).length
  );

  private sub: Subscription | null = null;

  ngOnInit(): void {
    this.loadNotifications();

    this.sub = this.wsService.notifications$.subscribe((incoming) => {
      this.notifications.update((list) => [incoming, ...list].slice(0, 50));
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }

  toggleDropdown(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      this.loadNotifications();
    }
  }

  markRead(notif: Notification): void {
    if (notif.read) return;
    this.notifService.markRead(notif.id).subscribe(() => {
      this.notifications.update((list) =>
        list.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    });
  }

  markAllRead(): void {
    this.notifService.markAllRead().subscribe(() => {
      this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
    });
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days} d`;
  }

  private loadNotifications(): void {
    this.notifService.getAll().subscribe({
      next: (list) => this.notifications.set(list.slice(0, 20)),
      error: () => {},
    });
  }
}
