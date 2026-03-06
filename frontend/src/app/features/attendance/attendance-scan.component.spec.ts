import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttendanceScanComponent } from './attendance-scan.component';
import { CameraService } from '../../core/services/camera.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

describe('AttendanceScanComponent', () => {
  let component: AttendanceScanComponent;
  let fixture: ComponentFixture<AttendanceScanComponent>;
  let cameraService: jasmine.SpyObj<CameraService>;
  let geoService: jasmine.SpyObj<GeolocationService>;
  let attendanceService: jasmine.SpyObj<AttendanceService>;

  beforeEach(async () => {
    // Create spies
    const cameraSpy = jasmine.createSpyObj('CameraService', [
      'start',
      'stop',
      'captureFrame',
      'captureFrames',
    ], {
      active: signal(false),
      error: signal(null),
      capturing: signal(false),
    });

    const geoSpy = jasmine.createSpyObj('GeolocationService', [
      'getCurrentPosition',
    ], {
      state: signal('idle'),
      lastPosition: signal(null),
      lastError: signal(null),
    });

    const attendanceSpy = jasmine.createSpyObj('AttendanceService', [
      'checkIn',
      'checkOut',
    ]);

    await TestBed.configureTestingModule({
      imports: [AttendanceScanComponent],
      providers: [
        { provide: CameraService, useValue: cameraSpy },
        { provide: GeolocationService, useValue: geoSpy },
        { provide: AttendanceService, useValue: attendanceSpy },
      ],
    }).compileComponents();

    cameraService = TestBed.inject(CameraService) as jasmine.SpyObj<CameraService>;
    geoService = TestBed.inject(GeolocationService) as jasmine.SpyObj<GeolocationService>;
    attendanceService = TestBed.inject(AttendanceService) as jasmine.SpyObj<AttendanceService>;

    // Set up default spy behaviors
    cameraService.start.and.returnValue(Promise.resolve());
    cameraService.captureFrames.and.returnValue(Promise.resolve(['frame1', 'frame2', 'frame3']));
    geoService.getCurrentPosition.and.returnValue(of({
      latitude: -34.603722,
      longitude: -58.381592,
      accuracy: 10,
    }));

    fixture = TestBed.createComponent(AttendanceScanComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize camera on construction', () => {
      fixture.detectChanges();
      expect(cameraService.start).toHaveBeenCalled();
    });

    it('should start GPS acquisition on construction', () => {
      fixture.detectChanges();
      expect(geoService.getCurrentPosition).toHaveBeenCalled();
    });

    it('should set camera error if camera fails to start', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      cameraService.start.and.returnValue(Promise.reject(permissionError));

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.cameraError()).toBe('Permiso de cámara denegado');
    });

    it('should handle NotFoundError for missing camera', async () => {
      const notFoundError = new Error('No camera');
      notFoundError.name = 'NotFoundError';
      cameraService.start.and.returnValue(Promise.reject(notFoundError));

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.cameraError()).toBe('No se encontró cámara en el dispositivo');
    });

    it('should handle generic camera errors', async () => {
      const genericError = new Error('Something went wrong');
      cameraService.start.and.returnValue(Promise.reject(genericError));

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.cameraError()).toBe('Error al iniciar la cámara');
    });
  });

  describe('canScan', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should return true when camera is active and not capturing', () => {
      Object.defineProperty(cameraService, 'active', { value: signal(true) });
      Object.defineProperty(cameraService, 'capturing', { value: signal(false) });
      component.cameraError.set(null);
      component.mode.set('idle');

      expect(component.canScan()).toBe(true);
    });

    it('should return false if camera is not active', () => {
      Object.defineProperty(cameraService, 'active', { value: signal(false) });
      Object.defineProperty(cameraService, 'capturing', { value: signal(false) });
      component.cameraError.set(null);
      component.mode.set('idle');

      expect(component.canScan()).toBe(false);
    });

    it('should return false if camera is capturing', () => {
      Object.defineProperty(cameraService, 'active', { value: signal(true) });
      Object.defineProperty(cameraService, 'capturing', { value: signal(true) });
      component.cameraError.set(null);
      component.mode.set('idle');

      expect(component.canScan()).toBe(false);
    });

    it('should return false if mode is not idle', () => {
      Object.defineProperty(cameraService, 'active', { value: signal(true) });
      Object.defineProperty(cameraService, 'capturing', { value: signal(false) });
      component.cameraError.set(null);
      component.mode.set('scanning');

      expect(component.canScan()).toBe(false);
    });

    it('should return false if camera has error', () => {
      Object.defineProperty(cameraService, 'active', { value: signal(true) });
      Object.defineProperty(cameraService, 'capturing', { value: signal(false) });
      component.cameraError.set('Camera error');
      component.mode.set('idle');

      expect(component.canScan()).toBe(false);
    });
  });

  describe('handleScan - success flow', () => {
    beforeEach(() => {
      fixture.detectChanges();
      Object.defineProperty(cameraService, 'active', { value: signal(true) });
      Object.defineProperty(cameraService, 'capturing', { value: signal(false) });
      component.cameraError.set(null);
      component.mode.set('idle');
    });

    it('should capture 3 frames with 250ms delay', async () => {
      const mockRecord = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        employee_id: '123e4567-e89b-12d3-a456-426614174001',
        employee_name: 'Juan Pérez',
        record_date: '2024-03-06',
        check_in: '2024-03-06T09:00:00Z',
        check_out: null,
        status: 'present',
        confidence: 0.95,
        geo_validated: true,
        distance_meters: 50,
      };

      attendanceService.checkIn.and.returnValue(of(mockRecord as any));

      await component.handleScan();

      expect(cameraService.captureFrames).toHaveBeenCalledWith(3, 250);
    });

    it('should send frames and GPS position to backend', async () => {
      component.lastGeoPosition.set({
        latitude: -34.603722,
        longitude: -58.381592,
        accuracy: 10,
      });

      const mockRecord = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        employee_id: '123e4567-e89b-12d3-a456-426614174001',
        employee_name: 'Juan Pérez',
        record_date: '2024-03-06',
        check_in: '2024-03-06T09:00:00Z',
        check_out: null,
        status: 'present',
        confidence: 0.95,
        geo_validated: true,
        distance_meters: 50,
      };

      attendanceService.checkIn.and.returnValue(of(mockRecord as any));

      await component.handleScan();

      expect(attendanceService.checkIn).toHaveBeenCalledWith({
        images: ['frame1', 'frame2', 'frame3'],
        latitude: -34.603722,
        longitude: -58.381592,
      });
    });

    it('should set mode to success and show result', async () => {
      const mockRecord = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        employee_id: '123e4567-e89b-12d3-a456-426614174001',
        employee_name: 'Juan Pérez',
        record_date: '2024-03-06',
        check_in: '2024-03-06T09:00:00Z',
        check_out: null,
        status: 'present',
        confidence: 0.95,
        geo_validated: true,
        distance_meters: 50,
      };

      attendanceService.checkIn.and.returnValue(of(mockRecord as any));

      await component.handleScan();

      expect(component.mode()).toBe('success');
      expect(component.lastRecord()).toEqual(mockRecord as any);
    });

    it('should auto-dismiss success overlay after 5 seconds', (done) => {
      const mockRecord = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        employee_id: '123e4567-e89b-12d3-a456-426614174001',
        employee_name: 'Juan Pérez',
        record_date: '2024-03-06',
        check_in: '2024-03-06T09:00:00Z',
        check_out: null,
        status: 'present',
        confidence: 0.95,
        geo_validated: true,
        distance_meters: 50,
      };

      attendanceService.checkIn.and.returnValue(of(mockRecord as any));

      component.handleScan().then(() => {
        expect(component.mode()).toBe('success');

        // Wait for auto-dismiss (5 seconds + buffer)
        setTimeout(() => {
          expect(component.mode()).toBe('idle');
          expect(component.lastRecord()).toBeNull();
          done();
        }, 5100);
      });
    }, 10000);
  });

  describe('handleScan - error scenarios', () => {
    beforeEach(() => {
      fixture.detectChanges();
      Object.defineProperty(cameraService, 'active', { value: signal(true) });
      Object.defineProperty(cameraService, 'capturing', { value: signal(false) });
      component.cameraError.set(null);
      component.mode.set('idle');
    });

    it('should handle anti-spoofing rejection (400)', async () => {
      const error = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
      });

      attendanceService.checkIn.and.returnValue(throwError(() => error));

      await component.handleScan();

      expect(component.mode()).toBe('error');
      expect(component.errorMessage()).toContain('No se detectó un rostro real');
    });

    it('should handle face not recognized (404)', async () => {
      const error = new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
      });

      attendanceService.checkIn.and.returnValue(throwError(() => error));

      await component.handleScan();

      expect(component.mode()).toBe('error');
      expect(component.errorMessage()).toContain('Rostro no reconocido');
    });

    it('should handle network error (0 or 500+)', async () => {
      const error = new HttpErrorResponse({
        status: 0,
        statusText: 'Unknown Error',
      });

      attendanceService.checkIn.and.returnValue(throwError(() => error));

      await component.handleScan();

      expect(component.mode()).toBe('error');
      expect(component.errorMessage()).toContain('Error de conexión');
    });

    it('should handle capture failure', async () => {
      cameraService.captureFrames.and.returnValue(Promise.resolve([]));

      await component.handleScan();

      expect(component.mode()).toBe('error');
      expect(component.errorMessage()).toBe('No se pudieron capturar imágenes');
    });

    it('should auto-dismiss error overlay after 4 seconds', (done) => {
      const error = new HttpErrorResponse({ status: 404 });
      attendanceService.checkIn.and.returnValue(throwError(() => error));

      component.handleScan().then(() => {
        expect(component.mode()).toBe('error');

        setTimeout(() => {
          expect(component.mode()).toBe('idle');
          expect(component.errorMessage()).toBe('');
          done();
        }, 4100);
      });
    }, 10000);
  });

  describe('GPS status display', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should show acquiring status', () => {
      Object.defineProperty(geoService, 'state', { value: signal('acquiring') });

      expect(component.geoStatusClass()).toBe('acquiring');
    });

    it('should show acquired status', () => {
      Object.defineProperty(geoService, 'state', { value: signal('acquired') });

      expect(component.geoStatusClass()).toBe('acquired');
    });

    it('should show error status', () => {
      Object.defineProperty(geoService, 'state', { value: signal('error') });

      expect(component.geoStatusClass()).toBe('error');
    });

    it('should get error message from geo service', () => {
      const mockError = {
        code: 'PERMISSION_DENIED' as const,
        message: 'Permiso denegado',
        hint: 'Abre configuración',
      };
      Object.defineProperty(geoService, 'lastError', { value: signal(mockError) });

      expect(component.geoErrorMessage()).toBe('Permiso denegado');
    });

    it('should return default error message if no error', () => {
      Object.defineProperty(geoService, 'lastError', { value: signal(null) });

      expect(component.geoErrorMessage()).toBe('Error de ubicación');
    });
  });

  describe('isCheckIn helper', () => {
    it('should return true if record has check_in', () => {
      component.lastRecord.set({
        id: '123',
        employee_id: '456',
        employee_name: 'Test',
        record_date: '2024-03-06',
        check_in: '2024-03-06T09:00:00Z',
        check_out: null,
        status: 'present',
      } as any);

      expect(component.isCheckIn()).toBe(true);
    });

    it('should return false if record has no check_in', () => {
      component.lastRecord.set({
        id: '123',
        employee_id: '456',
        employee_name: 'Test',
        record_date: '2024-03-06',
        check_in: null,
        check_out: '2024-03-06T17:00:00Z',
        status: 'present',
      } as any);

      expect(component.isCheckIn()).toBe(false);
    });

    it('should return false if no record', () => {
      component.lastRecord.set(null);

      expect(component.isCheckIn()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should stop camera on destroy', () => {
      fixture.detectChanges();
      fixture.destroy();

      expect(cameraService.stop).toHaveBeenCalled();
    });

    it('should clear auto-dismiss timer on destroy', () => {
      fixture.detectChanges();

      // Set a timer
      component['autoDismissTimer'] = window.setTimeout(() => {}, 5000);

      fixture.destroy();

      expect(component['autoDismissTimer']).toBeNull();
    });
  });
});
