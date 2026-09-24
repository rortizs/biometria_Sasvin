import { TestBed } from '@angular/core/testing';
import { WebSocketNotificationService } from './websocket-notification.service';
import { environment } from '../../../environments/environment';

// Regression coverage for the api-gateway migration: connect() previously
// built the WS URL from window.location (same-origin assumption), which
// broke the moment environment.apiUrl became an absolute cross-origin URL
// (https://api-gateway.sistemaslab.dev/api/biometria) -- notifications
// silently stopped connecting in production (confirmed live: WS handshake
// 404 against ws://<frontend-host>/api/v1/ws/notifications while the real
// API had already moved behind the gateway).
describe('WebSocketNotificationService', () => {
  let service: WebSocketNotificationService;
  let capturedUrl: string | undefined;
  let capturedProtocols: string | string[] | undefined;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebSocketNotificationService);
    capturedUrl = undefined;
    capturedProtocols = undefined;
    originalWebSocket = window.WebSocket;

    class FakeWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string, protocols?: string | string[]) {
        capturedUrl = url;
        capturedProtocols = protocols;
      }
      close(): void {}
      send(): void {}
    }
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    service.disconnect();
    (window as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  it('derives the WS URL from environment.apiUrl instead of window.location', () => {
    service.connect('fake-token');

    expect(capturedUrl).toBe(`${environment.apiUrl.replace(/^http/, 'ws')}/ws/notifications`);
  });

  it('sends the bearer token through WebSocket subprotocols instead of the URL query string', () => {
    service.connect('fake-token');

    expect(capturedUrl).not.toContain('fake-token');
    expect(capturedUrl).not.toContain('token=');
    expect(capturedProtocols).toEqual(['bearer', 'fake-token']);
  });
});
