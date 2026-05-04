import { ComponentFixture, TestBed } from '@angular/core/testing';
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

describe('KioskComponent', () => {
  let fixture: ComponentFixture<KioskComponent>;
  let component: KioskComponent;
  let cameraService: jasmine.SpyObj<CameraService>;
  let attendanceService: jasmine.SpyObj<AttendanceService>;

  beforeEach(async () => {
    localStorage.clear();

    const cameraSpy = jasmine.createSpyObj('CameraService', ['start', 'stop', 'captureFrames'], {
      active: signal(true),
      capturing: signal(false),
    });
    cameraSpy.start.and.returnValue(Promise.resolve());
    cameraSpy.captureFrames.and.returnValue(Promise.resolve(['img1', 'img2', 'img3']));

    const attendanceSpy = jasmine.createSpyObj('AttendanceService', ['checkIn', 'checkOut']);
    attendanceSpy.checkIn.and.returnValue(of({
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
    }));
    attendanceSpy.checkOut.and.returnValue(of({} as any));

    const geolocationSpy = jasmine.createSpyObj('GeolocationService', ['isSupported', 'getCurrentPosition']);
    geolocationSpy.isSupported.and.returnValue(false);
    geolocationSpy.getCurrentPosition.and.returnValue(throwError(() => new Error('GPS unavailable')));

    const locationSpy = jasmine.createSpyObj('LocationService', ['getLocation', 'getLocations']);
    locationSpy.getLocations.and.returnValue(of([]));
    locationSpy.getLocation.and.returnValue(of({
      id: 'loc1',
      name: 'Guastatoya-Caigua',
      latitude: 14.2971,
      longitude: -89.8956,
      radius_meters: 20,
      is_active: true,
    }));

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
        { provide: SwUpdate, useValue: swUpdateStub },
      ],
    }).compileComponents();

    localStorage.setItem('kiosk_location_id', 'loc1');

    fixture = TestBed.createComponent(KioskComponent);
    component = fixture.componentInstance;
    cameraService = TestBed.inject(CameraService) as jasmine.SpyObj<CameraService>;
    attendanceService = TestBed.inject(AttendanceService) as jasmine.SpyObj<AttendanceService>;
  });

  afterEach(() => {
    localStorage.clear();
    fixture?.destroy();
  });

  it('should not submit attendance using configured location when real GPS is unavailable', async () => {
    fixture.detectChanges();

    await component.scan();

    expect(cameraService.captureFrames).not.toHaveBeenCalled();
    expect(attendanceService.checkIn).not.toHaveBeenCalled();
    expect(component.mode()).toBe('error');
  });
});
