import { TestBed } from '@angular/core/testing';
import { CameraService } from './camera.service';
import { PlatformService } from './platform.service';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

describe('CameraService', () => {
  let service: CameraService;
  let platformService: jasmine.SpyObj<PlatformService>;
  let mockVideoElement: HTMLVideoElement;
  let mockMediaStream: jasmine.SpyObj<MediaStream>;

  beforeEach(() => {
    // Mock PlatformService
    const platformSpy = jasmine.createSpyObj('PlatformService', ['jpegQuality', 'isNative']);
    platformSpy.jpegQuality.and.returnValue(0.8);
    platformSpy.isNative.and.returnValue(false);

    TestBed.configureTestingModule({
      providers: [
        CameraService,
        { provide: PlatformService, useValue: platformSpy },
      ],
    });

    service = TestBed.inject(CameraService);
    platformService = TestBed.inject(PlatformService) as jasmine.SpyObj<PlatformService>;

    // Create mock video element
    mockVideoElement = document.createElement('video');
    spyOn(mockVideoElement, 'play').and.returnValue(Promise.resolve());

    // Create mock MediaStream
    const mockTrack = jasmine.createSpyObj('MediaStreamTrack', ['stop']);
    mockMediaStream = jasmine.createSpyObj('MediaStream', ['getTracks']);
    mockMediaStream.getTracks.and.returnValue([mockTrack]);
  });

  afterEach(() => {
    service.stop();
  });

  describe('start', () => {
    beforeEach(() => {
      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.resolve(mockMediaStream)
      );
    });

    it('should start camera with default config', async () => {
      await service.start(mockVideoElement);

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 960 },
          facingMode: 'user',
        },
        audio: false,
      });

      expect(service.active()).toBe(true);
      expect(service.error()).toBeNull();
      expect(mockVideoElement.play).toHaveBeenCalled();
    });

    it('should start camera with custom facingMode', async () => {
      await service.start(mockVideoElement, { facingMode: 'environment' });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        jasmine.objectContaining({
          video: jasmine.objectContaining({
            facingMode: 'environment',
          }),
        })
      );
    });

    it('should set playsinline, muted, and autoplay attributes on video', async () => {
      await service.start(mockVideoElement);

      expect(mockVideoElement.getAttribute('playsinline')).toBe('true');
      expect(mockVideoElement.getAttribute('muted')).toBe('true');
      expect(mockVideoElement.getAttribute('autoplay')).toBe('true');
    });

    it('should use platform-appropriate JPEG quality', async () => {
      platformService.jpegQuality.and.returnValue(0.7);

      await service.start(mockVideoElement);

      expect(platformService.jpegQuality).toHaveBeenCalled();
    });

    it('should setup visibility listeners', async () => {
      spyOn(document, 'addEventListener');

      await service.start(mockVideoElement);

      expect(document.addEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        jasmine.any(Function)
      );
    });

    it('should setup Capacitor app state listener on native', async () => {
      platformService.isNative.and.returnValue(true);
      const mockListener = { remove: jasmine.createSpy('remove') };
      spyOn(App, 'addListener').and.returnValue(Promise.resolve(mockListener as any));

      await service.start(mockVideoElement);

      expect(App.addListener).toHaveBeenCalledWith(
        'appStateChange' as any,
        jasmine.any(Function)
      );
    });
  });

  describe('resolution fallback', () => {
    it('should try lower resolutions on OverconstrainedError', async () => {
      const overconstrainedError = new Error('OverconstrainedError');
      overconstrainedError.name = 'OverconstrainedError';

      let callCount = 0;
      spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          // Fail 1280x960
          return Promise.reject(overconstrainedError);
        } else if (callCount === 2) {
          // Succeed at 960x720
          return Promise.resolve(mockMediaStream);
        }
        return Promise.reject(new Error('Unexpected call'));
      });

      await service.start(mockVideoElement);

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
      expect(service.active()).toBe(true);
    });

    it('should try unconstrained resolution if all fail', async () => {
      const overconstrainedError = new Error('OverconstrainedError');
      overconstrainedError.name = 'OverconstrainedError';

      let callCount = 0;
      spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake((constraints: any) => {
        callCount++;
        if (callCount <= 3) {
          // Fail all constrained resolutions
          return Promise.reject(overconstrainedError);
        } else {
          // Succeed with unconstrained
          return Promise.resolve(mockMediaStream);
        }
      });

      await service.start(mockVideoElement);

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(4);
      expect(service.active()).toBe(true);

      // Last call should be unconstrained (no width/height)
      const lastCall = (navigator.mediaDevices.getUserMedia as jasmine.Spy).calls.mostRecent().args[0];
      expect(lastCall.video.width).toBeUndefined();
      expect(lastCall.video.height).toBeUndefined();
    });

    it('should fail immediately on NotAllowedError (permission denied)', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';

      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.reject(permissionError)
      );

      await expectAsync(service.start(mockVideoElement)).toBeRejected();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
      expect(service.error()).toContain('Permission denied');
    });

    it('should set error signal on camera access failure', async () => {
      const notFoundError = new Error('No camera found');
      notFoundError.name = 'NotFoundError';

      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.reject(notFoundError)
      );

      await expectAsync(service.start(mockVideoElement)).toBeRejected();

      expect(service.error()).toContain('No camera found');
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.resolve(mockMediaStream)
      );
    });

    it('should stop all tracks and set active to false', async () => {
      await service.start(mockVideoElement);
      expect(service.active()).toBe(true);

      service.stop();

      expect(mockMediaStream.getTracks).toHaveBeenCalled();
      const track = mockMediaStream.getTracks()[0];
      expect(track.stop).toHaveBeenCalled();
      expect(service.active()).toBe(false);
      expect(mockVideoElement.srcObject).toBeNull();
    });

    it('should remove visibility listeners', async () => {
      spyOn(document, 'removeEventListener');

      await service.start(mockVideoElement);
      service.stop();

      expect(document.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        jasmine.any(Function)
      );
    });

    it('should be safe to call when not started', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('captureFrame', () => {
    beforeEach(() => {
      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.resolve(mockMediaStream)
      );
    });

    it('should return null if camera is not active', () => {
      const result = service.captureFrame();
      expect(result).toBeNull();
    });

    it('should capture frame and return base64 JPEG', async () => {
      await service.start(mockVideoElement);

      // Mock video dimensions
      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 480, writable: true });

      const result = service.captureFrame();

      expect(result).not.toBeNull();
      expect(result).toContain('data:image/jpeg');
    });

    it('should scale down if video exceeds maxCaptureWidth', async () => {
      await service.start(mockVideoElement);

      // Mock high-resolution video
      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 1920, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 1080, writable: true });

      const canvasSpy = spyOn(document, 'createElement').and.callThrough();

      service.captureFrame();

      // Canvas should be scaled down to maxCaptureWidth (1280)
      const canvas = canvasSpy.calls.mostRecent().returnValue as HTMLCanvasElement;
      expect(canvas.width).toBe(1280);
      expect(canvas.height).toBe(720); // Proportional: 1080 * (1280/1920)
    });

    it('should not scale if video is within maxCaptureWidth', async () => {
      await service.start(mockVideoElement);

      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 480, writable: true });

      const canvasSpy = spyOn(document, 'createElement').and.callThrough();

      service.captureFrame();

      const canvas = canvasSpy.calls.mostRecent().returnValue as HTMLCanvasElement;
      expect(canvas.width).toBe(640);
      expect(canvas.height).toBe(480);
    });

    it('should use platform JPEG quality', async () => {
      platformService.jpegQuality.and.returnValue(0.7);

      await service.start(mockVideoElement);

      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 480, writable: true });

      const canvasSpy = spyOn(HTMLCanvasElement.prototype, 'toDataURL').and.returnValue('data:image/jpeg;base64,test');

      service.captureFrame();

      expect(canvasSpy).toHaveBeenCalledWith('image/jpeg', 0.7);
    });
  });

  describe('captureFrames', () => {
    beforeEach(() => {
      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.resolve(mockMediaStream)
      );
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should capture multiple frames with delay', async () => {
      await service.start(mockVideoElement);

      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 480, writable: true });

      const capturePromise = service.captureFrames(3, 250);

      // Fast-forward through delays
      jasmine.clock().tick(250);
      jasmine.clock().tick(250);

      const frames = await capturePromise;

      expect(frames.length).toBe(3);
      expect(frames[0]).toContain('data:image/jpeg');
    });

    it('should set capturing signal during capture', async () => {
      await service.start(mockVideoElement);

      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 480, writable: true });

      const capturePromise = service.captureFrames(2, 100);

      expect(service.capturing()).toBe(true);

      jasmine.clock().tick(100);

      await capturePromise;

      expect(service.capturing()).toBe(false);
    });

    it('should prevent double-tap (return empty if already capturing)', async () => {
      await service.start(mockVideoElement);

      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 480, writable: true });

      const firstCapture = service.captureFrames(3, 250);

      // Try to capture again immediately
      const secondCapture = service.captureFrames(2, 100);

      const secondFrames = await secondCapture;
      expect(secondFrames.length).toBe(0);

      jasmine.clock().tick(500);

      const firstFrames = await firstCapture;
      expect(firstFrames.length).toBe(3);
    });

    it('should capture with default count (3) and delay (250ms)', async () => {
      await service.start(mockVideoElement);

      Object.defineProperty(mockVideoElement, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(mockVideoElement, 'videoHeight', { value: 480, writable: true });

      const capturePromise = service.captureFrames();

      jasmine.clock().tick(500);

      const frames = await capturePromise;

      expect(frames.length).toBe(3);
    });
  });

  describe('visibility handling', () => {
    beforeEach(() => {
      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.resolve(mockMediaStream)
      );
    });

    it('should pause camera when page becomes hidden', async () => {
      await service.start(mockVideoElement);
      expect(service.active()).toBe(true);

      // Simulate visibility change to hidden
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(service.active()).toBe(false);
    });

    it('should resume camera when page becomes visible after being hidden', async () => {
      await service.start(mockVideoElement);

      // Hide
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(service.active()).toBe(false);

      // Show
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });

      // Mock getUserMedia for resume
      (navigator.mediaDevices.getUserMedia as jasmine.Spy).and.returnValue(
        Promise.resolve(mockMediaStream)
      );

      document.dispatchEvent(new Event('visibilitychange'));

      // Wait for async resume
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(service.active()).toBe(true);
    });
  });

  describe('getVideoElement', () => {
    beforeEach(() => {
      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.resolve(mockMediaStream)
      );
    });

    it('should return null when not started', () => {
      expect(service.getVideoElement()).toBeNull();
    });

    it('should return video element after start', async () => {
      await service.start(mockVideoElement);

      expect(service.getVideoElement()).toBe(mockVideoElement);
    });

    it('should return null after stop', async () => {
      await service.start(mockVideoElement);
      service.stop();

      expect(service.getVideoElement()).toBeNull();
    });
  });
});
