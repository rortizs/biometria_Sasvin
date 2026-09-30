import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('canonicalizes a trailing slash before inline query strings on GET requests', () => {
    service.get('/locations/?active_only=true').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/locations?active_only=true`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('canonicalizes trailing slashes before applying HttpParams', () => {
    service.get('/settings/', { active_only: true }).subscribe();

    const req = httpMock.expectOne(
      request =>
        request.url === `${environment.apiUrl}/settings` &&
        request.params.get('active_only') === 'true',
    );
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('preserves root paths while canonicalizing non-root paths for every write method', () => {
    const formData = new FormData();

    service.post('/settings/', {}).subscribe();
    service.patch('/settings/', {}).subscribe();
    service.put('/settings/', {}).subscribe();
    service.delete('/settings/').subscribe();
    service.postForm('/settings/', formData).subscribe();
    service.get('/').subscribe();

    const postReq = httpMock.expectOne(
      request =>
        request.url === `${environment.apiUrl}/settings` &&
        request.method === 'POST' &&
        request.body !== formData,
    );
    postReq.flush({});

    const patchReq = httpMock.expectOne(
      request => request.url === `${environment.apiUrl}/settings` && request.method === 'PATCH',
    );
    patchReq.flush({});

    const putReq = httpMock.expectOne(
      request => request.url === `${environment.apiUrl}/settings` && request.method === 'PUT',
    );
    putReq.flush({});

    const deleteReq = httpMock.expectOne(
      request => request.url === `${environment.apiUrl}/settings` && request.method === 'DELETE',
    );
    deleteReq.flush({});

    const formReq = httpMock.expectOne(
      request =>
        request.url === `${environment.apiUrl}/settings` &&
        request.method === 'POST' &&
        request.body === formData,
    );
    expect(formReq.request.body).toBe(formData);
    formReq.flush({});

    const rootReq = httpMock.expectOne(`${environment.apiUrl}/`);
    expect(rootReq.request.method).toBe('GET');
    rootReq.flush({});
  });
});
