import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { WebSocketNotificationService } from '../services/websocket-notification.service';
import { authInterceptor } from './auth.interceptor';
import { environment } from '../../../environments/environment';

// Regression coverage for the "F5 desloguea" client QA report: AuthService's
// own unit tests (auth.service.spec.ts) never wire in `authInterceptor` via
// `withInterceptors(...)`, so they miss what only shows up when the real
// app.config.ts interceptor chain runs -- exactly the gap that let this bug
// reach production undetected.
describe('authInterceptor (session restore integration)', () => {
  let httpMock: HttpTestingController;
  let wsNotifSpy: jasmine.SpyObj<WebSocketNotificationService>;

  beforeEach(() => {
    wsNotifSpy = jasmine.createSpyObj('WebSocketNotificationService', ['connect', 'disconnect']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: WebSocketNotificationService, useValue: wsNotifSpy },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    httpMock.verify();
  });

  it('restores the session on cold load: /auth/me actually reaches the network with the real interceptor wired in', () => {
    localStorage.setItem('access_token', 'stored-token');

    TestBed.inject(AuthService);

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer stored-token');
  });
});
