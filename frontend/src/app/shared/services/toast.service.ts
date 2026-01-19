import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);

  getToasts() {
    return this.toasts.asReadonly();
  }

  showSuccess(message: string, duration = 5000): void {
    this.addToast({
      id: this.generateId(),
      message,
      type: 'success',
      duration
    });
  }

  showError(message: string, duration = 5000): void {
    this.addToast({
      id: this.generateId(),
      message,
      type: 'error',
      duration
    });
  }

  showWarning(message: string, duration = 5000): void {
    this.addToast({
      id: this.generateId(),
      message,
      type: 'warning',
      duration
    });
  }

  showInfo(message: string, duration = 5000): void {
    this.addToast({
      id: this.generateId(),
      message,
      type: 'info',
      duration
    });
  }

  removeToast(id: string): void {
    this.toasts.update(toasts => toasts.filter(toast => toast.id !== id));
  }

  private addToast(toast: Toast): void {
    this.toasts.update(toasts => [...toasts, toast]);

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        this.removeToast(toast.id);
      }, toast.duration);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}