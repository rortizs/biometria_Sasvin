import { TestBed } from '@angular/core/testing';
import { GeolocationService } from './geolocation.service';
import { PlatformService } from './platform.service';
import type { GeolocationPlugin } from '@capacitor/geolocation';
import { firstValueFrom } from 'rxjs';
import { GeoError } from '../models/geolocation.model';

// Helper to create mock GeolocationPosition
function createMockPosition(lat: number, lon: number, accuracy: number): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

describe('GeolocationService', () => {
  let service: GeolocationService;
  let platformService: jasmine.SpyObj<PlatformService>;
  let originalGeolocationDescriptor: PropertyDescriptor | undefined;
  let originalPermissionsDescriptor: PropertyDescriptor | undefined;

  function setNavigatorProperty<K extends 'geolocation' | 'permissions'>(
    property: K,
    value: Navigator[K]
  ): void {
    Object.defineProperty(navigator, property, {
      configurable: true,
      get: () => value,
    });
  }

  function setNativeGeolocation(overrides: Partial<GeolocationPlugin>): void {
    (service as any).geolocation = overrides;
  }

  beforeEach(() => {
    originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'geolocation')
      ?? Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    originalPermissionsDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'permissions')
      ?? Object.getOwnPropertyDescriptor(navigator, 'permissions');
    const platformSpy = jasmine.createSpyObj('PlatformService', ['isNative']);
    platformSpy.isNative.and.returnValue(false);

    TestBed.configureTestingModule({
      providers: [
        GeolocationService,
        { provide: PlatformService, useValue: platformSpy },
      ],
    });

    service = TestBed.inject(GeolocationService);
    platformService = TestBed.inject(PlatformService) as jasmine.SpyObj<PlatformService>;
  });

  afterEach(() => {
    if (originalGeolocationDescriptor) {
      Object.defineProperty(navigator, 'geolocation', originalGeolocationDescriptor);
    }
    if (originalPermissionsDescriptor) {
      Object.defineProperty(navigator, 'permissions', originalPermissionsDescriptor);
    }
  });

  describe('isSupported', () => {
    it('should return true on native platforms', () => {
      platformService.isNative.and.returnValue(true);

      expect(service.isSupported()).toBe(true);
    });

    it('should return true if browser has geolocation', () => {
      platformService.isNative.and.returnValue(false);
      setNavigatorProperty('geolocation', {} as any);

      expect(service.isSupported()).toBe(true);
    });

    it('should return false if browser lacks geolocation', () => {
      platformService.isNative.and.returnValue(false);
      setNavigatorProperty('geolocation', undefined as any);

      expect(service.isSupported()).toBe(false);
    });
  });

  describe('getCurrentPosition - browser', () => {
    let mockGeolocation: jasmine.SpyObj<GeolocationPositionError> & { getCurrentPosition: jasmine.Spy };

    beforeEach(() => {
      platformService.isNative.and.returnValue(false);
      
      mockGeolocation = jasmine.createSpyObj('Geolocation', ['getCurrentPosition']);
      
      setNavigatorProperty('geolocation', mockGeolocation as any);
    });

    it('should get position from browser geolocation API', async () => {
      const mockPosition = createMockPosition(-34.603722, -58.381592, 10);

      mockGeolocation.getCurrentPosition.and.callFake((success: any) => {
        success(mockPosition);
      });

      const position = await firstValueFrom(service.getCurrentPosition());

      expect(position.latitude).toBe(-34.603722);
      expect(position.longitude).toBe(-58.381592);
      expect(position.accuracy).toBe(10);
      expect(service.state()).toBe('acquired');
      expect(service.lastPosition()).toEqual(position);
    });

    it('should use KIOSK_GEO_CONFIG for browser', async () => {
      const mockPosition = createMockPosition(0, 0, 10);

      mockGeolocation.getCurrentPosition.and.callFake((success: any, error: any, options: any) => {
        expect(options.enableHighAccuracy).toBe(true);
        expect(options.timeout).toBe(15000);
        expect(options.maximumAge).toBe(5000); // KIOSK config
        success(mockPosition);
      });

      await firstValueFrom(service.getCurrentPosition());
    });

    it('should set state to acquiring before request', () => {
      const mockPosition = createMockPosition(0, 0, 10);

      mockGeolocation.getCurrentPosition.and.callFake((success: any) => {
        expect(service.state()).toBe('acquiring');
        success(mockPosition);
      });

      service.getCurrentPosition().subscribe();
    });

    it('should handle PERMISSION_DENIED error', async () => {
      const positionError: GeolocationPositionError = {
        code: 1, // PERMISSION_DENIED
        message: 'User denied geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.and.callFake((success: any, error: any) => {
        error(positionError);
      });

      try {
        await firstValueFrom(service.getCurrentPosition());
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GeoError);
        expect((error as GeoError).code).toBe('PERMISSION_DENIED');
        expect((error as GeoError).hint).toContain('configuración del navegador');
        expect(service.state()).toBe('error');
        expect(service.lastError()?.code).toBe('PERMISSION_DENIED');
      }
    });

    it('should handle POSITION_UNAVAILABLE error', async () => {
      const positionError: GeolocationPositionError = {
        code: 2, // POSITION_UNAVAILABLE
        message: 'Position unavailable',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.and.callFake((success: any, error: any) => {
        error(positionError);
      });

      try {
        await firstValueFrom(service.getCurrentPosition());
        fail('Should have thrown');
      } catch (error) {
        expect((error as GeoError).code).toBe('POSITION_UNAVAILABLE');
        expect(service.state()).toBe('error');
      }
    });

    it('should handle TIMEOUT error', async () => {
      const positionError: GeolocationPositionError = {
        code: 3, // TIMEOUT
        message: 'Timeout',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.and.callFake((success: any, error: any) => {
        error(positionError);
      });

      try {
        await firstValueFrom(service.getCurrentPosition());
        fail('Should have thrown');
      } catch (error) {
        expect((error as GeoError).code).toBe('TIMEOUT');
        expect(service.state()).toBe('error');
      }
    });

    it('should reject if geolocation is not supported', async () => {
      setNavigatorProperty('geolocation', undefined as any);

      try {
        await firstValueFrom(service.getCurrentPosition());
        fail('Should have thrown');
      } catch (error) {
        expect((error as GeoError).code).toBe('NOT_SUPPORTED');
        expect(service.state()).toBe('error');
      }
    });

    it('should allow custom config', async () => {
      const mockPosition = createMockPosition(0, 0, 10);

      mockGeolocation.getCurrentPosition.and.callFake((success: any, error: any, options: any) => {
        expect(options.timeout).toBe(30000); // Custom timeout
        success(mockPosition);
      });

      await firstValueFrom(service.getCurrentPosition({ timeout: 30000 }));
    });
  });

  describe('getCurrentPosition - native', () => {
    beforeEach(() => {
      platformService.isNative.and.returnValue(true);
    });

    it('should get position from Capacitor Geolocation', async () => {
      const mockPosition = {
        coords: {
          latitude: -34.603722,
          longitude: -58.381592,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      const getCurrentPositionSpy = jasmine
        .createSpy('getCurrentPosition')
        .and.returnValue(Promise.resolve(mockPosition));
      setNativeGeolocation({ getCurrentPosition: getCurrentPositionSpy as any });

      const position = await firstValueFrom(service.getCurrentPosition());

      expect(getCurrentPositionSpy).toHaveBeenCalledWith({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000, // MOBILE config
      });

      expect(position.latitude).toBe(-34.603722);
      expect(position.longitude).toBe(-58.381592);
      expect(service.state()).toBe('acquired');
    });

    it('should handle native permission error', async () => {
      const permissionError = new Error('Permission denied by user');

      setNativeGeolocation({
        getCurrentPosition: jasmine
          .createSpy('getCurrentPosition')
          .and.returnValue(Promise.reject(permissionError)) as any,
      });

      try {
        await firstValueFrom(service.getCurrentPosition());
        fail('Should have thrown');
      } catch (error) {
        expect((error as GeoError).code).toBe('PERMISSION_DENIED');
        expect((error as GeoError).hint).toContain('Configuración > Aplicaciones > Sasvin');
        expect(service.state()).toBe('error');
      }
    });

    it('should handle native timeout error', async () => {
      const timeoutError = new Error('Geolocation request timed out');

      setNativeGeolocation({
        getCurrentPosition: jasmine
          .createSpy('getCurrentPosition')
          .and.returnValue(Promise.reject(timeoutError)) as any,
      });

      try {
        await firstValueFrom(service.getCurrentPosition());
        fail('Should have thrown');
      } catch (error) {
        expect((error as GeoError).code).toBe('TIMEOUT');
        expect(service.state()).toBe('error');
      }
    });

    it('should handle generic native errors as POSITION_UNAVAILABLE', async () => {
      const genericError = new Error('Something went wrong');

      setNativeGeolocation({
        getCurrentPosition: jasmine
          .createSpy('getCurrentPosition')
          .and.returnValue(Promise.reject(genericError)) as any,
      });

      try {
        await firstValueFrom(service.getCurrentPosition());
        fail('Should have thrown');
      } catch (error) {
        expect((error as GeoError).code).toBe('POSITION_UNAVAILABLE');
        expect(service.state()).toBe('error');
      }
    });
  });

  describe('checkPermission - browser', () => {
    beforeEach(() => {
      platformService.isNative.and.returnValue(false);
    });

    it('should return granted if permission is granted', async () => {
      const mockPermissionStatus = { state: 'granted' };
      
      setNavigatorProperty('permissions', {
        query: jasmine.createSpy('query').and.returnValue(
          Promise.resolve(mockPermissionStatus as PermissionStatus)
        ),
      } as any);

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('granted');
    });

    it('should return denied if permission is denied', async () => {
      const mockPermissionStatus = { state: 'denied' };
      
      setNavigatorProperty('permissions', {
        query: jasmine.createSpy('query').and.returnValue(
          Promise.resolve(mockPermissionStatus as PermissionStatus)
        ),
      } as any);

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('denied');
    });

    it('should return prompt if permission is prompt', async () => {
      const mockPermissionStatus = { state: 'prompt' };
      
      setNavigatorProperty('permissions', {
        query: jasmine.createSpy('query').and.returnValue(
          Promise.resolve(mockPermissionStatus as PermissionStatus)
        ),
      } as any);

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('prompt');
    });

    it('should return prompt if permissions API is not available', async () => {
      setNavigatorProperty('permissions', undefined as any);

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('prompt');
    });
  });

  describe('checkPermission - native', () => {
    beforeEach(() => {
      platformService.isNative.and.returnValue(true);
    });

    it('should check Capacitor permissions', async () => {
      setNativeGeolocation({
        checkPermissions: jasmine.createSpy('checkPermissions').and.returnValue(
          Promise.resolve({ location: 'granted', coarseLocation: 'granted' })
        ) as any,
      });

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('granted');
    });

    it('should handle denied permission', async () => {
      setNativeGeolocation({
        checkPermissions: jasmine.createSpy('checkPermissions').and.returnValue(
          Promise.resolve({ location: 'denied', coarseLocation: 'denied' })
        ) as any,
      });

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('denied');
    });

    it('should handle prompt permission', async () => {
      setNativeGeolocation({
        checkPermissions: jasmine.createSpy('checkPermissions').and.returnValue(
          Promise.resolve({ location: 'prompt', coarseLocation: 'prompt' })
        ) as any,
      });

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('prompt');
    });

    it('should handle check failure by returning prompt', async () => {
      setNativeGeolocation({
        checkPermissions: jasmine.createSpy('checkPermissions').and.returnValue(
          Promise.reject(new Error('Permission check failed'))
        ) as any,
      });

      const permission = await firstValueFrom(service.checkPermission());

      expect(permission).toBe('prompt');
    });
  });

  describe('requestPermission - native', () => {
    beforeEach(() => {
      platformService.isNative.and.returnValue(true);
    });

    it('should request Capacitor permissions', async () => {
      setNativeGeolocation({
        requestPermissions: jasmine.createSpy('requestPermissions').and.returnValue(
          Promise.resolve({ location: 'granted', coarseLocation: 'granted' })
        ) as any,
      });

      const permission = await firstValueFrom(service.requestPermission());

      expect(permission).toBe('granted');
    });

    it('should return denied if request is denied', async () => {
      setNativeGeolocation({
        requestPermissions: jasmine.createSpy('requestPermissions').and.returnValue(
          Promise.resolve({ location: 'denied', coarseLocation: 'denied' })
        ) as any,
      });

      const permission = await firstValueFrom(service.requestPermission());

      expect(permission).toBe('denied');
    });
  });

  describe('requestPermission - browser', () => {
    beforeEach(() => {
      platformService.isNative.and.returnValue(false);
    });

    it('should check current permission state (browser does not have explicit request)', async () => {
      const mockPermissionStatus = { state: 'granted' };
      
      setNavigatorProperty('permissions', {
        query: jasmine.createSpy('query').and.returnValue(
          Promise.resolve(mockPermissionStatus as PermissionStatus)
        ),
      } as any);

      const permission = await firstValueFrom(service.requestPermission());

      expect(permission).toBe('granted');
    });
  });

  describe('signal reactivity', () => {
    it('should update state signal through position acquisition', async () => {
      platformService.isNative.and.returnValue(false);
      
      const mockPosition = createMockPosition(0, 0, 10);

      const mockGeolocation = jasmine.createSpyObj('Geolocation', ['getCurrentPosition']);
      mockGeolocation.getCurrentPosition.and.callFake((success: any) => {
        success(mockPosition);
      });
      
      setNavigatorProperty('geolocation', mockGeolocation as any);

      expect(service.state()).toBe('idle');

      await firstValueFrom(service.getCurrentPosition());

      expect(service.state()).toBe('acquired');
    });

    it('should update lastError signal on error', async () => {
      platformService.isNative.and.returnValue(false);

      const positionError: GeolocationPositionError = {
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      const mockGeolocation = jasmine.createSpyObj('Geolocation', ['getCurrentPosition']);
      mockGeolocation.getCurrentPosition.and.callFake((success: any, error: any) => {
        error(positionError);
      });
      
      setNavigatorProperty('geolocation', mockGeolocation as any);

      expect(service.lastError()).toBeNull();

      try {
        await firstValueFrom(service.getCurrentPosition());
      } catch (e) {
        // Expected
      }

      expect(service.lastError()).not.toBeNull();
      expect(service.lastError()?.code).toBe('PERMISSION_DENIED');
    });

    it('should clear lastError on successful acquisition', async () => {
      platformService.isNative.and.returnValue(false);

      const mockPosition = createMockPosition(0, 0, 10);

      const mockGeolocation = jasmine.createSpyObj('Geolocation', ['getCurrentPosition']);
      mockGeolocation.getCurrentPosition.and.callFake((success: any) => {
        success(mockPosition);
      });
      
      setNavigatorProperty('geolocation', mockGeolocation as any);

      // Manually set an error first
      service['_lastError'].set(new GeoError('TIMEOUT', 'Test error'));
      expect(service.lastError()).not.toBeNull();

      await firstValueFrom(service.getCurrentPosition());

      expect(service.lastError()).toBeNull();
    });
  });
});
