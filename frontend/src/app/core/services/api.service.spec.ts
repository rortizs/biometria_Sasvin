import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('sends a typed body with DELETE requests', () => {
    const body = { employee_ids: ['employee-1'], start_date: '2026-07-13', end_date: '2026-07-19' };

    service.delete<{ deleted_count: number }>('/schedules/assignments/bulk', body).subscribe();

    const request = httpTesting.expectOne(`${environment.apiUrl}/schedules/assignments/bulk`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual(body);
    request.flush({ deleted_count: 1 });
  });
});
