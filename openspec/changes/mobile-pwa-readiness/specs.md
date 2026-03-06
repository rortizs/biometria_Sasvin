# Delta Specs: Mobile PWA Readiness

**Change**: mobile-pwa-readiness
**Date**: 2026-03-04
**Status**: Draft
**Domains**: platform, camera, geolocation, kiosk-viewport, pwa-infrastructure, mobile-attendance

---

## Domain 1: Platform Detection (NEW)

### Purpose

Provide a unified platform detection service that allows camera, geolocation, and UI components to branch behavior based on the runtime environment: Capacitor native app on a phone, PWA/browser on a tablet, or regular desktop browser.

### Requirements

#### Requirement: Platform Identification

The system MUST detect whether the application is running inside a Capacitor native shell, a tablet browser/PWA, or a desktop browser. The detection MUST be available synchronously after app bootstrap as an injectable Angular service.

##### Scenario: App running inside Capacitor on a phone

- GIVEN the Angular app is loaded inside the Capacitor WebView
- WHEN `PlatformService` is injected and queried
- THEN `isNative()` MUST return `true`
- AND `isBrowser()` MUST return `false`
- AND `isTablet()` MUST return `false`
- AND `platform()` MUST return `'capacitor'`

##### Scenario: App running in Safari on an iPad (kiosk tablet)

- GIVEN the Angular app is loaded in Safari or installed as a home-screen PWA on an iPad
- WHEN `PlatformService` is injected and queried
- THEN `isNative()` MUST return `false`
- AND `isBrowser()` MUST return `true`
- AND `isTablet()` MUST return `true`
- AND `platform()` MUST return `'tablet'`

##### Scenario: App running in Chrome on a desktop machine

- GIVEN the Angular app is loaded in a desktop browser
- WHEN `PlatformService` is injected and queried
- THEN `isNative()` MUST return `false`
- AND `isBrowser()` MUST return `true`
- AND `isTablet()` MUST return `false`
- AND `platform()` MUST return `'browser'`

##### Scenario: Capacitor availability check uses official API

- GIVEN the Capacitor runtime may or may not be present in `window`
- WHEN `PlatformService` initializes
- THEN it MUST check for Capacitor via `Capacitor.isNativePlatform()` (from `@capacitor/core`)
- AND it MUST NOT rely solely on user-agent string parsing for native detection

##### Scenario: Tablet detection fallback via screen dimensions

- GIVEN user-agent detection for tablets is unreliable (iPad reports as Mac since iPadOS 13)
- WHEN `PlatformService` performs tablet detection
- THEN it SHOULD use a combination of: touch capability (`'ontouchstart' in window` or `navigator.maxTouchPoints > 0`) AND minimum screen dimension >= 768px AND NOT running in Capacitor
- AND it MAY refine detection using `navigator.userAgent` as a secondary signal

---

#### Requirement: JPEG Quality Configuration

The system MUST expose a method to determine JPEG quality based on the current platform context.

##### Scenario: JPEG quality on mobile/tablet

- GIVEN the app is running on Capacitor native or on a tablet
- WHEN a component requests JPEG quality from `PlatformService`
- THEN the service MUST return `0.7`

##### Scenario: JPEG quality on desktop

- GIVEN the app is running on a desktop browser
- WHEN a component requests JPEG quality from `PlatformService`
- THEN the service MUST return `0.8`

---

## Domain 2: Camera Service (DELTA — modifies existing `camera.service.ts`)

### MODIFIED Requirements

#### Requirement: Camera Stream Initialization (was: single resolution attempt)

The system MUST attempt to acquire a camera stream using a resolution fallback chain instead of a single `ideal` constraint.

(Previously: `getUserMedia` was called once with `{ width: { ideal: 640 }, height: { ideal: 480 } }` and failed entirely if the constraint was not satisfiable.)

##### Scenario: Resolution fallback chain — happy path

- GIVEN a device camera supports 1280x960
- WHEN `CameraService.start()` is called
- THEN the service MUST attempt `getUserMedia` with `{ width: { ideal: 1280 }, height: { ideal: 960 } }`
- AND the stream MUST be assigned to the video element

##### Scenario: Resolution fallback chain — first resolution fails

- GIVEN a device camera does not support 1280x960 (constraint throws `OverconstrainedError`)
- WHEN `CameraService.start()` is called
- THEN the service MUST catch the error and retry with `{ width: { ideal: 960 }, height: { ideal: 720 } }`
- AND if that also fails, retry with `{ width: { ideal: 640 }, height: { ideal: 480 } }`
- AND if ALL specific resolutions fail, retry with `{ video: { facingMode } }` (no resolution constraints)

##### Scenario: Resolution fallback chain — all resolutions fail

- GIVEN the device has no camera or all `getUserMedia` calls are rejected
- WHEN `CameraService.start()` exhausts all fallback attempts
- THEN the service MUST set the `error` signal with a descriptive message
- AND the service MUST throw an error
- AND `active` signal MUST remain `false`

##### Scenario: Camera start on Capacitor native

- GIVEN the app is running inside Capacitor (`PlatformService.isNative() === true`)
- WHEN `CameraService.start()` is called with mode `'stream'` (for live preview like kiosk/attendance)
- THEN the service SHOULD still use `getUserMedia` for the live video feed (Capacitor WebView supports it)
- AND the resolution fallback chain MUST still apply

##### Scenario: Playsinline enforcement

- GIVEN a video element is provided to `CameraService.start()`
- WHEN the stream is assigned to the video element
- THEN the service MUST set `videoEl.setAttribute('playsinline', 'true')` programmatically
- AND the service MUST set `videoEl.setAttribute('muted', 'true')`
- AND the service MUST set `videoEl.setAttribute('autoplay', 'true')`

---

#### Requirement: Frame Capture Size Cap (was: full resolution capture)

The system MUST scale captured frames down to a maximum width before encoding to JPEG.

(Previously: `captureFrame()` used `videoWidth`/`videoHeight` directly, producing multi-megabyte base64 strings on high-resolution mobile cameras.)

##### Scenario: Frame capture on a 4K camera

- GIVEN the video element reports `videoWidth: 3840, videoHeight: 2160`
- WHEN `captureFrame()` is called
- THEN the canvas MUST be scaled so that `width <= 1280` pixels
- AND the height MUST be proportionally scaled to maintain aspect ratio
- AND the resulting `toDataURL` output MUST be `image/jpeg` with the platform-appropriate quality (0.7 or 0.8)

##### Scenario: Frame capture on a camera already at or below 1280px

- GIVEN the video element reports `videoWidth: 640, videoHeight: 480`
- WHEN `captureFrame()` is called
- THEN the canvas MUST use the original dimensions (no upscaling)
- AND the resulting `toDataURL` output MUST be `image/jpeg` with the platform-appropriate quality

##### Scenario: Captured frame payload size

- GIVEN a 1280px-wide JPEG at quality 0.7
- WHEN the frame is captured and base64-encoded
- THEN each frame SHOULD be <= 300KB in base64 size
- AND a set of 3 frames (for anti-spoofing) SHOULD be <= 1MB total

---

#### Requirement: Double-Tap Guard on Frame Capture

The system MUST prevent concurrent invocations of `captureFrames()`.

##### Scenario: User taps scan button rapidly twice

- GIVEN the user taps the "Marcar Entrada" button
- AND `captureFrames()` begins executing
- WHEN the user taps the button again before the first capture completes
- THEN the second invocation MUST be silently ignored (return empty array or the in-progress promise)
- AND only ONE set of frames MUST be sent to the backend

##### Scenario: Capture completes and guard resets

- GIVEN a `captureFrames()` call has completed (resolved or rejected)
- WHEN the user taps the scan button again
- THEN a new `captureFrames()` call MUST be allowed to proceed

---

#### Requirement: Visibility Change Handler

The system MUST pause the camera stream when the document or app is backgrounded and resume it when foregrounded.

##### Scenario: Browser tab is hidden (desktop/tablet)

- GIVEN the camera stream is active
- WHEN `document.visibilitychange` fires and `document.visibilityState === 'hidden'`
- THEN the service MUST stop all tracks on the current `MediaStream`
- AND the service MUST set `active` signal to `false`

##### Scenario: Browser tab is shown again (desktop/tablet)

- GIVEN the camera stream was paused due to visibility change
- WHEN `document.visibilitychange` fires and `document.visibilityState === 'visible'`
- THEN the service MUST re-acquire the stream using the same configuration (resolution fallback chain)
- AND the service MUST re-assign the stream to the same video element
- AND the service MUST set `active` signal to `true` on success

##### Scenario: Capacitor app is backgrounded (iOS/Android)

- GIVEN the app is running inside Capacitor and the camera is active
- WHEN the Capacitor `App` plugin fires `appStateChange` with `isActive === false`
- THEN the service MUST stop all tracks on the current `MediaStream`
- AND the service MUST set `active` signal to `false`

##### Scenario: Capacitor app is foregrounded

- GIVEN the app was backgrounded in Capacitor and the camera was paused
- WHEN the Capacitor `App` plugin fires `appStateChange` with `isActive === true`
- THEN the service MUST re-acquire the stream and resume the video feed

##### Scenario: Visibility change when camera was already stopped

- GIVEN the camera was stopped intentionally via `CameraService.stop()`
- WHEN a visibility change event fires (hidden → visible)
- THEN the service MUST NOT attempt to re-acquire the stream

---

#### Requirement: Stream Cleanup on Destroy

The system MUST guarantee all camera resources are released when the consuming component is destroyed.

##### Scenario: Component using camera is destroyed

- GIVEN a component has called `CameraService.start()` and the camera is active
- WHEN the component's `ngOnDestroy` lifecycle fires and calls `CameraService.stop()`
- THEN ALL media stream tracks MUST be stopped
- AND the video element's `srcObject` MUST be set to `null`
- AND any `visibilitychange` or Capacitor `appStateChange` listeners registered by this session MUST be removed
- AND `active` signal MUST be `false`

##### Scenario: Stop called when already stopped

- GIVEN the camera is not active (`active() === false`)
- WHEN `CameraService.stop()` is called
- THEN it MUST be a no-op (no errors thrown)

---

### ADDED Requirements

#### Requirement: Capacitor Camera Plugin for Single-Shot Capture

The system MAY use the Capacitor Camera plugin (`@capacitor/camera`) for single-shot photo capture when running in native mode, as an alternative to `getUserMedia` frame extraction.

##### Scenario: Single-shot capture via Capacitor plugin

- GIVEN the app is running inside Capacitor
- AND a component requests a single photo (not a live stream)
- WHEN `CameraService.capturePhoto()` is called
- THEN the service SHOULD use `Camera.getPhoto()` from `@capacitor/camera` with `quality: 70`, `resultType: CameraResultType.Base64`, `source: CameraSource.Camera`
- AND the result MUST be returned as a base64-encoded JPEG string

##### Scenario: Capacitor Camera plugin not available (fallback)

- GIVEN the app is running in a browser (not Capacitor)
- WHEN `CameraService.capturePhoto()` is called
- THEN the service MUST fall back to `captureFrame()` using the live `getUserMedia` stream

---

## Domain 3: Geolocation Service (DELTA — modifies existing `geolocation.service.ts`)

### MODIFIED Requirements

#### Requirement: Position Freshness (was: 60s maximum age)

The system MUST request a GPS position with a `maximumAge` of 5000ms to ensure fresh coordinates for attendance marking.

(Previously: `maximumAge: 60000` — a cached position up to 1 minute old could be used, which is too stale for a walk-up kiosk scenario.)

##### Scenario: Employee walks up to kiosk and marks attendance

- GIVEN the kiosk requested a geolocation position 30 seconds ago
- WHEN a new `getCurrentPosition()` call is made
- THEN the Geolocation API MUST be called with `maximumAge: 5000`
- AND the cached position from 30 seconds ago MUST NOT be reused
- AND a fresh GPS fix MUST be obtained

##### Scenario: Two consecutive requests within 5 seconds

- GIVEN a position was acquired 3 seconds ago
- WHEN `getCurrentPosition()` is called again
- THEN the Geolocation API MAY return the cached position (within the 5s window)

---

#### Requirement: Typed Error Responses (was: silent null return)

The system MUST return structured error information instead of silently returning `null` on geolocation failure.

(Previously: `catchError` returned `of(null)` with only a `console.warn`, giving the UI no way to distinguish between error types.)

##### Scenario: User denies geolocation permission

- GIVEN the browser prompts for geolocation permission
- WHEN the user clicks "Deny" (or permission is already `'denied'`)
- THEN `getCurrentPosition()` MUST return an observable that emits a `GeoError` object with `code: 'PERMISSION_DENIED'`
- AND the error MUST include a user-friendly message in Spanish: `'Permiso de ubicación denegado'`

##### Scenario: GPS position times out

- GIVEN the device is in a location with poor GPS signal (indoors, underground)
- WHEN `getCurrentPosition()` is called and the timeout of 15000ms expires
- THEN the observable MUST emit a `GeoError` object with `code: 'TIMEOUT'`
- AND the error MUST include message: `'No se pudo obtener la ubicación a tiempo'`

##### Scenario: Position unavailable (hardware failure)

- GIVEN the device GPS hardware is disabled or malfunctioning
- WHEN `getCurrentPosition()` is called
- THEN the observable MUST emit a `GeoError` object with `code: 'UNAVAILABLE'`
- AND the error MUST include message: `'GPS no disponible en este dispositivo'`

##### Scenario: Geolocation API not supported at all

- GIVEN the browser/runtime does not support `navigator.geolocation`
- WHEN `getCurrentPosition()` is called
- THEN the observable MUST emit a `GeoError` object with `code: 'UNSUPPORTED'`
- AND the error MUST include message: `'Geolocalización no soportada en este navegador'`

---

#### Requirement: Timeout Configuration

The system MUST use a timeout of 15000ms for geolocation requests.

(Previously: `timeout: 10000` — may not be enough for a cold GPS fix on mobile devices coming from airplane mode or indoor locations.)

##### Scenario: Cold GPS fix on mobile phone

- GIVEN the phone has no recent GPS lock (just powered on or switched from airplane mode)
- WHEN `getCurrentPosition()` is called
- THEN the Geolocation API MUST be configured with `timeout: 15000`
- AND `enableHighAccuracy: true` MUST remain set

---

### ADDED Requirements

#### Requirement: Permission State Checking

The system MUST be able to check the current geolocation permission state before requesting a position.

##### Scenario: Check permission state — granted

- GIVEN the user has previously granted geolocation permission
- WHEN `GeolocationService.checkPermission()` is called
- THEN it MUST return `'granted'`

##### Scenario: Check permission state — prompt (not yet asked)

- GIVEN the user has never been asked for geolocation permission on this origin
- WHEN `GeolocationService.checkPermission()` is called
- THEN it MUST return `'prompt'`

##### Scenario: Check permission state — denied

- GIVEN the user has previously denied geolocation permission
- WHEN `GeolocationService.checkPermission()` is called
- THEN it MUST return `'denied'`

##### Scenario: Check permission on Capacitor native

- GIVEN the app is running inside Capacitor
- WHEN `GeolocationService.checkPermission()` is called
- THEN it MUST use the Capacitor Geolocation plugin's `checkPermissions()` method
- AND map the result to the same `'granted' | 'prompt' | 'denied'` type

##### Scenario: Permission API not available (fallback)

- GIVEN the browser does not support `navigator.permissions.query`
- WHEN `GeolocationService.checkPermission()` is called
- THEN it MUST return `'prompt'` as a safe default (attempt will be made)

---

#### Requirement: Capacitor Geolocation Plugin Integration

The system MUST use the Capacitor Geolocation plugin when running in native mode and fall back to the browser Geolocation API in browser mode.

##### Scenario: Get position on Capacitor native

- GIVEN the app is running inside Capacitor
- WHEN `GeolocationService.getCurrentPosition()` is called
- THEN it MUST use `Geolocation.getCurrentPosition()` from `@capacitor/geolocation`
- AND the result MUST be mapped to the same `GeoPosition` interface (`latitude`, `longitude`, `accuracy`)

##### Scenario: Get position on browser

- GIVEN the app is running in a browser (not Capacitor)
- WHEN `GeolocationService.getCurrentPosition()` is called
- THEN it MUST use `navigator.geolocation.getCurrentPosition()` (browser API)

##### Scenario: Request permission on Capacitor when denied

- GIVEN the Capacitor app has geolocation permission denied
- WHEN `GeolocationService.requestPermission()` is called
- THEN it MUST use `Geolocation.requestPermissions()` from the Capacitor plugin
- AND if the user grants permission in the OS settings dialog, the next `getCurrentPosition()` call MUST succeed

---

#### Requirement: GPS Acquisition Feedback

The system MUST expose an observable or signal indicating the current GPS acquisition state so the UI can display feedback.

##### Scenario: GPS acquiring indicator

- GIVEN the UI has called `getCurrentPosition()`
- WHEN the Geolocation API is processing the request (between call and response)
- THEN the service MUST expose a signal or observable with state `'acquiring'`
- AND the UI SHOULD display a "Obteniendo ubicación..." indicator

##### Scenario: GPS acquired with accuracy

- GIVEN the Geolocation API returns a position with accuracy 25 meters
- WHEN the service processes the response
- THEN the emitted `GeoPosition` MUST include the `accuracy` value in meters
- AND the UI MAY display the accuracy value if accuracy > 100m (to warn the user of low confidence)

---

## Domain 4: Kiosk Viewport and Touch (DELTA — modifies kiosk component + global styles)

### MODIFIED Requirements

#### Requirement: Viewport Height Units (was: 100vh)

The system MUST use `100dvh` (dynamic viewport height) instead of `100vh` for all fullscreen layouts in the kiosk and login pages.

(Previously: `:host { height: 100vh }` and `.kiosk { height: 100vh }` — on iOS Safari, 100vh includes the area behind the address bar, causing content to be clipped.)

##### Scenario: Kiosk displayed on iPad Safari with address bar visible

- GIVEN the kiosk page is loaded on iPad Safari
- AND the Safari address bar is visible (not scrolled away)
- WHEN the page renders
- THEN the kiosk content MUST fit entirely in the visible area without being clipped behind the address bar
- AND NO vertical scrollbar MUST appear

##### Scenario: Kiosk displayed on iPad Safari with address bar hidden

- GIVEN the kiosk page is loaded on iPad Safari
- AND the user has scrolled or the address bar has auto-hidden
- WHEN the page re-renders
- THEN the kiosk content MUST expand to fill the newly available viewport height

##### Scenario: Login page on iOS Safari

- GIVEN the login page is loaded on an iOS device
- WHEN the page renders
- THEN `.login-root` and `.login-container` MUST use `100dvh` instead of `100vh`
- AND the login form MUST be fully visible without scrolling

##### Scenario: Desktop browser unaffected

- GIVEN the app is loaded on a desktop browser (where `100dvh === 100vh`)
- WHEN the page renders
- THEN behavior MUST be identical to current behavior (no regression)

---

### ADDED Requirements

#### Requirement: Viewport Meta Configuration

The system MUST include comprehensive viewport meta tags in `index.html` for mobile compatibility.

##### Scenario: iOS notch handling

- GIVEN the app is running on an iPhone with a notch (or Dynamic Island)
- WHEN the page loads
- THEN `<meta name="viewport">` MUST include `viewport-fit=cover`
- AND CSS MUST be able to use `env(safe-area-inset-top)` etc. for padding adjustments

##### Scenario: Prevent zoom on input focus (iOS)

- GIVEN a user taps on a text input on an iOS device
- AND the input has `font-size < 16px`
- WHEN iOS Safari would normally auto-zoom to the input
- THEN the viewport meta MUST include `maximum-scale=1` to prevent this zoom behavior

##### Scenario: Theme color for browser chrome

- GIVEN the app is loaded in a mobile browser
- WHEN the browser renders the address bar / status bar
- THEN `<meta name="theme-color">` MUST be set to `#0a0e17` (matching the dark kiosk theme)

---

#### Requirement: Touch Target Sizing

All interactive elements in the kiosk interface MUST have a minimum touch target size of 44x44 CSS pixels.

##### Scenario: Scan button touch target

- GIVEN the kiosk is displayed on a touchscreen device
- WHEN the "Marcar Entrada/Salida" button is rendered
- THEN the button's clickable area MUST be at least 44x44px

##### Scenario: Special marking options touch targets

- GIVEN the special marking modal is open on a tablet
- WHEN the "Entrada" and "Salida" option buttons are rendered
- THEN each button MUST have a touch target of at least 44x44px

##### Scenario: Admin link in footer touch target

- GIVEN the kiosk footer shows the "Administración" link
- WHEN rendered on a touchscreen
- THEN the link's tappable area MUST be at least 44x44px (via padding if needed)

##### Scenario: Geo badge not interactive — no requirement

- GIVEN the geo badge in the kiosk header is informational only
- WHEN rendered on a touchscreen
- THEN it has no minimum touch target requirement (it is not interactive)

---

#### Requirement: Orientation Handling for Tablet Kiosk

The kiosk interface SHOULD prefer landscape orientation on tablets.

##### Scenario: Tablet kiosk in landscape

- GIVEN the kiosk is loaded on a tablet in landscape orientation
- WHEN the page renders
- THEN the layout MUST display correctly (header, camera, action area, footer all visible)

##### Scenario: Tablet kiosk in portrait

- GIVEN the kiosk is loaded on a tablet in portrait orientation
- WHEN the page renders
- THEN the layout MUST still be usable (no broken layout)
- BUT the UI MAY suggest rotating to landscape via a subtle indicator

##### Scenario: Phone always portrait

- GIVEN the kiosk/attendance flow is loaded on a phone
- WHEN the page renders
- THEN orientation handling MUST NOT interfere (phones are expected in portrait)

---

#### Requirement: Apple Standalone Mode Meta Tags

The system MUST include Apple-specific meta tags for standalone (home screen) app behavior on iPad kiosk.

##### Scenario: iPad kiosk installed as home screen app

- GIVEN an admin has added the kiosk URL to the iPad home screen ("Add to Home Screen")
- WHEN the app launches from the home screen icon
- THEN `<meta name="apple-mobile-web-app-capable" content="yes">` MUST be present
- AND `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` MUST be present
- AND the app MUST launch in fullscreen mode (no Safari chrome)

---

## Domain 5: PWA Infrastructure (NEW)

### Purpose

Provide Progressive Web App infrastructure for the kiosk tablet use case: installability, app shell caching, and update management. The PWA layer is primarily for the kiosk tablet. The Capacitor mobile app uses its own native update mechanism.

### Requirements

#### Requirement: Web App Manifest

The system MUST include a valid `manifest.webmanifest` file for PWA installability.

##### Scenario: Manifest content

- GIVEN the app is served to a browser
- WHEN the browser parses `<link rel="manifest" href="manifest.webmanifest">`
- THEN the manifest MUST include:
  - `name`: `'Sasvin Biométrico'`
  - `short_name`: `'Sasvin'`
  - `start_url`: `'/kiosk'`
  - `display`: `'standalone'`
  - `background_color`: `'#060810'`
  - `theme_color`: `'#0a0e17'`
  - `orientation`: `'any'`
  - `icons`: array with at least 192px and 512px PNG icons
  - `scope`: `'/'`

##### Scenario: Lighthouse PWA installability check

- GIVEN the production build is served over HTTPS
- WHEN Lighthouse PWA audit is run
- THEN the "Installable" category MUST pass (valid manifest, service worker, HTTPS)

---

#### Requirement: PWA Icon Set

The system MUST include PWA icons at standard sizes for cross-platform home screen installation.

##### Scenario: Android home screen icon

- GIVEN a user installs the PWA on Android via Chrome "Add to Home Screen"
- WHEN the icon is displayed on the home screen
- THEN a 192x192 PNG icon MUST be available
- AND a 512x512 PNG icon MUST be available (for splash screen)

##### Scenario: iOS home screen icon

- GIVEN a user adds to home screen on iOS Safari
- WHEN the icon is displayed
- THEN `<link rel="apple-touch-icon">` MUST reference a 180x180 PNG icon

---

#### Requirement: Service Worker Caching Strategy

The system MUST register an Angular service worker (`@angular/service-worker`) with differentiated caching strategies.

##### Scenario: App shell (JS, CSS, fonts) — cache-first

- GIVEN the app shell assets (JavaScript bundles, CSS, font files) have been cached by the service worker
- WHEN the kiosk page is loaded
- THEN the service worker MUST serve these assets from cache first
- AND check for updates in the background (stale-while-revalidate for the shell group)

##### Scenario: API calls — network-first

- GIVEN the kiosk calls backend endpoints (`/api/attendance/`, `/api/auth/`)
- WHEN the service worker intercepts these requests
- THEN the service worker MUST forward them to the network (network-first)
- AND the service worker MUST NOT cache API responses

##### Scenario: Face/biometric data — NEVER cache

- GIVEN the kiosk captures face frames and sends them to `/api/faces/` or `/api/attendance/check-in`
- WHEN these requests contain base64 image payloads
- THEN the service worker MUST NOT cache these requests or responses
- AND the `ngsw-config.json` MUST explicitly exclude `/api/` paths from all `dataGroups` cache strategies
- AND no face image data SHALL be stored in the service worker cache or IndexedDB by the service worker

##### Scenario: Static assets from CDN (fonts, icons)

- GIVEN Google Fonts CSS and font files are loaded from `fonts.googleapis.com` and `fonts.gstatic.com`
- WHEN the service worker intercepts these requests
- THEN the service worker SHOULD cache them for offline kiosk use
- AND the cache MAY use a long TTL (30 days) since font files are versioned by URL

---

#### Requirement: Install Prompt Handling

The system SHOULD capture and manage the browser's `beforeinstallprompt` event for kiosk tablet deployment.

##### Scenario: Admin installs PWA on tablet kiosk

- GIVEN the app is running in Chrome on an Android tablet
- AND the PWA criteria are met (manifest, service worker, HTTPS)
- WHEN the browser fires `beforeinstallprompt`
- THEN the app SHOULD store the event
- AND the app MAY display a subtle "Install" button in the kiosk footer (for initial setup only)

##### Scenario: Already installed as PWA

- GIVEN the app is already installed and running in standalone mode
- WHEN the app loads
- THEN no install prompt MUST be shown
- AND `display-mode: standalone` media query MUST match

---

#### Requirement: Update Strategy for 24/7 Kiosk

The system MUST handle service worker updates gracefully for a kiosk that runs continuously.

##### Scenario: New version available during idle

- GIVEN the kiosk is in `idle` mode (no active scan in progress)
- AND the service worker detects a new app version
- WHEN the kiosk has been idle for more than 60 seconds
- THEN the app SHOULD automatically reload to apply the update
- AND the user SHALL NOT see an update prompt (automatic for kiosk)

##### Scenario: New version available during active scan

- GIVEN the kiosk is in `scanning` or `success` mode
- AND the service worker detects a new app version
- WHEN the scan completes and the kiosk returns to `idle`
- THEN the update SHOULD be applied on the next idle cycle (deferred)
- AND the app MUST NOT reload during an active attendance operation

##### Scenario: Periodic update check

- GIVEN the kiosk runs 24/7 without page navigation
- WHEN the Angular service worker check interval fires
- THEN the service worker MUST check for updates at least every 6 hours
- AND `SwUpdate.checkForUpdate()` SHOULD be called on a periodic timer

---

## Domain 6: Mobile Attendance Flow (NEW)

### Purpose

Define the user experience for employees using their personal phones (via Capacitor native app) to mark attendance. This is a focused, minimal flow: open app, scan face, verify GPS, see result.

### Requirements

#### Requirement: Mobile App Shell

The system MUST provide a minimal navigation shell for the Capacitor mobile app that is distinct from the kiosk layout.

##### Scenario: Employee opens Capacitor app

- GIVEN the employee opens the Sasvin app on their phone
- WHEN the app loads
- THEN the app MUST display a mobile attendance screen (face scan + GPS)
- AND the app MUST NOT show the admin panel navigation
- AND the app MUST NOT show the kiosk header/footer chrome (clock, geo badge, admin link)

##### Scenario: Mobile attendance screen layout

- GIVEN the mobile attendance screen is displayed
- WHEN the screen renders on a phone (portrait)
- THEN the camera preview MUST occupy the top ~60% of the screen (fullscreen width, no side margins)
- AND a face guide overlay (oval) MUST be shown
- AND an instruction text MUST appear below the camera: "Centrá tu rostro y presioná escanear"
- AND a scan action button MUST be at the bottom with minimum 48x48px touch target

---

#### Requirement: Face Scan on Mobile

The system MUST capture face frames on mobile with the same anti-spoofing multi-frame approach used on kiosk.

##### Scenario: Happy path — face scan on phone

- GIVEN the employee is on the mobile attendance screen
- AND the camera is active and showing the front-facing camera feed
- WHEN the employee taps "Escanear"
- THEN the app MUST capture 3 frames with 250ms delay (same as kiosk)
- AND each frame MUST be capped at 1280px width and JPEG quality 0.7
- AND the frames MUST be sent to the backend along with GPS coordinates

##### Scenario: Camera permission denied on phone

- GIVEN the employee has denied camera permission for the Sasvin app
- WHEN the mobile attendance screen loads
- THEN the app MUST display a clear message: "Se necesita acceso a la cámara para marcar asistencia"
- AND the app MUST provide a button to open the device settings to grant permission
- AND the scan button MUST be disabled

##### Scenario: Camera permission revoked mid-session

- GIVEN the camera was active
- WHEN the OS revokes camera permission (or `getUserMedia` fails with `NotAllowedError`)
- THEN the app MUST stop the video stream
- AND display an error message with instructions to re-enable camera access

---

#### Requirement: GPS Verification on Mobile

The system MUST verify GPS location on mobile before or during the attendance scan.

##### Scenario: GPS acquired with good accuracy

- GIVEN the employee's phone has acquired a GPS position with accuracy <= 50 meters
- WHEN the employee taps "Escanear"
- THEN the GPS coordinates MUST be included in the attendance request
- AND a green location indicator MUST be visible on screen

##### Scenario: GPS acquiring — user sees feedback

- GIVEN the app has started but GPS has not yet locked
- WHEN the mobile attendance screen renders
- THEN a "Obteniendo ubicación..." indicator MUST be visible
- AND the scan button SHOULD still be enabled (backend validates location, not the frontend)

##### Scenario: GPS accuracy poor (> 100m)

- GIVEN the GPS returns a position with accuracy > 100 meters
- WHEN the mobile attendance screen displays the location status
- THEN a warning indicator SHOULD appear: "Precisión GPS baja (Xm)"
- AND the scan button MUST remain enabled (backend decides if location is acceptable)

##### Scenario: GPS denied on phone

- GIVEN the employee denied location permission
- WHEN the mobile attendance screen loads
- THEN a warning MUST be displayed: "Sin acceso a ubicación — la asistencia se registrará sin validación geográfica"
- AND the scan button MUST remain enabled (attendance without GPS is allowed but flagged by backend)

##### Scenario: GPS timeout on mobile

- GIVEN the phone cannot acquire a GPS fix within 15 seconds
- WHEN the timeout fires
- THEN a warning SHOULD appear: "No se pudo obtener ubicación"
- AND the scan button MUST remain enabled
- AND the attendance request MUST be sent without GPS coordinates

---

#### Requirement: Success and Error Feedback on Mobile

The system MUST display clear, time-limited feedback after an attendance scan attempt.

##### Scenario: Successful attendance check-in

- GIVEN the backend returns a successful attendance record
- WHEN the mobile app receives the response
- THEN the screen MUST display: employee name, "ENTRADA" or "SALIDA", timestamp, and schedule status
- AND a green success indicator MUST be shown
- AND the success screen MUST auto-dismiss after 5 seconds and return to the scan screen

##### Scenario: Anti-spoofing rejection on mobile

- GIVEN the backend detects a spoofing attempt (photo of a photo, screen display)
- WHEN the mobile app receives the error response
- THEN the screen MUST display a red error indicator
- AND the message MUST be: "No se detectó un rostro real. Mirá directo a la cámara e intentá de nuevo."
- AND the error screen MUST auto-dismiss after 4 seconds

##### Scenario: Face not recognized

- GIVEN the backend cannot match the face to any registered employee
- WHEN the mobile app receives the error response
- THEN the message MUST be: "Rostro no reconocido. Asegurate de tener tu rostro registrado en el sistema."
- AND the error screen MUST auto-dismiss after 4 seconds

##### Scenario: Network error during scan

- GIVEN the phone loses network connectivity during the attendance API call
- WHEN the HTTP request fails
- THEN the screen MUST display: "Error de conexión. Verificá tu conexión a internet e intentá de nuevo."
- AND the error screen MUST auto-dismiss after 5 seconds

---

#### Requirement: App Lifecycle on Mobile

The system MUST handle Capacitor app lifecycle events to manage camera and GPS resources.

##### Scenario: App backgrounded during scan

- GIVEN the employee is on the attendance screen with camera active
- WHEN the employee switches to another app or the phone locks
- THEN the camera stream MUST be released (tracks stopped)
- AND any in-progress API call SHOULD continue (not cancelled)

##### Scenario: App foregrounded after background

- GIVEN the app was backgrounded and camera was released
- WHEN the employee returns to the app
- THEN the camera stream MUST be re-acquired automatically
- AND the attendance screen MUST return to `idle` mode (ready for a new scan)

##### Scenario: App killed and cold-started

- GIVEN the OS killed the app while in background
- WHEN the employee opens the app again
- THEN the app MUST start fresh on the attendance screen
- AND no stale scan state MUST persist

##### Scenario: Phone call during scan

- GIVEN the employee receives a phone call during an active scan
- WHEN the OS interrupts the app
- THEN the camera MUST be released
- AND when the call ends and the app resumes, the camera MUST re-acquire
- AND the user MUST NOT see a stale scan result from before the interruption

---

## Domain 7: Font Loading Optimization (DELTA — modifies `styles.scss` and `index.html`)

### MODIFIED Requirements

#### Requirement: Font Loading Strategy (was: render-blocking @import)

The system MUST load Google Fonts via `<link>` tags in `index.html` with `rel="preconnect"` instead of `@import` in the CSS file.

(Previously: `@import url('https://fonts.googleapis.com/...')` in `styles.scss` blocked CSS parsing and delayed first paint.)

##### Scenario: Font loading does not block rendering

- GIVEN the app is loaded on a slow network (3G)
- WHEN the browser parses `index.html`
- THEN the Google Fonts request MUST be initiated via `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
- AND the font stylesheet MUST use `<link rel="stylesheet">` in the HTML `<head>` (not `@import` in SCSS)
- AND the `font-display: swap` parameter MUST be included in the Google Fonts URL
- AND the page MUST render with system fonts first, then swap to custom fonts when loaded

---

## Cross-Cutting Concerns

### Backward Compatibility

- All service modifications (CameraService, GeolocationService) MUST maintain their existing public API signatures. New methods are ADDED; existing methods are EXTENDED with backward-compatible parameters.
- The `PlatformService.isBrowser()` MUST return `true` when Capacitor is not present, ensuring all existing browser-path code continues to work without changes.
- Desktop browser behavior MUST NOT regress. All `100dvh` changes produce identical layout to `100vh` on desktop browsers.

### Security Constraints

- Face image data MUST NOT be cached by the service worker, stored in IndexedDB by the PWA infrastructure, or persisted in any client-side storage beyond the immediate API request.
- The Capacitor Camera plugin MUST NOT save captured photos to the device gallery.
- GPS coordinates MUST NOT be logged to the console in production builds.

### Performance Constraints

- Camera resolution fallback chain MUST complete within 5 seconds total (all attempts combined).
- Each captured frame (base64 JPEG) SHOULD NOT exceed 300KB.
- A full attendance scan payload (3 frames + GPS) SHOULD NOT exceed 1MB.
- Service worker cache size for the app shell SHOULD NOT exceed 5MB.

---

## Summary Table

| Domain | Type | Requirements | Scenarios |
|--------|------|-------------|-----------|
| Platform Detection | New | 2 | 7 |
| Camera Service | Delta (Modified + Added) | 6 (4 modified, 2 added) | 18 |
| Geolocation Service | Delta (Modified + Added) | 5 (3 modified, 2 added) | 14 |
| Kiosk Viewport & Touch | Delta (Modified + Added) | 4 (1 modified, 3 added) | 12 |
| PWA Infrastructure | New | 5 | 10 |
| Mobile Attendance Flow | New | 5 | 15 |
| Font Loading | Delta (Modified) | 1 | 1 |
| **Total** | | **28** | **77** |

### Coverage

- **Happy paths**: Covered for all 28 requirements
- **Edge cases**: Camera fallback chain, double-tap, visibility change when already stopped, GPS timeout, poor accuracy, permission denied, app killed, phone call interruption
- **Error states**: Camera denial, GPS denial, timeout, unavailable, network error, spoofing rejection, face not recognized, permission revoked mid-session

### Next Step

Ready for **design** (sdd-design) to define the technical architecture, sequence diagrams, and data flow for these specifications.
