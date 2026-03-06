import { TestBed } from '@angular/core/testing';
import { PlatformService } from './platform.service';
import { Capacitor } from '@capacitor/core';

describe('PlatformService', () => {
  let service: PlatformService;

  // Store original window dimensions
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlatformService],
    });
  });

  afterEach(() => {
    // Restore window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
  });

  describe('when running on native iOS', () => {
    beforeEach(() => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      spyOn(Capacitor, 'getPlatform').and.returnValue('ios');
      service = TestBed.inject(PlatformService);
    });

    it('should detect native platform', () => {
      expect(service.isNative()).toBe(true);
      expect(service.isBrowser()).toBe(false);
    });

    it('should return ios as platform', () => {
      expect(service.platform()).toBe('ios');
    });

    it('should identify as iOS', () => {
      expect(service.isIOS()).toBe(true);
      expect(service.isAndroid()).toBe(false);
    });

    it('should return 0.7 JPEG quality for native', () => {
      expect(service.jpegQuality()).toBe(0.7);
    });
  });

  describe('when running on native Android', () => {
    beforeEach(() => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      spyOn(Capacitor, 'getPlatform').and.returnValue('android');
      service = TestBed.inject(PlatformService);
    });

    it('should detect native platform', () => {
      expect(service.isNative()).toBe(true);
    });

    it('should return android as platform', () => {
      expect(service.platform()).toBe('android');
    });

    it('should identify as Android', () => {
      expect(service.isAndroid()).toBe(true);
      expect(service.isIOS()).toBe(false);
    });

    it('should return 0.7 JPEG quality for native', () => {
      expect(service.jpegQuality()).toBe(0.7);
    });
  });

  describe('when running in browser', () => {
    beforeEach(() => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
      spyOn(Capacitor, 'getPlatform').and.returnValue('web');
      service = TestBed.inject(PlatformService);
    });

    it('should not detect native platform', () => {
      expect(service.isNative()).toBe(false);
      expect(service.isBrowser()).toBe(true);
    });

    it('should return web as platform', () => {
      expect(service.platform()).toBe('web');
    });

    it('should not identify as iOS or Android', () => {
      expect(service.isIOS()).toBe(false);
      expect(service.isAndroid()).toBe(false);
    });

    it('should return 0.8 JPEG quality for desktop browser', () => {
      // Mock desktop dimensions (> 600px shortest side)
      Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });

      // Recreate service to pick up new dimensions
      service = TestBed.inject(PlatformService);
      
      expect(service.jpegQuality()).toBe(0.8);
    });
  });

  describe('tablet detection', () => {
    beforeEach(() => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
      spyOn(Capacitor, 'getPlatform').and.returnValue('web');
    });

    it('should detect tablet when shortest side > 600px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });

      service = TestBed.inject(PlatformService);
      
      expect(service.isTablet()).toBe(true);
    });

    it('should not detect tablet when shortest side <= 600px (portrait phone)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 812, configurable: true });

      service = TestBed.inject(PlatformService);
      
      expect(service.isTablet()).toBe(false);
    });

    it('should not detect tablet when shortest side <= 600px (landscape phone)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 812, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 375, configurable: true });

      service = TestBed.inject(PlatformService);
      
      expect(service.isTablet()).toBe(false);
    });

    it('should return 0.7 JPEG quality for tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });

      service = TestBed.inject(PlatformService);
      
      expect(service.jpegQuality()).toBe(0.7);
    });

    it('should detect edge case: exactly 600px shortest side is NOT a tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

      service = TestBed.inject(PlatformService);
      
      expect(service.isTablet()).toBe(false);
    });

    it('should detect edge case: 601px shortest side IS a tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 601, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

      service = TestBed.inject(PlatformService);
      
      expect(service.isTablet()).toBe(true);
    });
  });

  describe('signal reactivity', () => {
    beforeEach(() => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      spyOn(Capacitor, 'getPlatform').and.returnValue('ios');
      service = TestBed.inject(PlatformService);
    });

    it('should expose readonly signals', () => {
      // Signals should be callable and return values
      expect(service.isNative()).toBe(true);
      expect(service.isBrowser()).toBe(false);
      expect(service.platform()).toBe('ios');
      expect(typeof service.isTablet()).toBe('boolean');
    });

    it('should not allow mutation of readonly signals', () => {
      // TypeScript prevents this at compile time, but at runtime the signals are readonly
      expect(() => {
        // @ts-expect-error - Testing runtime readonly behavior
        service.isNative.set(false);
      }).toThrow();
    });
  });
});
