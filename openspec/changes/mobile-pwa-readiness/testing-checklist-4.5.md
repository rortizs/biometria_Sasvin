# E2E Device Testing Checklist (Task 4.5)

**Change**: mobile-pwa-readiness  
**Task**: 4.5 - End-to-end device testing and bug fix pass  
**Date**: 2026-03-06  
**Status**: 🚧 READY FOR MANUAL TESTING  
**Beta Deadline**: March 20, 2026 (13 days remaining)  
**Created by**: Agent F (Phase 4 Implementation)

---

## Executive Summary

This document provides a **comprehensive manual testing plan** for the mobile-pwa-readiness change. Since automated E2E testing on real devices is not feasible in CI/CD, this checklist serves as the **final quality gate** before beta release.

**CRITICAL**: This task is the **#1 blocker** for beta launch. All 9 test scenarios MUST pass on at least 2 devices (1 iOS, 1 Android) before promoting to production.

---

## Testing Matrix

### Required Devices (Minimum)

| Device Type | OS | Browser/Runtime | Purpose |
|-------------|-----|-----------------|---------|
| **iPhone** | iOS 15+ | Safari (standalone) + Capacitor app | Mobile attendance flow (native) |
| **Android Phone** | Android 10+ | Chrome + Capacitor app | Mobile attendance flow (native) |
| **iPad** | iOS 15+ | Safari (PWA installed) | Kiosk mode (employee registration) |
| **Android Tablet** | Android 10+ | Chrome (PWA installed) | Kiosk mode (employee registration) |

### Recommended Additional Devices (Optional)

| Device Type | OS | Browser/Runtime | Purpose |
|-------------|-----|-----------------|---------|
| iPhone (older) | iOS 13-14 | Safari | Backward compatibility check |
| Android Phone | Android 8-9 | Chrome | Legacy device check |
| iPad Pro | iPadOS 16+ | Safari | Large screen kiosk validation |
| Budget Android Tablet | Android 11+ | Chrome | Low-end hardware validation |

---

## Test Scenarios (9 per device = 36 total tests)

### Scenario 1: Kiosk Face Registration Flow

**Path**: Open kiosk → scan face → verify attendance recorded

**Steps**:
1. Open app at `/kiosk` route
2. Camera feed appears automatically
3. Position face in overlay guides (oval/circle)
4. Face is detected (overlay turns green or similar indicator)
5. Capture succeeds (3 frames captured within 2 seconds)
6. Attendance record is created in backend
7. Success feedback appears
8. Camera feed stops cleanly

**Pass Criteria**:
- ✅ Camera feed starts within 2 seconds
- ✅ Face detection overlay is visible and responsive
- ✅ Capture completes successfully
- ✅ Backend attendance record created (verify in admin panel or DB)
- ✅ No camera permission errors
- ✅ No console errors

**Data to Collect**:
| Field | Value |
|-------|-------|
| Device | |
| Browser/Runtime | |
| Camera resolution | (check video.videoWidth x video.videoHeight) |
| Frame size (KB) | (check Network tab, base64 payload size) |
| Time to camera start (s) | |
| Time to capture (s) | |
| Pass/Fail | |
| Notes | |

**Bug Report Template** (if fails):
```markdown
## Bug: Kiosk Face Registration Failure

**Device**: [iPhone 13 Pro / Pixel 6 / etc.]
**OS**: [iOS 16.4 / Android 12 / etc.]
**Browser**: [Safari / Chrome / Capacitor]
**Route**: /kiosk

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected**: [What should happen]
**Actual**: [What happened instead]

**Screenshots**: [Attach if possible]
**Console Errors**: [Copy from DevTools]
**Network Errors**: [Check Network tab for failed requests]

**Severity**: Critical / High / Medium / Low
**Blocker for Beta**: YES / NO
```

---

### Scenario 2: Mobile Attendance Flow

**Path**: Open mobile attendance → scan face → verify GPS → confirm result

**Steps**:
1. Open Capacitor app or browser at `/attendance` route
2. Login (if authentication is implemented)
3. Navigate to attendance screen
4. Camera feed appears
5. Position face in overlay guides
6. Face is detected and captured
7. GPS permission requested (if first time)
8. GPS location captured (verify accuracy feedback shown)
9. Attendance check-in request sent to backend
10. Success/failure feedback shown

**Pass Criteria**:
- ✅ Camera feed starts successfully
- ✅ Face capture works (3 frames captured)
- ✅ GPS permission dialog appears (native on Capacitor, browser on web)
- ✅ GPS location is accurate (lat/lon shown in UI or logged)
- ✅ Attendance record created with GPS coordinates
- ✅ UI feedback is clear (success/error state)
- ✅ Frame size <= 300KB each (verify in Network tab)

**Data to Collect**:
| Field | Value |
|-------|-------|
| Device | |
| Runtime (Capacitor/Browser) | |
| Camera resolution | |
| Frame size (KB) | |
| GPS accuracy (meters) | |
| GPS permission flow | (native dialog / browser prompt / manual) |
| Time to GPS fix (s) | |
| Pass/Fail | |
| Notes | |

**Bug Report Template**: See Scenario 1, adapt for `/attendance` route

---

### Scenario 3: Background App Recovery

**Path**: Background app → return → camera resumes

**Steps**:
1. Open kiosk or attendance screen
2. Camera feed is active
3. Switch to another app (home screen, browser tab, etc.)
4. Wait 10 seconds
5. Return to the app (switch back to tab or foreground app)
6. Verify camera feed resumes automatically

**Pass Criteria**:
- ✅ Camera feed resumes within 2 seconds of returning
- ✅ No manual "Restart Camera" button required
- ✅ No permission re-request (camera was already granted)
- ✅ No "Camera in use by another app" error
- ✅ Video stream quality is same as before backgrounding

**Known Issues**:
- iOS Safari: `getUserMedia` may be suspended in background. CameraService should detect `visibilitychange` and restart stream on foreground.
- Android Chrome: Video may pause but stream stays alive. May need to call `video.play()` on resume.

**Data to Collect**:
| Field | Value |
|-------|-------|
| Device | |
| Runtime | |
| Background duration (s) | |
| Camera resume time (s) | |
| Required manual interaction | (YES/NO) |
| Pass/Fail | |
| Notes | |

**Bug Report Template**: See Scenario 1, add "Background behavior" section

---

### Scenario 4: Camera Permission Denial

**Path**: Deny camera permission → verify error message and settings redirect hint

**Steps**:
1. Reset camera permission for the app/site (iOS: Settings > Safari > Camera; Android: Site settings)
2. Open kiosk or attendance screen
3. Camera permission dialog appears
4. Deny permission
5. Verify error message appears in UI
6. Verify settings redirect hint is shown (iOS: "Go to Settings > Safari > Camera"; Android: "Allow camera in site settings")

**Pass Criteria**:
- ✅ Permission dialog appears on first access
- ✅ Error message is clear and non-technical (e.g., "Camera access is required to scan faces")
- ✅ Settings redirect instructions are platform-specific (different for iOS/Android/Browser)
- ✅ No console errors or infinite loops
- ✅ UI shows a clear "Retry" or "Open Settings" button
- ✅ After granting permission in settings and returning, camera works

**Data to Collect**:
| Field | Value |
|-------|-------|
| Device | |
| Runtime | |
| Error message text | |
| Settings hint shown | (YES/NO) |
| Retry flow works | (YES/NO) |
| Pass/Fail | |
| Notes | |

**Bug Report Template**: See Scenario 1, focus on error message clarity

---

### Scenario 5: Location Permission Denial

**Path**: Deny location permission → verify warning and scan still works

**Steps**:
1. Open mobile attendance screen (`/attendance`)
2. Scan face successfully
3. GPS permission dialog appears
4. Deny location permission
5. Verify warning message appears (e.g., "Location is required to verify attendance location")
6. Verify face scan still completes (attendance record created)
7. Backend attendance record should have `null` or `(0, 0)` GPS coordinates

**Pass Criteria**:
- ✅ GPS denial does NOT block face scan
- ✅ Warning message is clear
- ✅ Attendance record is created even without GPS
- ✅ UI shows "Location unavailable" or similar feedback
- ✅ No console errors

**Data to Collect**:
| Field | Value |
|-------|-------|
| Device | |
| Runtime | |
| Warning message text | |
| Attendance created | (YES/NO) |
| GPS coordinates in DB | |
| Pass/Fail | |
| Notes | |

**Bug Report Template**: See Scenario 1, focus on GPS fallback behavior

---

### Scenario 6: Double-Tap Guard

**Path**: Double-tap scan button → verify only one scan is processed

**Steps**:
1. Open kiosk or attendance screen
2. Camera feed is active
3. Position face in overlay
4. Double-tap "Scan" or "Capture" button rapidly (< 300ms between taps)
5. Verify only ONE network request is sent (check Network tab)
6. Verify only ONE attendance record is created

**Pass Criteria**:
- ✅ Only 1 attendance record created
- ✅ Only 1 POST request to `/attendance/check-in` or `/attendance/check-out`
- ✅ Button is disabled during capture (visual feedback)
- ✅ No console errors
- ✅ UI shows clear loading state (spinner, disabled button, etc.)

**Implementation Note**:
The double-tap guard should be implemented in the component using:
- `disabled` binding on button while `capturing()` signal is true
- `captureInProgress` flag in CameraService
- 300ms debounce on capture function (optional)

**Data to Collect**:
| Field | Value |
|-------|-------|
| Device | |
| Runtime | |
| Network requests sent | |
| Attendance records created | |
| Button disabled during capture | (YES/NO) |
| Pass/Fail | |
| Notes | |

**Bug Report Template**: See Scenario 1, focus on race condition

---

### Scenario 7: Touch Target Verification

**Path**: Verify touch targets are >= 44px (kiosk) / 48px (mobile)

**Steps**:
1. Open kiosk screen (`/kiosk`) on tablet
2. Inspect all interactive elements (buttons, links, controls)
3. Verify touch targets are **>= 44px** (WCAG minimum for tablet)
4. Open mobile attendance screen (`/attendance`) on phone
5. Verify touch targets are **>= 48px** (Material Design minimum for mobile)

**Elements to Check**:
- "Scan Face" / "Capture" button
- "Check In" / "Check Out" toggle (if applicable)
- Navigation links
- Settings icon
- Retry button
- Any overlay controls

**Pass Criteria**:
- ✅ All buttons >= 44px on tablet
- ✅ All buttons >= 48px on phone
- ✅ Touch targets have adequate spacing (8px minimum between targets)
- ✅ No accidental taps on adjacent elements

**How to Measure**:
- Use browser DevTools (Inspect Element, check computed width/height)
- Use ruler tool in iOS Simulator / Android Emulator
- Physical measurement: 44px ≈ 9mm, 48px ≈ 10mm

**Data to Collect**:
| Element | Device | Width (px) | Height (px) | Pass/Fail |
|---------|--------|-----------|------------|-----------|
| Scan button (kiosk) | iPad | | | |
| Scan button (mobile) | iPhone | | | |
| Check In toggle | iPhone | | | |
| Retry button | Android | | | |
| ... | | | | |

**Bug Report Template**:
```markdown
## Bug: Touch Target Too Small

**Element**: [Button name]
**Screen**: [/kiosk / /attendance]
**Device**: [Device name]
**Current Size**: [Width x Height px]
**Required Size**: [44px / 48px]
**Screenshot**: [Attach with measurement overlay]

**Suggested Fix**:
- Increase button padding
- Increase font size
- Add min-width/min-height CSS
```

---

### Scenario 8: Viewport Handling (100dvh)

**Path**: Verify 100dvh — no address bar overlap on iOS Safari

**Steps**:
1. Open kiosk or attendance screen on iOS Safari (not Capacitor)
2. Scroll down to hide address bar
3. Scroll up to show address bar
4. Verify UI layout adapts correctly (no content hidden behind address bar)
5. Check that camera feed resizes smoothly
6. Verify overlay guides stay aligned with video feed

**Pass Criteria**:
- ✅ Camera feed uses `100dvh` (dynamic viewport height)
- ✅ Address bar appearance/disappearance does NOT crop content
- ✅ No white space at bottom when address bar is hidden
- ✅ Overlay guides remain aligned with video feed during resize
- ✅ No layout shift causing buttons to disappear

**Implementation Note**:
CSS should use:
```css
.camera-container {
  height: 100dvh; /* NOT 100vh */
  height: 100svh; /* Fallback for older browsers */
}
```

**Data to Collect**:
| Device | Browser | 100dvh used | Address bar behavior | Pass/Fail |
|--------|---------|------------|---------------------|-----------|
| iPhone 12 | Safari 15 | | | |
| iPhone 13 | Safari 16 | | | |
| iPad | Safari 15 | | | |

**Bug Report Template**: See Scenario 1, focus on viewport CSS

---

### Scenario 9: PWA Installability

**Path**: Verify PWA installability on kiosk tablet

**Steps**:
1. Open kiosk screen (`/kiosk`) on iPad Safari or Android Chrome
2. Wait for install prompt to appear (or trigger manually via browser menu)
3. Install PWA to home screen
4. Close browser and open app from home screen
5. Verify app opens in standalone mode (no browser UI)
6. Verify camera works in standalone mode
7. Verify service worker is active (check DevTools > Application > Service Workers)

**Pass Criteria**:
- ✅ Install prompt appears (automatic or manual)
- ✅ PWA can be installed to home screen
- ✅ Standalone mode works (no address bar or tabs)
- ✅ Camera permission persists across app launches
- ✅ Service worker caches assets (offline app shell)
- ✅ App icon and splash screen are correct

**Manifest Checklist**:
```json
{
  "name": "Biometria Kiosk",
  "short_name": "Kiosk",
  "start_url": "/kiosk",
  "display": "standalone",
  "icons": [ /* 192x192, 512x512 */ ],
  "theme_color": "#...",
  "background_color": "#..."
}
```

**Data to Collect**:
| Device | Browser | Installable | Standalone mode | Camera works | Pass/Fail |
|--------|---------|------------|----------------|--------------|-----------|
| iPad | Safari | | | | |
| Android tablet | Chrome | | | | |

**Bug Report Template**: See Scenario 1, focus on manifest.json and service worker

---

## Task 2.8 Manual Validation: Face Recognition Tolerance

**CRITICAL**: Task 2.8 provided theoretical verification (87% safety margin below 0.6 threshold), but **manual device testing is REQUIRED** before production.

### Test Procedure

**Prerequisites**:
- At least **5 employees** with registered faces in the system
- Access to devices with different cameras (iPhone, Android phone, tablet)
- Backend logging enabled for face recognition distances

**Steps**:

1. **For each test employee (5 total)**:

   a. **Capture reference image** (full resolution):
   - Open kiosk on desktop browser (3840x2160 camera resolution)
   - Scan employee face
   - Extract base64 image from network request
   - Save as `employee_{N}_fullres.jpg`

   b. **Capture mobile app image** (1280px capped):
   - Open mobile attendance on phone (`/attendance`)
   - Scan same employee face
   - Extract base64 image from network request
   - Save as `employee_{N}_mobile.jpg`

   c. **Calculate embedding distance**:
   ```python
   from app.services.face_recognition import FaceRecognitionService
   import numpy as np
   import base64

   service = FaceRecognitionService()

   # Load images
   with open(f"employee_{N}_fullres.jpg", "rb") as f:
       fullres_b64 = base64.b64encode(f.read()).decode()
   
   with open(f"employee_{N}_mobile.jpg", "rb") as f:
       mobile_b64 = base64.b64encode(f.read()).decode()

   # Extract embeddings
   emb_fullres = service.get_face_embedding(fullres_b64)
   emb_mobile = service.get_face_embedding(mobile_b64)

   # Calculate distance
   distance = np.linalg.norm(emb_fullres - emb_mobile)

   print(f"Employee {N} - Distance: {distance:.4f}")
   print(f"Match: {'YES' if distance < 0.6 else 'NO'}")
   ```

2. **Record results**:

| Employee | Device | Full Res (KB) | Mobile (KB) | Distance | Match | Notes |
|----------|--------|--------------|------------|----------|-------|-------|
| 1 | iPhone 13 | | | | | |
| 2 | Pixel 6 | | | | | |
| 3 | iPad | | | | | |
| 4 | Galaxy Tab | | | | | |
| 5 | iPhone 12 | | | | | |

### Success Criteria

- ✅ **All 5 employees** produce successful matches (distance < 0.6)
- ✅ **Average distance** is < 0.5 (preferred safety margin)
- ✅ **No false rejections** (known face rejected)
- ✅ **Frame sizes** are <= 300KB each

### Fallback Plan (if tests fail)

If any employee produces distance >= 0.6 or average > 0.5:

**Option 1: Increase JPEG quality**
```typescript
// frontend/src/app/core/services/platform.service.ts
jpegQuality(): number {
  return this.isNative() || this.isTablet() ? 0.75 : 0.8;  // 0.7 → 0.75
}
```
- Impact: Frame size 30-50KB → 50-80KB (still acceptable)

**Option 2: Increase maxCaptureWidth**
```typescript
// frontend/src/app/core/services/camera.service.ts
const DEFAULT_CONFIG: CameraConfig = {
  maxCaptureWidth: 1600,  // 1280 → 1600
  // ...
};
```
- Impact: Frame size 30-50KB → 60-100KB (still acceptable)

**Option 3: Adjust face_recognition threshold**
```python
# backend/app/services/face_recognition.py
FACE_MATCH_THRESHOLD = 0.65  # 0.6 → 0.65 (more permissive)
```
- Impact: Slightly higher false positive rate (acceptable for beta)

---

## Performance Benchmarks

### Camera Frame Size Target

| Resolution | JPEG Quality | Expected Size | Max Acceptable |
|-----------|-------------|--------------|----------------|
| 1280x720 | 0.7 | 30-50 KB | 300 KB |
| 1280x960 | 0.7 | 50-100 KB | 300 KB |
| 1920x1080 | 0.7 | 100-150 KB | 300 KB |
| 1280x720 | 0.8 | 50-80 KB | 300 KB |

**How to verify**:
1. Open Network tab in DevTools
2. Filter by `/attendance/check-in` or `/attendance/check-out`
3. Check request payload size
4. Decode base64 to get actual image size

**Pass/Fail**:
- ✅ **PASS**: Frame size <= 300 KB
- ⚠️ **WARNING**: 300 KB < size <= 500 KB (acceptable for beta, optimize later)
- ❌ **FAIL**: Frame size > 500 KB (MUST fix before beta)

### GPS Accuracy Target

| Environment | Expected Accuracy | Acceptable Range |
|------------|------------------|------------------|
| Outdoor (clear sky) | 5-10 meters | <= 20 meters |
| Indoor (near window) | 20-50 meters | <= 100 meters |
| Indoor (deep building) | 50-200 meters | <= 500 meters |
| Urban (buildings) | 10-30 meters | <= 50 meters |

**How to verify**:
1. Check backend logs for GPS coordinates
2. Compare with known employee location (Google Maps)
3. Calculate distance error

**Pass/Fail**:
- ✅ **PASS**: Accuracy within expected range
- ⚠️ **WARNING**: Accuracy worse than expected but within acceptable range
- ❌ **FAIL**: GPS unavailable or accuracy > 500 meters

---

## Bug Severity Classification

| Severity | Definition | Examples | Beta Blocker? |
|----------|-----------|----------|--------------|
| **Critical** | App crash, data loss, security issue | Camera never starts, attendance not recorded, permission bypass | **YES** |
| **High** | Feature broken, major UX issue | GPS always fails, double-tap creates 2 records, frame size > 1MB | **YES** |
| **Medium** | Feature degraded, minor UX issue | GPS slow (>10s), frame size 300-500KB, touch target 40px | **NO** (fix post-beta) |
| **Low** | Cosmetic, rare edge case | Alignment issue on 1 device, minor layout shift | **NO** (backlog) |

---

## Test Execution Workflow

### Pre-Testing Setup

1. **Backend preparation**:
   - [ ] Deploy latest `feature/mobile-pwa-readiness` branch to staging
   - [ ] Verify backend accepts `images: list[str]` in AttendanceCheckInRequest
   - [ ] Enable face recognition distance logging
   - [ ] Seed test employees (at least 5) with registered faces

2. **Frontend preparation**:
   - [ ] Build Capacitor apps (iOS + Android)
   - [ ] Install Capacitor apps on test devices
   - [ ] Build PWA (production mode, service worker enabled)
   - [ ] Deploy PWA to staging server (HTTPS required)

3. **Device preparation**:
   - [ ] Reset camera/location permissions on all devices
   - [ ] Clear browser cache and storage
   - [ ] Verify devices are on same network as staging server (or use public staging URL)

### Testing Execution

**Recommended order**:

1. **Day 1** (4 hours):
   - Scenario 1 (Kiosk face registration) on all 4 devices
   - Scenario 2 (Mobile attendance flow) on iPhone + Android phone
   - Scenario 6 (Double-tap guard) on all 4 devices

2. **Day 2** (4 hours):
   - Scenario 3 (Background recovery) on all 4 devices
   - Scenario 4 (Camera denial) on all 4 devices
   - Scenario 5 (Location denial) on iPhone + Android phone

3. **Day 3** (3 hours):
   - Scenario 7 (Touch targets) on all 4 devices
   - Scenario 8 (100dvh) on iPad + iPhone
   - Scenario 9 (PWA installability) on iPad + Android tablet

4. **Day 4** (2 hours):
   - Task 2.8 manual validation (face recognition tolerance)
   - Bug fixes for any critical/high issues found
   - Re-test failed scenarios

**Total estimated time**: **13 hours** (across 4 days, with 2 testers in parallel = ~7 hours each)

### Bug Triage Process

After each scenario:

1. **Document bugs** using bug report templates
2. **Classify severity** (Critical / High / Medium / Low)
3. **Determine if beta blocker** (YES / NO)
4. **Create issue files** in `openspec/changes/mobile-pwa-readiness/issues/` (if blockers)
5. **Fix critical/high bugs immediately** (same day)
6. **Re-test** fixed scenarios

---

## Issue File Template

If blockers are found, create issue files:

**File**: `openspec/changes/mobile-pwa-readiness/issues/issue-001-camera-fails-ios.md`

```markdown
# Issue #001: Camera Fails to Start on iOS Safari

**Severity**: Critical  
**Beta Blocker**: YES  
**Discovered**: 2026-03-07  
**Scenario**: Scenario 1 (Kiosk face registration)  
**Device**: iPhone 13 Pro, iOS 16.4, Safari 16.4  

## Description

Camera feed never starts on iOS Safari when opening `/kiosk` route. Permission dialog appears, user grants camera access, but video element remains black.

## Steps to Reproduce

1. Open https://staging.biometria.com/kiosk on iPhone 13 Pro (Safari)
2. Grant camera permission when prompted
3. Wait 10 seconds
4. Observe: video element is black, no camera feed

## Expected

Camera feed should start within 2 seconds after permission granted.

## Actual

Video element remains black. No error message shown.

## Console Errors

```
NotAllowedError: The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.
```

## Root Cause (Hypothesis)

iOS Safari requires HTTPS for getUserMedia. Staging server may be using HTTP.

## Suggested Fix

1. Verify staging server uses HTTPS
2. If HTTP, configure SSL certificate
3. If HTTPS already enabled, check for mixed content warnings

## Workaround

None (CRITICAL blocker)

## Status

- [ ] Root cause confirmed
- [ ] Fix implemented
- [ ] Re-tested on device
- [ ] Verified on other iOS devices
```

---

## Sign-Off Checklist

Before marking Task 4.5 as complete (✅), ALL of the following must be true:

### Minimum Device Coverage (REQUIRED)

- [ ] Tested on **iPhone** (iOS 15+, Safari standalone + Capacitor app)
- [ ] Tested on **Android phone** (Android 10+, Chrome + Capacitor app)
- [ ] Tested on **iPad** (iOS 15+, Safari PWA installed)
- [ ] Tested on **Android tablet** (Android 10+, Chrome PWA installed)

### Scenario Coverage (REQUIRED)

- [ ] Scenario 1 passes on **at least 2 devices** (1 iOS, 1 Android)
- [ ] Scenario 2 passes on **iPhone + Android phone**
- [ ] Scenario 3 passes on **all 4 devices**
- [ ] Scenario 4 passes on **all 4 devices**
- [ ] Scenario 5 passes on **iPhone + Android phone**
- [ ] Scenario 6 passes on **all 4 devices**
- [ ] Scenario 7 passes on **all 4 devices**
- [ ] Scenario 8 passes on **iPad + iPhone**
- [ ] Scenario 9 passes on **iPad + Android tablet**

### Performance Benchmarks (REQUIRED)

- [ ] Camera frame size <= 300KB on **all devices**
- [ ] GPS accuracy <= 100 meters (indoor) on **all phones**
- [ ] Camera start time <= 3 seconds on **all devices**

### Face Recognition Validation (CRITICAL)

- [ ] Task 2.8 manual validation completed (**5 employees tested**)
- [ ] All employees produce matches (distance < 0.6)
- [ ] Average distance < 0.5
- [ ] Frame sizes acceptable (< 300KB)

### Bug Resolution (REQUIRED)

- [ ] **Zero critical bugs** unresolved
- [ ] **Zero high bugs** unresolved
- [ ] All medium/low bugs documented (deferred to post-beta)

### Deliverables (REQUIRED)

- [ ] All test data collected (spreadsheets, screenshots, logs)
- [ ] Bug reports created for all issues found
- [ ] Issue files created for beta blockers (if any)
- [ ] Test summary report written (see below)

---

## Test Summary Report Template

**File**: `openspec/changes/mobile-pwa-readiness/test-summary-4.5.md`

```markdown
# E2E Device Testing Summary (Task 4.5)

**Date**: [YYYY-MM-DD]  
**Testers**: [Names]  
**Duration**: [X hours]  
**Devices Tested**: [Count]  
**Scenarios Executed**: [Count]  
**Pass Rate**: [X%]  

## Test Results

| Scenario | iPhone | Android Phone | iPad | Android Tablet | Overall |
|----------|--------|--------------|------|----------------|---------|
| 1. Kiosk face registration | ✅ | ✅ | ✅ | ✅ | PASS |
| 2. Mobile attendance flow | ✅ | ✅ | N/A | N/A | PASS |
| 3. Background recovery | ✅ | ✅ | ✅ | ✅ | PASS |
| 4. Camera denial | ✅ | ✅ | ✅ | ✅ | PASS |
| 5. Location denial | ✅ | ✅ | N/A | N/A | PASS |
| 6. Double-tap guard | ✅ | ✅ | ✅ | ✅ | PASS |
| 7. Touch targets | ✅ | ✅ | ✅ | ✅ | PASS |
| 8. 100dvh viewport | ✅ | N/A | ✅ | N/A | PASS |
| 9. PWA installability | N/A | N/A | ✅ | ✅ | PASS |

## Bugs Found

### Critical (0)
(None)

### High (0)
(None)

### Medium (2)
1. GPS accuracy is 150m indoors on Pixel 6 (acceptable, < 500m threshold)
2. Touch target for "Retry" button is 42px on iPad (acceptable for beta, > 40px)

### Low (1)
1. Minor layout shift on address bar hide/show on iPhone 12 (cosmetic)

## Performance Results

| Metric | iPhone | Android Phone | iPad | Android Tablet | Target | Status |
|--------|--------|--------------|------|----------------|--------|--------|
| Frame size (KB) | 45 | 52 | 38 | 41 | <= 300 | ✅ PASS |
| GPS accuracy (m) | 12 | 18 | N/A | N/A | <= 100 | ✅ PASS |
| Camera start (s) | 1.2 | 1.5 | 1.1 | 1.3 | <= 3 | ✅ PASS |

## Task 2.8 Face Recognition Results

| Employee | Device | Distance | Match | Frame Size |
|----------|--------|----------|-------|-----------|
| 1 | iPhone 13 | 0.42 | ✅ YES | 48 KB |
| 2 | Pixel 6 | 0.38 | ✅ YES | 51 KB |
| 3 | iPad Pro | 0.45 | ✅ YES | 39 KB |
| 4 | Galaxy Tab | 0.41 | ✅ YES | 43 KB |
| 5 | iPhone 12 | 0.47 | ✅ YES | 46 KB |

**Average Distance**: 0.426 (< 0.5 target, 87% safety margin)  
**All Matches**: YES (5/5)  
**Status**: ✅ **CLEARED FOR BETA**

## Recommendation

**APPROVED FOR BETA RELEASE**

All critical and high-priority scenarios passed on all devices. Medium/low bugs are documented and deferred to post-beta. Face recognition tolerance is validated with real devices and shows excellent accuracy (average distance 0.426, well below 0.6 threshold).

**Next Steps**:
1. Mark Task 4.5 as complete (✅)
2. Merge `feature/mobile-pwa-readiness` to `main`
3. Deploy to production
4. Monitor for any edge cases in beta
5. Address medium/low bugs in next sprint
```

---

## Contact Information

**Questions/Issues during testing**:
- Technical Lead: [Name, Email]
- QA Manager: [Name, Email]
- Backend Engineer: [Name, Email]
- DevOps: [Name, Email]

**Slack Channels**:
- #mobile-pwa-testing
- #biometria-beta
- #engineering-support

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-03-06 | 1.0 | Agent F | Initial testing plan created |

---

**END OF TESTING CHECKLIST**
