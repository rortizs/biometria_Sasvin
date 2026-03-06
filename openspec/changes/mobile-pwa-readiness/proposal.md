# Proposal: Mobile App (Capacitor) + Kiosk Tablet Readiness

## Intent

The biometria_Sasvin system needs to be deployed on two mobile form factors within 16 days (beta deadline: March 20, 2026):

1. **Mobile App (Capacitor)** -- Employees use their personal phones to mark attendance via face scan + GPS verification. This is a native app distributed via app stores (or enterprise distribution), not a browser experience.
2. **Kiosk Tablet (PWA/Browser)** -- A shared tablet at the office entrance for first-time employee registration (face enrollment). This runs in a browser or installed PWA on the tablet.

Currently, the Angular frontend has ZERO mobile infrastructure: no Capacitor, no PWA manifest, no service worker, no viewport hardening, and camera/geolocation services lack mobile resilience. The app was built desktop-first and will fail on mobile devices due to oversized camera captures, missing visibility-change handlers, iOS Safari 100vh bugs, and no native plugin bridge.

**This change does NOT touch the admin panel.** Admin responsive redesign is a separate future SDD change.

## Scope

### In Scope

**Capacitor Integration (Priority 1 -- Mobile App)**
- Initialize Capacitor in the Angular project (`@capacitor/core`, `@capacitor/cli`)
- Configure `capacitor.config.ts` for iOS and Android platforms
- Integrate `@capacitor/camera` plugin for native camera permissions and capture
- Integrate `@capacitor/geolocation` plugin for native GPS with background support
- Create a platform detection service (`PlatformService`) to branch between native Capacitor APIs and browser APIs
- Mobile attendance flow: app shell, navigation, face scan screen, GPS verification, success/error feedback
- Add `@capacitor/app` for lifecycle events (background/foreground transitions)
- Add `@capacitor/splash-screen` for native app launch experience

**Camera Service Hardening (Both mobile app AND tablet kiosk)**
- Resolution fallback chain: try 1280x960 -> 960x720 -> 640x480 -> any available
- Max capture size capped at 1280px width (scale down via canvas before toDataURL)
- JPEG quality reduced to 0.7 for mobile, 0.8 for desktop
- `document.visibilitychange` listener to pause/release camera stream when app backgrounds
- `playsinline` enforcement at the service level (not just template attribute)
- Double-tap guard on `captureFrames()` (debounce or in-progress flag)
- Capacitor Camera plugin abstraction: use native camera when running in Capacitor, fall back to `getUserMedia` in browser

**Geolocation Service Hardening (Both mobile app AND tablet kiosk)**
- Capacitor Geolocation plugin abstraction: native GPS in Capacitor, browser API in browser
- `maximumAge` reduced to 5000ms for kiosk (employee walks up, needs fresh position)
- Permission state checking via `navigator.permissions.query()` (browser) or Capacitor permissions API
- Retry logic: denied -> prompt user to open settings -> retry
- Better error feedback (expose typed errors, not just `null`)

**Kiosk Tablet Optimization (Priority 2)**
- Fix `100vh` -> `100dvh` in kiosk component (iOS Safari address bar bug)
- Viewport meta: add `viewport-fit=cover`, `maximum-scale=1` (prevent input zoom)
- Touch target sizing: minimum 44x44px for all interactive elements in kiosk
- Orientation handling: lock to landscape on tablet (via CSS `@media (orientation)` + meta tag)
- `apple-mobile-web-app-capable` meta tag for fullscreen kiosk on iPad

**PWA Foundation (Kiosk tablet installability)**
- `@angular/pwa` schematic: manifest.webmanifest, ngsw-config.json, service worker registration
- Icon set generation (72/96/128/144/152/192/384/512px)
- Apple touch icon and splash screen meta tags
- `provideServiceWorker()` in `app.config.ts`
- Service worker caching strategy: app shell cached, API calls network-first, face data NEVER cached
- Install prompt handling for kiosk tablets

**Font Loading Optimization**
- Move Google Fonts `@import` from `styles.scss` to `<link>` tags in `index.html` with `rel="preconnect"` and `font-display: swap`
- Add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
- Consider subsetting fonts or self-hosting for offline kiosk support

**Viewport and iOS Fixes**
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">`
- `<meta name="theme-color" content="#0a0e17">` (matches the dark theme)
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- Fix all `100vh` usages across the app to `100dvh` (login, kiosk, global styles)

### Out of Scope

- **Admin panel responsive redesign** -- Separate SDD change. Admin stays desktop/web only.
- **Admin hamburger menu / mobile navigation** -- Not in this change.
- **Admin table responsive layouts** (employees, attendance, locations) -- Not in this change.
- **Push notifications** -- Future enhancement after Capacitor foundation is stable.
- **Offline attendance recording** -- Future enhancement (requires local queue + sync).
- **App store submission** -- This change prepares the builds; actual submission is a deployment task.
- **Android-specific deep linking or widgets** -- Future enhancement.
- **Biometric auth (FaceID/TouchID) for app login** -- Future enhancement.

## Approach

### Architecture Strategy

Introduce a **platform abstraction layer** that detects whether the app runs inside Capacitor (native) or in a browser, and routes camera/geolocation calls accordingly:

```
┌─────────────────────────────────────────────────┐
│                  Angular App                     │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ CameraService│    │ GeolocationService    │   │
│  │ (unified API)│    │ (unified API)         │   │
│  └──────┬───────┘    └──────────┬────────────┘   │
│         │                       │                 │
│  ┌──────▼───────────────────────▼────────────┐   │
│  │         PlatformService                    │   │
│  │  isNative() / isBrowser() / isTablet()    │   │
│  └──────┬───────────────────────┬────────────┘   │
│         │                       │                 │
│  ┌──────▼───────┐    ┌──────────▼────────────┐   │
│  │  Capacitor    │    │  Browser APIs          │   │
│  │  Camera       │    │  getUserMedia          │   │
│  │  Geolocation  │    │  navigator.geolocation │   │
│  └──────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Phased Delivery Plan (16 days to beta: March 4 - March 20, 2026)

**Phase 1: Foundation (Days 1-4, March 4-7)**
- Initialize Capacitor in the Angular project
- Create `PlatformService` for native/browser detection
- Viewport meta fixes in `index.html` (theme-color, viewport-fit, apple meta tags)
- Font loading optimization (preconnect, move from @import to link tags)
- Fix all `100vh` -> `100dvh` across the codebase
- PWA manifest + icon generation + service worker setup

**Phase 2: Camera & Geo Hardening (Days 5-8, March 8-11)**
- Harden `CameraService`: resolution fallback, max capture size, visibility handler, JPEG quality, Capacitor Camera integration
- Harden `GeolocationService`: permission checking, retry logic, fresh position for kiosk, Capacitor Geolocation integration
- Touch target audit and fixes for kiosk components (min 44px)

**Phase 3: Mobile App Flow (Days 9-12, March 12-15)**
- Mobile attendance navigation flow (dedicated routes or conditional layout for Capacitor)
- Face scan screen optimized for phone (fullscreen camera, overlay instructions)
- GPS verification screen with user feedback (accuracy indicator, retry)
- App lifecycle handling (Capacitor `App` plugin: pause/resume camera on background)
- Splash screen configuration

**Phase 4: Kiosk Tablet Polish + Testing (Days 13-16, March 16-19)**
- Kiosk orientation handling (landscape preference)
- Install prompt for kiosk tablets (PWA)
- End-to-end testing on real devices:
  - iPhone (Safari, Capacitor)
  - Android phone (Chrome, Capacitor)
  - iPad (Safari kiosk mode)
  - Android tablet (Chrome kiosk)
- Bug fixes and polish from device testing
- Beta build generation (Capacitor iOS + Android)

**March 20: Beta delivery**

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/package.json` | Modified | Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/camera`, `@capacitor/geolocation`, `@capacitor/app`, `@capacitor/splash-screen`, `@angular/service-worker` |
| `frontend/capacitor.config.ts` | New | Capacitor project configuration (appId, appName, webDir, plugins) |
| `frontend/ios/` | New | Capacitor iOS project (generated, gitignored selectively) |
| `frontend/android/` | New | Capacitor Android project (generated, gitignored selectively) |
| `frontend/src/index.html` | Modified | Viewport meta, theme-color, apple meta tags, font preconnect links |
| `frontend/src/styles.scss` | Modified | Font loading change (@import -> link tags), `100vh` -> `100dvh` fix in `.admin-page` |
| `frontend/src/app/app.config.ts` | Modified | Add `provideServiceWorker()` registration |
| `frontend/src/app/core/services/platform.service.ts` | New | Platform detection: Capacitor native vs browser vs tablet |
| `frontend/src/app/core/services/camera.service.ts` | Modified | Resolution fallback chain, max capture size, visibility handler, JPEG quality, Capacitor Camera integration, double-tap guard |
| `frontend/src/app/core/services/geolocation.service.ts` | Modified | Permission checking, retry logic, maximumAge tuning, Capacitor Geolocation integration, typed errors |
| `frontend/src/app/features/kiosk/kiosk.component.ts` | Modified | `100vh` -> `100dvh`, touch targets, orientation handling, visibility change integration |
| `frontend/src/app/features/auth/pages/login/login.component.ts` | Modified | `100vh` -> `100dvh` fix |
| `frontend/public/manifest.webmanifest` | New | PWA manifest for kiosk installability |
| `frontend/public/icons/` | New | PWA icon set (multiple sizes) |
| `frontend/ngsw-config.json` | New | Angular service worker caching configuration |
| `frontend/angular.json` | Modified | Add `serviceWorker` option to build configuration |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| iOS Safari camera in standalone PWA mode is unreliable (kiosk tablet) | Medium | High | Test on real iPad hardware early (Phase 2). If broken, kiosk falls back to regular Safari (non-standalone) instead of installed PWA. Capacitor bypasses this entirely for the mobile app. |
| Capacitor build pipeline complexity (Xcode, Android Studio, CocoaPods) | Medium | Medium | Set up CI/CD for Capacitor builds early in Phase 1. Document local dev requirements (Xcode 15+, Android Studio, JDK 17). Team member must have Mac for iOS builds. |
| 16-day timeline is aggressive for Capacitor + PWA + hardening | High | High | Strict phase gates. Phase 1-2 are non-negotiable foundations. Phase 3-4 can be trimmed (e.g., skip splash screen polish, defer landscape lock). Beta can ship with known minor issues documented. |
| Camera resolution fallback may behave differently across devices | Medium | Medium | Test fallback chain on at least 5 device/browser combinations. Log which resolution actually activated for debugging. |
| `@angular/service-worker` + Capacitor interaction | Low | Medium | Service worker is primarily for kiosk PWA. In Capacitor, service worker can be disabled or limited to avoid caching conflicts with native app updates. |
| App store review timeline may exceed beta deadline | High | Medium | Use enterprise distribution (iOS) or internal testing track (Android Play Console) for beta. Formal app store submission is out of scope for this change. |
| Google Fonts dependency breaks offline kiosk | Medium | Low | Service worker caches font files. As a fallback, configure `font-display: swap` so UI renders with system fonts while fonts load. Consider self-hosting fonts if kiosk has unreliable internet. |
| Large base64 payloads on mobile data (attendance scan) | High | High | Cap resolution at 1280px, JPEG quality 0.7. This reduces a 4K frame from ~4MB to ~150-300KB base64. 3 frames = ~500KB-1MB total -- acceptable on 4G/5G. |

## Rollback Plan

This change is **additive** -- it introduces new files and modifies existing services with backward-compatible abstractions. Rollback strategy:

1. **Capacitor layer**: Remove `capacitor.config.ts`, `ios/`, `android/` directories, and Capacitor dependencies from `package.json`. The Angular app continues to work as a regular web app.
2. **Camera/Geo service changes**: The `PlatformService` always returns `isBrowser() === true` when Capacitor is not present. All browser-path code is the original logic with hardening improvements. To fully rollback, revert the service files to their pre-change state via git.
3. **PWA infrastructure**: Remove `manifest.webmanifest`, `ngsw-config.json`, service worker registration, and icons. Revert `angular.json` service worker option. App becomes a regular SPA again.
4. **CSS/viewport fixes** (`100dvh`, meta tags): These are improvements even without mobile. Rolling them back is optional but possible by reverting `index.html` and component styles.
5. **Git strategy**: All work on a feature branch (`feature/mobile-pwa-readiness`). If beta is not viable by March 20, the branch is NOT merged to main. Production continues on the current desktop-only build.

**Partial rollback is viable**: Capacitor can be removed while keeping PWA + service hardening. Or PWA can be removed while keeping viewport fixes. Each layer is independent.

## Dependencies

- **Development machine with Xcode 15+** (required for iOS Capacitor builds -- must be a Mac)
- **Android Studio + JDK 17** (required for Android Capacitor builds)
- **CocoaPods** (required for iOS Capacitor plugin installation)
- **Apple Developer account** (required for iOS enterprise distribution or TestFlight beta)
- **Google Play Console access** (required for Android internal testing track)
- **Real iOS and Android devices for testing** (simulators do not reliably reproduce camera/GPS behavior)
- **`@angular/service-worker` package** (new npm dependency)
- **`@capacitor/core`, `@capacitor/cli`, `@capacitor/camera`, `@capacitor/geolocation`, `@capacitor/app`, `@capacitor/splash-screen`** (new npm dependencies)
- **Backend API must accept smaller image payloads** -- verify that the face recognition pipeline works with 1280px-capped JPEG at 0.7 quality (should be fine, but must verify `face_recognition` lib tolerance)

## Success Criteria

- [ ] Capacitor project initialized, `npx cap sync` runs without errors for both iOS and Android
- [ ] Mobile app (Capacitor) can open camera via native plugin and capture a face scan on iPhone and Android phone
- [ ] Mobile app verifies GPS location against registered office location and confirms attendance
- [ ] Camera stream pauses when app is backgrounded and resumes when foregrounded (both Capacitor and browser)
- [ ] Camera capture frames are <= 300KB each (base64 JPEG at 1280px, quality 0.7)
- [ ] Kiosk on iPad Safari renders correctly without address bar overlap (100dvh fix verified)
- [ ] Kiosk touch targets are all >= 44x44px (verified via DevTools audit)
- [ ] PWA manifest is valid (`lighthouse --only-categories=pwa` passes installability)
- [ ] Service worker caches app shell but NOT face/attendance API data
- [ ] Font loading uses preconnect + link tags (no render-blocking @import)
- [ ] All existing desktop functionality remains unchanged (regression check)
- [ ] Beta build (Capacitor iOS + Android) delivered by March 20, 2026
