import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenStorageService);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores the access token in sessionStorage instead of durable localStorage', () => {
    service.setTokens('access-token', 'refresh-token');

    expect(sessionStorage.getItem('access_token')).toBe('access-token');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(service.getAccessToken()).toBe('access-token');
  });

  it('migrates a legacy localStorage access token into sessionStorage and removes the durable copy', () => {
    localStorage.setItem('access_token', 'legacy-access-token');

    expect(service.getAccessToken()).toBe('legacy-access-token');
    expect(sessionStorage.getItem('access_token')).toBe('legacy-access-token');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('clears refresh, session access, and legacy durable access tokens', () => {
    sessionStorage.setItem('access_token', 'access-token');
    localStorage.setItem('access_token', 'legacy-access-token');
    localStorage.setItem('refresh_token', 'refresh-token');

    service.clearTokens();

    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});
