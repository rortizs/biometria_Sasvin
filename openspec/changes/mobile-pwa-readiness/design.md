# Design: Mobile App (Capacitor) + Kiosk Tablet Readiness

## Technical Approach

Introduce a **platform abstraction layer** that cleanly separates native Capacitor APIs from browser APIs, then harden CameraService and GeolocationService to work reliably across both contexts. The Capacitor native app (employee attendance) is Priority 1; the PWA kiosk tablet (employee registration) is Priority 2. Admin panel is untouched.

The core strategy:
1. **PlatformService** detects the runtime environment once at bootstrap and exposes signal-based state
2. **CameraService** and **GeolocationService** consume PlatformService to branch between native plugins and browser APIs
3. **Capacitor project** wraps the existing Angular build output — zero changes to the Angular build itself
4. **PWA infrastructure** is additive and only affects `index.html`, `angular.json`, and `app.config.ts`
5. **Mobile attendance flow** gets dedicated routes under `/attendance/*` that are independent from the existing `/kiosk` and `/admin/*` routes

## Architecture Decisions

### Decision: Signal-based PlatformService as injectable singleton

**Choice**: Create `PlatformService` as a `providedIn: 'root'` injectable that exposes `readonly` signals (`isNative`, `isBrowser`, `isTablet`, `platform`). Detection runs once in the constructor using `Capacitor.isNativePlatform()`.

**Alternatives considered**:
- **InjectionToken-based factory**: Provide a plain object via `InjectionToken<PlatformInfo>`. Rejected because it can't be consumed as easily in templates and doesn't align with the project's signal-based patterns.
- **Functional helper (isPlatformNative())**: Simple function instead of a service. Rejected because it can't be injected, can't be mocked in tests, and other services (Camera, Geo) need to `inject()` it.

**Rationale**: The codebase consistently uses `providedIn: 'root'` singletons with signals (see `CameraService.active`, `CameraService.error`). Following this pattern keeps the architecture consistent. Signals enable reactive UI binding (e.g., showing native-specific UI) without extra change detection complexity.

### Decision: CameraService uses getUserMedia for BOTH Capacitor and browser — no @capacitor/camera plugin

**Choice**: Use `navigator.mediaDevices.getUserMedia` as the universal camera API. Do NOT use `@capacitor/camera` plugin.

**Alternatives considered**:
- **@capacitor/camera plugin**: The plugin is designed for photo capture (opens native camera UI, returns a single photo). Rejected because the attendance flow requires a LIVE VIDEO STREAM for real-time face scanning with overlay guides. `@capacitor/camera` does not provide a video stream.
- **@nicklason/capacitor-camera-preview**: Third-party plugin that provides streaming. Rejected because it adds risk (maintenance, compatibility) and `getUserMedia` works fine in Capacitor's WebView (WKWebView on iOS, Chromium on Android).

**Rationale**: `getUserMedia` works in both Capacitor's WebView and regular browsers. The kiosk and attendance flows BOTH need live video preview with overlay, not a native camera capture dialog. Capacitor's WebView on iOS (WKWebView from iOS 14.3+) and Android (Chrome-based) both support `getUserMedia` well. The hardening (resolution fallback, frame capping, visibility handling) applies identically in both contexts.

### Decision: @capacitor/geolocation for native GPS, browser API for web

**Choice**: Use `@capacitor/geolocation` plugin when `PlatformService.isNative()` is true, fall back to `navigator.geolocation` in browser.

**Alternatives considered**:
- **Browser API only**: `navigator.geolocation` works in Capacitor WebView. Rejected because the native plugin provides proper permission dialogs, background location access, and more reliable GPS on Android (uses fused location provider).
- **Native only**: Always use `@capacitor/geolocation`. Rejected because it requires Capacitor to be present, and the kiosk PWA runs in a regular browser.

**Rationale**: Geolocation permissions are the most problematic part of mobile web apps. On native, `@capacitor/geolocation` integrates with OS-level permission dialogs (including the "Open Settings" redirect when denied). On web, we fall back to the browser API with a manual "permission denied" UX flow. The dual path is necessary because the kiosk tablet is NOT a Capacitor app.

### Decision: Attendance check-in/check-out sends images array, not single image

**Choice**: Modify `AttendanceCheckInRequest` to accept `images: string[]` instead of `image: string`. Backend `AttendanceCheckIn` schema already supports the liveness multi-frame concept; the endpoint needs to accept the best frame from the array.

**Alternatives considered**:
- **Send only first frame**: Capture 3 frames for anti-spoofing but send only `images[0]`. Rejected because the backend may implement liveness detection across multiple frames in the future (the ONNX anti-spoofing pipeline is on the roadmap).
- **Separate liveness endpoint**: Send frames to `/faces/liveness-check` first, then send a single frame to `/attendance/check-in`. Rejected because it doubles the network round-trips and adds latency on mobile.

**Rationale**: Currently the kiosk component builds a request object `{ images }` but the `AttendanceCheckInRequest` type says `image: string`. This is a BUG in the current code — the request shape doesn't match the type. The backend `AttendanceCheckIn` schema also expects `image: str` (singular). We need to align this: either the backend accepts `images: list[str]` and picks the best frame, or the frontend sends only the best frame. Given the anti-spoofing roadmap, the correct fix is to update both backend schema and frontend type to accept `images: list[str]` and have the backend use the first valid frame for embedding while keeping all frames available for future liveness analysis.

### Decision: Canvas scaling to cap frame size at 1280px width

**Choice**: In `captureFrame()`, if the video's native width exceeds 1280px, create a canvas scaled down proportionally to 1280px width. Apply JPEG quality 0.7 on mobile (detected via PlatformService or viewport width), 0.8 on desktop.

**Alternatives considered**:
- **Constrain getUserMedia resolution to 1280x960**: Use `width: { max: 1280 }` in constraints. Rejected because not all browsers/devices honor `max` constraints, and the actual video resolution may still vary. Canvas scaling is deterministic.
- **No size cap, rely on JPEG quality only**: Reduce quality to 0.5 instead of capping resolution. Rejected because JPEG quality reduction introduces artifacts that degrade face recognition accuracy. Resolution reduction (bilinear interpolation) preserves face features better.

**Rationale**: A 4K phone camera at `videoWidth: 3840` produces a canvas of ~3840x2880 = 11 million pixels. `toDataURL('image/jpeg', 0.8)` on that yields ~2-4MB base64. At 3 frames, that's 6-12MB per attendance scan. Capping at 1280px reduces to ~1280x960 = 1.2 million pixels. At JPEG 0.7, each frame is ~100-200KB base64. 3 frames = ~300-600KB total. The `face_recognition` library works well at 1280px — it internally scales to 150px for HOG detection anyway.

### Decision: Capacitor project lives in frontend/ alongside the Angular project

**Choice**: `capacitor.config.ts`, `ios/`, and `android/` directories all live inside `frontend/`. The `webDir` in Capacitor config points to `dist/frontend/browser` (Angular's output).

**Alternatives considered**:
- **Separate `mobile/` directory at project root**: Keep Capacitor config and native projects outside `frontend/`. Rejected because Capacitor expects `webDir` relative to the config file, and the Angular build output is inside `frontend/dist/`. This would require path gymnastics.
- **Monorepo with Nx/Turbo**: Extract to a proper monorepo. Rejected due to the 16-day timeline — too much tooling overhead.

**Rationale**: Capacitor's CLI expects to run from the directory containing `capacitor.config.ts`. Having it in `frontend/` means `npx cap sync` and `npx cap open` work naturally from the Angular project directory. The `ios/` and `android/` directories ARE committed to git (NOT gitignored) because they contain native configuration (Info.plist, AndroidManifest.xml, permission strings, splash screen configs) that must be version-controlled.

### Decision: Dedicated /attendance routes for mobile app, separate from /kiosk

**Choice**: Create a new route tree `/attendance/*` for the mobile app flow (login -> scan face -> verify GPS -> success). The existing `/kiosk` route stays for the shared tablet.

**Alternatives considered**:
- **Reuse /kiosk with conditional layout**: Detect Capacitor and show a different UI within the same KioskComponent. Rejected because the kiosk and mobile flows are fundamentally different — kiosk is public/unauthenticated (shared device), mobile is personal/authenticated (employee's phone).
- **Capacitor deep link to /kiosk**: Just open the kiosk in Capacitor. Rejected because the kiosk flow doesn't require login (it identifies via face), but the mobile app should authenticate the employee first (the phone is personal, so we know WHO it is).

**Rationale**: The mobile app flow is:
1. Employee opens app -> login screen (or auto-login with stored token)
2. After auth, see "Mark Attendance" screen with camera
3. Scan face (verification, not identification — we already know WHO they are from login)
4. GPS verification
5. Success/error feedback

This is structurally different from the kiosk flow (public device, no login, face IDENTIFICATION). Separate routes keep the logic clean and avoid over-complicated conditional rendering.

### Decision: Service Worker only in production builds, disabled in Capacitor

**Choice**: Register `provideServiceWorker('ngsw-worker.js', { enabled: environment.production && !isCapacitor() })` where `isCapacitor()` checks `window.Capacitor?.isNativePlatform()`.

**Alternatives considered**:
- **Enable SW in Capacitor too**: Cache assets in the WebView. Rejected because Capacitor already bundles all assets locally — the SW would fight with Capacitor's asset loading and cause update conflicts.
- **No service worker at all**: Skip PWA caching. Rejected because the kiosk tablet needs installability and offline app shell.

**Rationale**: The service worker serves the kiosk tablet PWA use case (installability, offline app shell, update management). In Capacitor, the WebView loads assets from the local filesystem (bundled at build time), so a service worker is redundant and can cause stale-cache bugs when `cap sync` updates web assets.

### Decision: 100vh -> 100dvh globally, not just in affected components

**Choice**: Replace ALL instances of `100vh` with `100dvh` across the codebase. Add a CSS custom property `--app-vh: 100dvh` in `:root` as a fallback strategy.

**Alternatives considered**:
- **JavaScript-based vh fix**: Calculate `window.innerHeight` on resize and set a CSS variable. Rejected because `100dvh` has full browser support since 2023 (Safari 15.4+, Chrome 108+) and is simpler.
- **Fix only kiosk and login**: Only fix the components that users will see on mobile. Rejected because the `100vh` bug is pernicious — it's better to fix globally now than discover it later in other views.

**Rationale**: `100dvh` (dynamic viewport height) accounts for mobile browser chrome (address bar, toolbar) that collapses/expands during scroll. The affected components are: `:host` in KioskComponent, `.kiosk` in KioskComponent, `.login-container` in LoginComponent. The `.employees-page` also uses `min-height: 100vh` but is admin-only (out of scope for mobile). Still, fixing it is zero-risk and prevents future issues.

## Data Flow

### Mobile Attendance Flow

```
  Employee App (Capacitor)
  ========================

  ┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
  │  Login   │────→│ Attendance   │────→│  GPS Verify  │────→│ Success  │
  │  Screen  │     │  Face Scan   │     │  (inline)    │     │ Screen   │
  └─────────┘     └──────┬───────┘     └──────────────┘     └──────────┘
                         │
                    captureFrames(3)
                         │
                    ┌────▼────────────────────────────────┐
                    │        CameraService                 │
                    │  getUserMedia (same for both envs)   │
                    │  ┌─ resolution fallback chain        │
                    │  ├─ canvas scale to max 1280px       │
                    │  ├─ JPEG quality 0.7 (mobile)        │
                    │  └─ visibility change pause/resume   │
                    └────┬────────────────────────────────┘
                         │
                    ┌────▼────────────────────────────────┐
                    │       GeolocationService              │
                    │  PlatformService.isNative()?          │
                    │  ├─ YES: @capacitor/geolocation       │
                    │  └─ NO:  navigator.geolocation        │
                    │  + permission check + retry flow      │
                    └────┬────────────────────────────────┘
                         │
                    ┌────▼────────────────────────────────┐
                    │     POST /api/v1/attendance/check-in  │
                    │     { images[], latitude, longitude } │
                    └────┬────────────────────────────────┘
                         │
                    ┌────▼────────────────────────────────┐
                    │     Backend: face_recognition         │
                    │     → find_best_match (pgvector)      │
                    │     → validate_location (PostGIS)     │
                    │     → create AttendanceRecord          │
                    └─────────────────────────────────────┘
```

### Camera Initialization Sequence

```
  Component          CameraService         PlatformService       Browser/Native
  ─────────          ─────────────         ───────────────       ──────────────
      │                    │                      │                    │
      │  start(videoEl)    │                      │                    │
      │───────────────────→│                      │                    │
      │                    │  isNative()?         │                    │
      │                    │─────────────────────→│                    │
      │                    │  false (signal)       │                    │
      │                    │←─────────────────────│                    │
      │                    │                      │                    │
      │                    │  getUserMedia({                           │
      │                    │    width: {ideal: 1280, max: 1920},      │
      │                    │    height: {ideal: 960, max: 1440},      │
      │                    │    facingMode: 'user'                     │
      │                    │  })                                       │
      │                    │─────────────────────────────────────────→│
      │                    │                                           │
      │                    │  [if OverconstrainedError]               │
      │                    │  getUserMedia({                           │
      │                    │    width: {ideal: 960},                   │
      │                    │    height: {ideal: 720}                   │
      │                    │  })                                       │
      │                    │─────────────────────────────────────────→│
      │                    │                                           │
      │                    │  [if OverconstrainedError again]         │
      │                    │  getUserMedia({                           │
      │                    │    video: { facingMode: 'user' }          │
      │                    │  })  ← accept ANY resolution              │
      │                    │─────────────────────────────────────────→│
      │                    │                                           │
      │                    │  MediaStream                              │
      │                    │←─────────────────────────────────────────│
      │                    │                                           │
      │                    │  videoEl.srcObject = stream               │
      │                    │  videoEl.setAttribute('playsinline','')  │
      │                    │  videoEl.play()                           │
      │                    │  listenVisibilityChange()                 │
      │                    │  isActive.set(true)                       │
      │  Promise<void>     │                                           │
      │←──────────────────│                                           │
```

### Geolocation Permission Flow

```
  Component         GeolocationService      PlatformService        Native/Browser
  ─────────         ──────────────────      ───────────────        ──────────────
      │                    │                      │                      │
      │  getCurrentPos()   │                      │                      │
      │───────────────────→│                      │                      │
      │                    │  isNative()?         │                      │
      │                    │─────────────────────→│                      │
      │                    │                      │                      │
      │ ┌─ IF NATIVE ─────────────────────────────────────────────────┐ │
      │ │                  │                      │                   │ │
      │ │                  │  Geolocation.checkPermissions()          │ │
      │ │                  │─────────────────────────────────────────→│ │
      │ │                  │  { location: 'prompt' | 'granted' |     │ │
      │ │                  │             'denied' }                   │ │
      │ │                  │←────────────────────────────────────────│ │
      │ │                  │                      │                   │ │
      │ │                  │  [if 'prompt']        │                   │ │
      │ │                  │  Geolocation.requestPermissions()        │ │
      │ │                  │─────────────────────────────────────────→│ │
      │ │                  │  OS permission dialog shown               │ │
      │ │                  │←────────────────────────────────────────│ │
      │ │                  │                      │                   │ │
      │ │                  │  [if 'denied']        │                   │ │
      │ │                  │  throw GeoError('PERMISSION_DENIED',     │ │
      │ │                  │    hint: 'Abrí Configuración > ...')     │ │
      │ │                  │                      │                   │ │
      │ │                  │  [if 'granted']       │                   │ │
      │ │                  │  Geolocation.getCurrentPosition({        │ │
      │ │                  │    enableHighAccuracy: true,              │ │
      │ │                  │    timeout: 15000,                        │ │
      │ │                  │    maximumAge: 5000                       │ │
      │ │                  │  })                                       │ │
      │ │                  │─────────────────────────────────────────→│ │
      │ └─────────────────────────────────────────────────────────────┘ │
      │                    │                      │                      │
      │ ┌─ IF BROWSER ────────────────────────────────────────────────┐ │
      │ │                  │                      │                   │ │
      │ │                  │  permissions.query({name: 'geolocation'})│ │
      │ │                  │─────────────────────────────────────────→│ │
      │ │                  │  { state: 'granted'|'prompt'|'denied' } │ │
      │ │                  │←────────────────────────────────────────│ │
      │ │                  │                      │                   │ │
      │ │                  │  [if 'denied']        │                   │ │
      │ │                  │  throw GeoError('PERMISSION_DENIED')     │ │
      │ │                  │                      │                   │ │
      │ │                  │  navigator.geolocation.getCurrentPosition│ │
      │ │                  │─────────────────────────────────────────→│ │
      │ └─────────────────────────────────────────────────────────────┘ │
      │                    │                      │                      │
      │  Observable<GeoPos │ or GeoError>         │                      │
      │←──────────────────│                      │                      │
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/package.json` | Modify | Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/geolocation`, `@capacitor/app`, `@capacitor/splash-screen`, `@angular/service-worker` |
| `frontend/capacitor.config.ts` | Create | Capacitor config: appId `com.sasvin.biometria`, webDir `dist/frontend/browser`, plugins config |
| `frontend/ios/` | Create | Capacitor iOS project (generated by `npx cap add ios`) — committed to git |
| `frontend/android/` | Create | Capacitor Android project (generated by `npx cap add android`) — committed to git |
| `frontend/src/app/core/services/platform.service.ts` | Create | Platform detection: `isNative`, `isBrowser`, `isTablet`, `platform` signals |
| `frontend/src/app/core/services/camera.service.ts` | Modify | Resolution fallback chain, canvas scaling to 1280px max, JPEG quality per platform, visibility change handler, double-tap guard on `captureFrames()`, `playsinline` enforcement |
| `frontend/src/app/core/services/geolocation.service.ts` | Modify | Capacitor plugin bridge, permission state checking, retry flow, typed errors (`GeoError` class), `maximumAge: 5000` for kiosk, `timeout: 15000` |
| `frontend/src/app/core/models/geolocation.model.ts` | Create | `GeoError` class with `code` (PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT) and `hint` (user-facing action text) |
| `frontend/src/app/core/models/attendance.model.ts` | Modify | Change `AttendanceCheckInRequest.image` to `images: string[]`; add `images` field |
| `frontend/src/app/features/kiosk/kiosk.component.ts` | Modify | `100vh` -> `100dvh`, integrate visibility change via CameraService, touch target audit |
| `frontend/src/app/features/auth/pages/login/login.component.ts` | Modify | `100vh` -> `100dvh`, `font-size: 16px` on inputs (prevent iOS zoom) |
| `frontend/src/app/features/admin/pages/employees/employees.component.ts` | Modify | Remove duplicate camera logic (lines 522-553), use `CameraService` instead of direct `getUserMedia` |
| `frontend/src/app/features/attendance/attendance-scan.component.ts` | Create | Mobile attendance screen: camera viewfinder, capture button, GPS status, result overlay |
| `frontend/src/app/features/attendance/attendance-success.component.ts` | Create | Post-scan success screen with employee name, time, location status |
| `frontend/src/app/app.routes.ts` | Modify | Add `/attendance` route tree for mobile app flow |
| `frontend/src/app/app.config.ts` | Modify | Add `provideServiceWorker()` for PWA |
| `frontend/src/index.html` | Modify | Viewport meta (`viewport-fit=cover`, `maximum-scale=1`), theme-color, apple meta tags, font preconnect links |
| `frontend/src/styles.scss` | Modify | Add `--app-vh: 100dvh` custom property, fix any global `100vh` usages |
| `frontend/public/manifest.webmanifest` | Create | PWA manifest (name, icons, start_url, display: standalone, theme_color, background_color) |
| `frontend/public/icons/` | Create | PWA icon set: icon-72x72.png through icon-512x512.png |
| `frontend/ngsw-config.json` | Create | Angular service worker config: app shell cached, API network-first, images never cached |
| `frontend/angular.json` | Modify | Add `serviceWorker: "ngsw-config.json"` to production build config, add manifest to assets |
| `frontend/src/environments/environment.ts` | Modify | Add `capacitor: false` flag |
| `frontend/src/environments/environment.prod.ts` | Modify | Add `capacitor: false` flag (runtime detection via PlatformService, not build flag) |
| `backend/app/schemas/attendance.py` | Modify | Change `AttendanceCheckIn.image` to `images: list[str]`, keep `image` as optional alias for backward compat |
| `backend/app/api/v1/endpoints/attendance.py` | Modify | Accept `images` list, use first valid frame for face matching |
| `.gitignore` | Modify | Add `frontend/ios/App/Pods/`, `frontend/android/.gradle/`, `frontend/android/app/build/` (build artifacts, NOT native project config) |

## Interfaces / Contracts

### PlatformService

```typescript
// frontend/src/app/core/services/platform.service.ts

import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export type PlatformType = 'ios' | 'android' | 'web';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly _isNative = signal(Capacitor.isNativePlatform());
  private readonly _platform = signal<PlatformType>(
    Capacitor.getPlatform() as PlatformType
  );

  readonly isNative = this._isNative.asReadonly();
  readonly isBrowser = signal(!Capacitor.isNativePlatform()).asReadonly();
  readonly platform = this._platform.asReadonly();

  /** Heuristic: tablet if screen shortest side > 600px */
  readonly isTablet = signal(
    Math.min(window.innerWidth, window.innerHeight) > 600
  ).asReadonly();

  /** True if running inside Capacitor AND on iOS */
  isIOS(): boolean {
    return this._platform() === 'ios';
  }

  /** True if running inside Capacitor AND on Android */
  isAndroid(): boolean {
    return this._platform() === 'android';
  }
}
```

### CameraService (modified)

```typescript
// frontend/src/app/core/services/camera.service.ts

export interface CameraConfig {
  width: number;
  height: number;
  facingMode: 'user' | 'environment';
  maxCaptureWidth: number;  // NEW: max canvas width for captureFrame
  jpegQuality: number;      // NEW: 0.0–1.0
}

const DEFAULT_CONFIG: CameraConfig = {
  width: 1280,        // was 640
  height: 960,        // was 480
  facingMode: 'user',
  maxCaptureWidth: 1280,
  jpegQuality: 0.8,
};

const MOBILE_CONFIG: Partial<CameraConfig> = {
  jpegQuality: 0.7,
  maxCaptureWidth: 1280,
};

// Resolution fallback chain
const RESOLUTION_CHAIN: Array<{ width: number; height: number }> = [
  { width: 1280, height: 960 },
  { width: 960, height: 720 },
  { width: 640, height: 480 },
];
```

Key new methods:
- `captureFrame()` — now scales canvas to `maxCaptureWidth` if video exceeds it
- `captureFrames(count, delayMs)` — adds `capturing` signal guard against double-tap
- `pause()` / `resume()` — visibility change support (stop/restart tracks)
- Private `listenVisibilityChange()` / `removeVisibilityListener()` — auto-registered on `start()`, cleaned up on `stop()`

### GeolocationService (modified)

```typescript
// frontend/src/app/core/services/geolocation.service.ts

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type GeoErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NOT_SUPPORTED';

export class GeoError extends Error {
  constructor(
    public readonly code: GeoErrorCode,
    message: string,
    public readonly hint?: string,  // User-facing action hint
  ) {
    super(message);
    this.name = 'GeoError';
  }
}

export interface GeoConfig {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

const KIOSK_CONFIG: GeoConfig = {
  enableHighAccuracy: true,
  timeout: 15000,     // was 10000
  maximumAge: 5000,   // was 60000 — employee walks up, needs fresh fix
};

const MOBILE_CONFIG: GeoConfig = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 10000,
};
```

Key new methods:
- `getCurrentPosition(config?)` — returns `Observable<GeoPosition>` (no more `| null`)
- `checkPermission()` — returns `Observable<'granted' | 'prompt' | 'denied'>`
- `requestPermission()` — Capacitor: native dialog, Browser: triggers via getCurrentPosition
- Errors now throw `GeoError` instead of returning `null`

### AttendanceCheckIn Schema (backend change)

```python
# backend/app/schemas/attendance.py

class AttendanceCheckIn(BaseModel):
    images: list[str] = Field(..., min_length=1, max_length=5)  # Base64 encoded images
    image: str | None = None  # DEPRECATED: backward compat alias
    device_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode='before')
    @classmethod
    def handle_single_image(cls, data: dict) -> dict:
        """Backward compat: if 'image' provided but not 'images', wrap it."""
        if 'image' in data and 'images' not in data:
            data['images'] = [data['image']]
        return data
```

### Mobile Attendance Route Structure

```typescript
// Addition to app.routes.ts

{
  path: 'attendance',
  children: [
    {
      path: '',
      loadComponent: () =>
        import('./features/attendance/attendance-scan.component')
          .then(m => m.AttendanceScanComponent),
    },
  ],
},
```

### PWA Manifest

```json
{
  "name": "Sasvin Biometrico",
  "short_name": "Sasvin",
  "start_url": "/kiosk",
  "display": "standalone",
  "background_color": "#0a0e17",
  "theme_color": "#0a0e17",
  "orientation": "any",
  "icons": [
    { "src": "icons/icon-72x72.png", "sizes": "72x72", "type": "image/png" },
    { "src": "icons/icon-96x96.png", "sizes": "96x96", "type": "image/png" },
    { "src": "icons/icon-128x128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "icons/icon-144x144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "icons/icon-152x152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-384x384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### ngsw-config.json

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/manifest.webmanifest",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/icons/**"
        ]
      }
    }
  ],
  "dataGroups": [
    {
      "name": "api",
      "urls": ["/api/**"],
      "cacheConfig": {
        "strategy": "freshness",
        "maxSize": 0,
        "maxAge": "0u"
      }
    }
  ]
}
```

### Capacitor Configuration

```typescript
// frontend/capacitor.config.ts

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sasvin.biometria',
  appName: 'Sasvin Biometrico',
  webDir: 'dist/frontend/browser',
  server: {
    // For development: proxy to local backend
    // url: 'http://192.168.1.X:4200',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0a0e17',
    },
  },
};

export default config;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `PlatformService` detection logic | Mock `Capacitor.isNativePlatform()` and `getPlatform()`. Verify signals return correct values for web/ios/android. |
| Unit | `CameraService` resolution fallback | Mock `getUserMedia` to throw `OverconstrainedError` on first two calls, succeed on third. Verify fallback chain executes correctly. |
| Unit | `CameraService` canvas scaling | Create a mock video element with `videoWidth: 3840`. Call `captureFrame()` and verify the resulting base64 is from a 1280-wide canvas. |
| Unit | `CameraService` double-tap guard | Call `captureFrames()` twice rapidly. Verify the second call is a no-op (returns empty or same frames). |
| Unit | `GeolocationService` Capacitor path | Mock `PlatformService.isNative()` = true. Mock `@capacitor/geolocation`. Verify native plugin is called with correct config. |
| Unit | `GeolocationService` permission denied flow | Mock `checkPermission()` returning 'denied'. Verify `GeoError` with `PERMISSION_DENIED` code is thrown. |
| Unit | `GeolocationService` browser path | Mock `PlatformService.isNative()` = false. Mock `navigator.geolocation`. Verify browser API is called. |
| Integration | Attendance scan flow | In `AttendanceScanComponent`, mock Camera and Geo services. Verify the full scan -> capture -> verify GPS -> API call -> result display flow. |
| Integration | Kiosk 100dvh fix | Render KioskComponent. Verify computed styles use `dvh` not `vh`. |
| Integration | Backend images[] acceptance | Send POST `/attendance/check-in` with `{ images: [...], latitude, longitude }`. Verify response. |
| Integration | Backend backward compat | Send POST `/attendance/check-in` with `{ image: "...", latitude, longitude }` (old format). Verify it still works. |
| E2E | Mobile attendance on real device | Open Capacitor app on iPhone/Android. Login -> scan face -> verify GPS -> confirm attendance recorded in DB. |
| E2E | Kiosk on iPad Safari | Open `/kiosk` in Safari on iPad. Verify no address bar overlap, camera works, touch targets >= 44px. |
| E2E | PWA installability | Run Lighthouse PWA audit. Verify installable criteria pass. |

## Migration / Rollout

### Phase 1: Foundation (Days 1-4)

No data migration required. All changes are additive.

1. Install npm dependencies (`@capacitor/core`, `@capacitor/cli`, `@capacitor/geolocation`, `@capacitor/app`, `@capacitor/splash-screen`, `@angular/service-worker`)
2. Create `PlatformService`
3. Create `capacitor.config.ts`
4. Run `npx cap add ios` and `npx cap add android`
5. Fix `index.html` (viewport meta, theme-color, apple meta tags, font preconnect)
6. Fix all `100vh` -> `100dvh`
7. Create PWA manifest, icons, ngsw-config
8. Add `provideServiceWorker()` to `app.config.ts`
9. Modify `angular.json` for service worker

### Phase 2: Service Hardening (Days 5-8)

1. Refactor `CameraService` (resolution fallback, canvas scaling, visibility handler, double-tap guard)
2. Refactor `GeolocationService` (Capacitor bridge, permission flow, typed errors)
3. Fix `EmployeesComponent` to use `CameraService` instead of direct `getUserMedia`
4. Update backend `AttendanceCheckIn` schema to accept `images[]`
5. Update backend `/check-in` and `/check-out` endpoints
6. Update frontend `AttendanceCheckInRequest` type

### Phase 3: Mobile App Flow (Days 9-12)

1. Create `AttendanceScanComponent` and `AttendanceSuccessComponent`
2. Add `/attendance` routes
3. Integrate `@capacitor/app` lifecycle events (pause/resume camera)
4. Configure Capacitor splash screen
5. Build and test on real devices

### Phase 4: Polish + Testing (Days 13-16)

1. Kiosk orientation handling
2. PWA install prompt for tablets
3. Device testing matrix (iPhone, Android phone, iPad, Android tablet)
4. Bug fixes from device testing
5. Beta build generation

### Rollback Strategy

All changes are on `feature/mobile-pwa-readiness` branch. If beta is not viable by March 20:
- Branch is NOT merged to main
- Production continues on the current desktop-only build
- Partial cherry-pick possible: PWA + service hardening without Capacitor, or Capacitor without PWA

### Feature Flag Approach

No feature flags needed. The platform abstraction layer acts as a natural feature gate:
- `PlatformService.isNative()` = false in browser -> all Capacitor-specific code is inert
- Service worker disabled when `!environment.production` or `Capacitor.isNativePlatform()`
- New `/attendance` routes only relevant in Capacitor (no link from web UI)

## Open Questions

- [x] Should the mobile attendance flow require login? **YES** — the phone is personal, so we authenticate the employee first, then face scan is VERIFICATION (not identification). This reduces false positives.
- [ ] Backend `AttendanceCheckIn` currently expects `image: str` (singular). The kiosk sends `{ images }` which is a type mismatch. Need to confirm: should the backend change to accept `images: list[str]`, or should the frontend send only the first frame? **Recommendation: backend accepts `images[]`, uses first valid frame, keeps all for future liveness.** This requires a backend schema change.
- [ ] iOS enterprise distribution vs TestFlight for beta: TestFlight requires Apple review (24-48h). Enterprise distribution requires Enterprise Developer Program ($299/year). Which is available?
- [ ] Leaflet icons for offline kiosk: should we self-host Leaflet marker icons, or is the kiosk guaranteed to have internet? (Leaflet loads default icons from `unpkg.com` CDN.) This is a kiosk-specific concern, not blocking for mobile app.
- [ ] Font strategy for offline: Google Fonts are loaded via CSS `@import` in `styles.scss`. For true offline kiosk, should we self-host the fonts? Or is `font-display: swap` with system font fallback acceptable?
