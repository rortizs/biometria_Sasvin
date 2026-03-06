## Exploration: Mobile PWA Readiness

### Current State

The application is an Angular 20 standalone biometric attendance system with two main UX surfaces:

1. **Kiosk mode** (public, `/kiosk`) -- face recognition check-in/out with camera + geolocation
2. **Admin panel** (authenticated, `/admin/**`) -- employees, attendance, locations (Leaflet maps), schedules, departments, settings, dashboard

**Architecture strengths already in place:**
- Standalone components with lazy loading via `loadComponent` on every route (good for code-splitting on mobile)
- Signals-based state management (no heavy store library)
- CSS custom properties design system with dedicated kiosk theme (`--k-*` variables)
- Kiosk component already uses `clamp()` and fluid typography for some responsive behavior
- Camera service is a clean injectable with start/stop/captureFrame lifecycle
- Geolocation service wraps the browser API with Observable pattern

**Architecture gaps for mobile:**
- NO PWA infrastructure whatsoever (no manifest.json, no service worker, no `@angular/pwa` or ngsw-config)
- NO `<meta name="theme-color">`, NO `<meta name="apple-mobile-web-app-capable">`, NO apple touch icons
- Viewport meta is minimal: `width=device-width, initial-scale=1` (missing `viewport-fit=cover` for iOS notch, missing `maximum-scale=1` to prevent zoom on input focus)
- The `public/` folder contains only `favicon.ico` -- no PWA icon set
- `angular.json` has no `serviceWorker` configuration
- `app.config.ts` has no `provideServiceWorker()` call
- No `@angular/service-worker` in `package.json` dependencies

### Affected Areas

**PWA Infrastructure (new files needed):**
- `frontend/src/index.html` -- viewport meta, theme-color, apple meta tags, splash screen links
- `frontend/public/manifest.webmanifest` -- PWA manifest (new file)
- `frontend/public/icons/` -- icon set at 72/96/128/144/152/192/384/512px (new directory)
- `frontend/ngsw-config.json` -- Angular service worker config (new file)
- `frontend/angular.json` -- `serviceWorker` option in build config
- `frontend/src/app/app.config.ts` -- `provideServiceWorker()` registration
- `frontend/package.json` -- add `@angular/service-worker` dependency

**Camera Service Hardening:**
- `frontend/src/app/core/services/camera.service.ts` -- Multiple issues:
  - No resolution fallback chain (640x480 hard-ideal fails on some mobile browsers)
  - No `playsinline` enforcement at the service level (relies on template attribute)
  - No stream cleanup on `document.visibilitychange` (iOS kills streams when app is backgrounded)
  - `captureFrame()` uses full `videoWidth`/`videoHeight` with no max size -- on a 4K mobile sensor this creates massive base64 strings (>2MB per frame, 3 frames = 6MB+ payload)
  - No JPEG quality adjustment for mobile networks
  - `captureFrames()` has no debounce/guard against double-tap

**Geolocation Service Hardening:**
- `frontend/src/app/core/services/geolocation.service.ts` -- Issues:
  - `maximumAge: 60000` (1 minute cache) is too aggressive for kiosk where employee walks up
  - `timeout: 10000` may not be enough for cold GPS fix on mobile
  - No permission state checking (`navigator.permissions.query({name: 'geolocation'})`)
  - Silent failure pattern (`catchError` returns `null`) with no user feedback mechanism
  - No retry logic for denied -> prompt flow

**Kiosk Component:**
- `frontend/src/app/features/kiosk/kiosk.component.ts` -- Issues:
  - `:host { height: 100vh }` -- the classic iOS Safari 100vh bug where address bar overlaps content
  - `.kiosk { height: 100vh }` -- same issue, doubled
  - Camera starts with no config override (defaults to 640x480, no mobile-specific constraints)
  - `backdrop-filter: blur(8px)` on `.kiosk-bar` -- performance issue on older Android devices
  - Geo request fires once in `ngOnInit` with no retry if user denies then changes mind
  - No handling of `visibilitychange` for camera stream pause/resume

**Admin Dashboard:**
- `frontend/src/app/features/admin/pages/dashboard/dashboard.component.ts` -- Issues:
  - `.topbar-nav { display: none }` at 900px -- nav disappears completely, no hamburger menu replacement
  - `.content-grid { grid-template-columns: 1fr 320px }` -- sidebar fixed at 320px, no responsive collapse
  - At 900px breakpoint the nav vanishes but there is NO way to navigate to any admin page except through quick action cards (which don't cover all routes like schedules, settings)

**Attendance Page:**
- `frontend/src/app/features/admin/pages/attendance/attendance.component.ts` -- Issues:
  - `.filters-grid { grid-template-columns: repeat(6, 1fr) }` -- 6 columns on mobile is unusable
  - Table with 8 columns has `overflow-x: auto` but no visual hint to scroll
  - Has some responsive breakpoints (768px, 480px, 1200px) but filter grid only collapses to 1fr at 768px

**Employees Page:**
- `frontend/src/app/features/admin/pages/employees/employees.component.ts` -- Issues:
  - Data table with 7 columns, no responsive stacking or horizontal scroll indicator
  - Face registration modal uses `max-width: 560px; max-height: 95vh` -- should be fullscreen on mobile
  - Face camera in modal uses `navigator.mediaDevices.getUserMedia` directly (not through CameraService) with hardcoded 640x480
  - `.face-captured-grid { grid-template-columns: repeat(5, 1fr) }` -- 5 tiny thumbnails on a phone screen

**Locations Page:**
- `frontend/src/app/features/admin/pages/locations/locations.component.ts` -- Issues:
  - `.content { grid-template-columns: 350px 1fr }` -- no responsive breakpoint at all
  - Map + sidebar layout completely breaks on phones
  - Leaflet icons loaded from unpkg.com CDN -- no offline support
  - Modal with map picker inside -- touch interaction may conflict with scroll

**Login Page:**
- `frontend/src/app/features/auth/pages/login/login.component.ts` -- Issues:
  - `.brand-panel { display: none }` at 768px -- already handled (good)
  - Input focus on iOS may trigger zoom (no `font-size >= 16px` enforcement on inputs)
  - Form panel uses `min-height: 100vh` -- iOS Safari address bar issue again

**Global Styles:**
- `frontend/src/styles.scss` -- Issues:
  - `.admin-page { min-height: 100vh }` -- iOS Safari address bar
  - `.modal-overlay { position: fixed; inset: 0 }` with `backdrop-filter: blur(6px)` -- iOS perf concern
  - `.form-row { grid-template-columns: repeat(2, 1fr) }` -- no single-column collapse on small screens
  - Custom scrollbar styles (`::-webkit-scrollbar`) -- fine, but need to ensure native scrollbar on touch devices

### Approaches

1. **Angular PWA + Responsive Hardening (Recommended)** -- Use `@angular/pwa` schematic for service worker + manifest, then fix all mobile issues systematically

   - Pros: Native Angular tooling, well-documented, `ngsw` handles caching strategies, app shell, and updates. Addresses the 80% use case (installable web app on Android/iOS with offline shell)
   - Cons: iOS PWA support is limited (no push notifications, 50MB storage limit, some API restrictions in standalone mode). Service worker does NOT solve camera/geo API restrictions
   - Effort: Medium (2-3 weeks for a thorough implementation)

2. **Capacitor Wrapper on top of PWA** -- First build PWA (approach 1), then add Capacitor for native bridge access

   - Pros: Full native camera/geo permissions, push notifications, background location, app store distribution. Capacitor plugins handle iOS quirks transparently
   - Cons: Adds build complexity (Xcode/Android Studio needed), app store review process, separate update pipeline for native shell vs web content
   - Effort: High (PWA first + 1-2 additional weeks for Capacitor layer)

3. **Responsive-Only (No PWA)** -- Fix all mobile layout/UX issues but skip installability and offline

   - Pros: Fastest, no new dependencies, no service worker complexity
   - Cons: No install prompt, no home screen icon, no offline shell, doesn't address the core "deploy on mobile devices" requirement
   - Effort: Low-Medium (1-2 weeks for responsive fixes)

### Recommendation

**Approach 1: Angular PWA + Responsive Hardening** -- Do this in two phases:

**Phase 1 - PWA Foundation + Critical Mobile Fixes:**
- Add `@angular/pwa` schematic (manifest, ngsw-config, icons)
- Fix viewport meta (add `viewport-fit=cover`, `apple-mobile-web-app-capable`)
- Fix all `100vh` usages to `100dvh` (dynamic viewport height, supported in all modern browsers since 2023)
- Harden CameraService (resolution fallback chain, max capture size 1280px, visibility change handling, JPEG quality 0.7 for mobile)
- Harden GeolocationService (permission state check, retry flow, lower maximumAge for kiosk)

**Phase 2 - Admin Responsive + Polish:**
- Dashboard: hamburger menu or slide-out drawer for mobile nav
- Employees: responsive table (card layout on mobile), fullscreen face modal on small screens
- Locations: stacked layout on mobile (list above map)
- Attendance: collapsible filters, responsive table
- Touch targets: ensure all buttons/links are minimum 44x44px (Apple HIG)

**Phase 3 (Future, if needed):**
- Capacitor wrapper for app store distribution
- Native camera plugin for better iOS standalone mode camera access
- Push notifications via native bridge

### Risks

- **iOS Safari standalone mode camera access**: As of iOS 17.4+, camera access in standalone PWAs works but historically has been buggy. Testing on real iOS devices is MANDATORY -- simulators do not reliably reproduce camera permission behavior in standalone mode.
- **Large base64 payloads on mobile networks**: Current implementation captures 3 frames at full resolution as base64 JPEG strings. On a modern phone with 12MP camera, each frame could be 2-4MB base64. This means a single attendance scan could send 6-12MB to the backend over potentially slow mobile data. MUST add resolution capping and quality reduction.
- **Geolocation accuracy indoors**: GPS accuracy drops significantly inside buildings. The current 50m default radius for locations may not be enough. Need to document this limitation and possibly allow larger radii for indoor locations.
- **Leaflet map on mobile**: Touch zoom conflicts with page scroll, pinch-to-zoom behavior needs careful handling. Leaflet icons loaded from CDN will break offline.
- **`backdrop-filter` performance**: Used extensively in kiosk mode (`blur(8px)`, `blur(6px)`, `blur(4px)`, `blur(3px)`). Older Android WebView and low-end devices will struggle. Need progressive enhancement or fallback to solid backgrounds.
- **Service worker update strategy**: Angular's ngsw uses a "check on navigation" strategy by default. For a kiosk that runs 24/7, need to configure periodic update checks and handle the "new version available" prompt gracefully (auto-reload during idle periods).
- **iOS 50MB storage limit for PWAs**: If many employees register faces with large images, the cache could fill up. Need to ensure only the app shell is cached, not face data.

### Ready for Proposal

Yes. The exploration is comprehensive. The orchestrator should present the two-phase approach to the user and ask:
1. Confirm Phase 1 (PWA + camera/geo hardening) as the first deliverable
2. Whether to include admin responsive fixes in the same change or split into a separate SDD change
3. Whether Capacitor is on the roadmap (affects some architectural decisions in Phase 1)
