import { type ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';

import { KioskComponent } from './kiosk.component';
import { CameraService } from '../../core/services/camera.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { LocationService } from '../../core/services/location.service';
import { PlatformService } from '../../core/services/platform.service';
import { SwUpdate } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { LivenessService } from '../../core/services/liveness.service';

describe('KioskComponent', () => {
  let fixture: ComponentFixture<KioskComponent>;
  let component: KioskComponent;
  let cameraService: jasmine.SpyObj<CameraService>;
  let attendanceService: jasmine.SpyObj<AttendanceService>;
  let geolocationService: jasmine.SpyObj<GeolocationService>;
  let livenessService: jasmine.SpyObj<LivenessService>;

  beforeEach(async () => {
    localStorage.clear();

    const cameraSpy = jasmine.createSpyObj('CameraService', ['isSupported', 'start', 'stop', 'captureFrames'], {
      active: signal(true),
      capturing: signal(false),
    });
    cameraSpy.isSupported.and.returnValue(true);
    cameraSpy.start.and.returnValue(Promise.resolve());
    cameraSpy.captureFrames.and.returnValue(Promise.resolve(['img1', 'img2', 'img3']));

    const attendanceSpy = jasmine.createSpyObj('AttendanceService', ['checkIn', 'checkOut']);
    attendanceSpy.checkIn.and.returnValue(
      of({
        id: '1',
        employee_id: 'e1',
        employee_name: 'Juan Pérez',
        record_date: '2026-04-27',
        check_in: '2026-04-27T13:00:00Z',
        check_out: null,
        status: 'present',
        confidence: 0.98,
        geo_validated: true,
        distance_meters: 0,
      }),
    );
    attendanceSpy.checkOut.and.returnValue(of({} as any));

    const geolocationSpy = jasmine.createSpyObj('GeolocationService', [
      'isSupported',
      'getCurrentPosition',
    ]);
    geolocationSpy.isSupported.and.returnValue(false);
    geolocationSpy.getCurrentPosition.and.returnValue(
      throwError(() => new Error('GPS unavailable')),
    );

    const livenessSpy = jasmine.createSpyObj('LivenessService', ['analyzeLiveness']);
    livenessSpy.analyzeLiveness.and.returnValue(
      Promise.resolve({
        isLive: true,
        variance: 12,
        framesAnalyzed: 3,
      }),
    );

    const locationSpy = jasmine.createSpyObj('LocationService', ['getLocation', 'getLocations']);
    locationSpy.getLocations.and.returnValue(of([]));
    locationSpy.getLocation.and.returnValue(
      of({
        id: 'loc1',
        name: 'Guastatoya-Caigua',
        latitude: 14.2971,
        longitude: -89.8956,
        radius_meters: 20,
        is_active: true,
      }),
    );

    const platformServiceStub = {
      isTablet: signal(false),
      isNative: () => false,
    };

    const swUpdateStub = {
      versionUpdates: of(),
      isEnabled: false,
      checkForUpdate: jasmine.createSpy().and.returnValue(Promise.resolve(false)),
      activateUpdate: jasmine.createSpy().and.returnValue(Promise.resolve()),
    };

    await TestBed.configureTestingModule({
      imports: [KioskComponent],
      providers: [
        provideRouter([]),
        { provide: CameraService, useValue: cameraSpy },
        { provide: AttendanceService, useValue: attendanceSpy },
        { provide: GeolocationService, useValue: geolocationSpy },
        { provide: LocationService, useValue: locationSpy },
        { provide: PlatformService, useValue: platformServiceStub },
        { provide: LivenessService, useValue: livenessSpy },
        { provide: SwUpdate, useValue: swUpdateStub },
      ],
    }).compileComponents();

    localStorage.setItem('kiosk_location_id', 'loc1');

    fixture = TestBed.createComponent(KioskComponent);
    component = fixture.componentInstance;
    cameraService = TestBed.inject(CameraService) as jasmine.SpyObj<CameraService>;
    attendanceService = TestBed.inject(AttendanceService) as jasmine.SpyObj<AttendanceService>;
    geolocationService = TestBed.inject(GeolocationService) as jasmine.SpyObj<GeolocationService>;
    livenessService = TestBed.inject(LivenessService) as jasmine.SpyObj<LivenessService>;
  });

  afterEach(() => {
    localStorage.clear();
    fixture?.destroy();
  });

  it('should show a GPS error when browser geolocation is unsupported', () => {
    fixture.detectChanges();

    expect(geolocationService.isSupported).toHaveBeenCalled();
    expect(component.geoStatus()).toBe('error');
    expect(component.geoError()).toContain('geolocalización');
  });

  it('should block kiosk camera when camera API is unsupported', async () => {
    cameraService.isSupported.and.returnValue(false);

    fixture.detectChanges();
    await component.startCamera();

    expect(cameraService.start).not.toHaveBeenCalled();
    expect(component.mode()).toBe('error');
    expect(component.errorTitle()).toBe('Cámara requerida');
    expect(component.errorHelp()).toContain('tablet Android con cámara y GPS');
  });

  it('should not submit attendance using configured location when real GPS is unavailable', async () => {
    fixture.detectChanges();

    await component.scan();

    expect(cameraService.captureFrames).toHaveBeenCalled();
    expect(attendanceService.checkIn).not.toHaveBeenCalled();
    expect(component.mode()).toBe('error');
  });

  it('should reject stale cached GPS when fresh scan-time GPS fails', async () => {
    fixture.detectChanges();
    (component as any).currentPosition = {
      latitude: 14.3,
      longitude: -89.9,
      accuracy: 5,
    };
    (component as any).currentPositionTimestamp = Date.now() - 6 * 60 * 1000;
    geolocationService.getCurrentPosition.and.returnValue(
      throwError(() => ({
        code: 'TIMEOUT',
        message: 'No se pudo obtener la ubicación a tiempo',
      })),
    );

    await component.scan();

    expect(attendanceService.checkIn).not.toHaveBeenCalled();
    expect(component.mode()).toBe('error');
    expect(component.errorTitle()).toBe('GPS sin respuesta');
  });

  it('should explain when browser location permission is denied', async () => {
    fixture.detectChanges();
    geolocationService.getCurrentPosition.and.returnValue(
      throwError(() => ({
        code: 'PERMISSION_DENIED',
        message: 'Permiso de ubicación denegado',
        hint: 'Permití ubicación para asistencia.sistemaslab.dev en el navegador.',
      })),
    );

    await component.scan();

    expect(attendanceService.checkIn).not.toHaveBeenCalled();
    expect(component.mode()).toBe('error');
    expect(component.errorTitle()).toBe('Permiso de ubicación denegado');
    expect(component.errorMessage()).toContain('no tiene permiso');
    expect(component.errorHelp()).toContain('Permití ubicación');
  });

  it('should explain when device GPS is unavailable', async () => {
    fixture.detectChanges();
    geolocationService.getCurrentPosition.and.returnValue(
      throwError(() => ({
        code: 'POSITION_UNAVAILABLE',
        message: 'GPS no disponible en este dispositivo',
      })),
    );

    await component.scan();

    expect(attendanceService.checkIn).not.toHaveBeenCalled();
    expect(component.mode()).toBe('error');
    expect(component.errorTitle()).toBe('GPS no disponible');
    expect(component.errorHelp()).toContain('Activá la ubicación/GPS');
  });

  it('should explain when GPS acquisition times out', async () => {
    fixture.detectChanges();
    geolocationService.getCurrentPosition.and.returnValue(
      throwError(() => ({
        code: 'TIMEOUT',
        message: 'No se pudo obtener la ubicación a tiempo',
      })),
    );

    await component.scan();

    expect(attendanceService.checkIn).not.toHaveBeenCalled();
    expect(component.mode()).toBe('error');
    expect(component.errorTitle()).toBe('GPS sin respuesta');
    expect(component.errorHelp()).toContain('zona con señal');
  });

  it('should continue to GPS and submit attendance when client liveness is inconclusive', async () => {
    fixture.detectChanges();
    livenessService.analyzeLiveness.and.returnValue(
      Promise.resolve({
        isLive: false,
        variance: 1,
        framesAnalyzed: 3,
      }),
    );
    geolocationService.isSupported.and.returnValue(true);
    geolocationService.getCurrentPosition.and.returnValue(
      of({
        latitude: 14.3,
        longitude: -89.9,
        accuracy: 5,
      }),
    );

    await component.scan();

    expect(livenessService.analyzeLiveness).toHaveBeenCalled();
    expect(geolocationService.getCurrentPosition).toHaveBeenCalled();
    expect(attendanceService.checkIn).toHaveBeenCalledWith({
      images: ['img1', 'img2', 'img3'],
      latitude: 14.3,
      longitude: -89.9,
    });
    expect(component.mode()).toBe('success');
  });

  it('should translate outside-perimeter backend errors and preserve the distance', async () => {
    fixture.detectChanges();
    livenessService.analyzeLiveness.and.returnValue(
      Promise.resolve({
        isLive: false,
        variance: 1,
        framesAnalyzed: 3,
      }),
    );
    geolocationService.isSupported.and.returnValue(true);
    geolocationService.getCurrentPosition.and.returnValue(
      of({
        latitude: 14.3,
        longitude: -89.9,
        accuracy: 5,
      }),
    );
    attendanceService.checkIn.and.returnValue(
      throwError(() => ({
        status: 403,
        error: { detail: 'Outside permitted area: 123m' },
      })),
    );

    await component.scan();

    expect(component.mode()).toBe('error');
    expect(component.errorMessage()).toContain('fuera del área permitida');
    expect(component.errorMessage()).toContain('123 m');
    expect(component.errorMessage()).not.toContain('Outside permitted area');
  });

  it('should keep kiosk result messages visible for at least 12s and no more than 20s', fakeAsync(() => {
    fixture.detectChanges();
    geolocationService.isSupported.and.returnValue(true);
    geolocationService.getCurrentPosition.and.returnValue(
      of({
        latitude: 14.3,
        longitude: -89.9,
        accuracy: 5,
      }),
    );
    attendanceService.checkIn.and.returnValue(
      throwError(() => ({
        status: 403,
        error: { detail: 'Outside permitted area: 123m' },
      })),
    );

    void component.scan();
    tick();

    expect(component.mode()).toBe('error');

    tick(11999);

    expect(component.mode()).toBe('error');

    tick(8001);

    expect(component.mode()).toBe('idle');
  }));
});
