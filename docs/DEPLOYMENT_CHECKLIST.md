# 🚀 Deployment Checklist - Sistema Biométrico SASVIN

## Current Status
- **URL**: https://asistencia.sistemaslab.dev
- **Location**: Dokploy on LXC 117 (Proxmox)
- **Status**: ⚠️ Deployed but needs fixes

## 🔴 Critical Issues to Fix

### 1. Frontend API URL Issue
- [ ] Build frontend with production configuration
- [ ] Verify `/api/v1` is used instead of `localhost:8000`
- [ ] Run: `cd frontend && npm run build:prod`

### 2. Backend CORS Configuration
- [ ] Update backend `.env` with production CORS settings
- [ ] Add `https://asistencia.sistemaslab.dev` to allowed origins
- [ ] Copy `.env.production` to `.env` in backend

### 3. Admin User Creation
- [ ] Create admin user in database
- [ ] Email: `admin@sistemaslab.dev`
- [ ] Password: `Admin2024!` (change immediately!)

## 📋 Step-by-Step Deployment Process

### Local Preparation (Your Machine)

1. **Fix Frontend Build**
   ```bash
   cd frontend
   npm run build:prod
   ```

2. **Update Backend Environment**
   ```bash
   cp backend/.env.production backend/.env
   ```

3. **Build Docker Images**
   ```bash
   docker-compose build --no-cache
   ```

### On Dokploy (LXC 117)

4. **Access Dokploy Dashboard**
   - URL: http://IP_OF_LXC_117:3000 (usually internal IP)
   - Navigate to biometria project

5. **Update Services**
   - Click "Redeploy" on frontend service
   - Click "Redeploy" on backend service
   - Wait for health checks

6. **Create Admin User**
   ```bash
   # SSH into LXC 117
   ssh root@IP_OF_LXC_117
   
   # Enter API container
   docker exec -it biometria_api bash
   
   # Run admin creation script
   python /app/create_admin_user.py
   
   # Or use SQL directly
   docker exec -it biometria_db psql -U biometria -d biometria_db
   \i /create_admin.sql
   ```

## ✅ Verification Steps

### 1. Frontend Accessibility
- [ ] Visit https://asistencia.sistemaslab.dev
- [ ] Page loads without errors
- [ ] Check browser console for API errors

### 2. API Health
- [ ] Check https://asistencia.sistemaslab.dev/api/v1/health
- [ ] Should return: `{"status": "healthy"}`

### 3. Admin Panel Access
- [ ] Navigate to https://asistencia.sistemaslab.dev/admin
- [ ] Login with admin@sistemaslab.dev / Admin2024!
- [ ] Change password immediately!

### 4. PWA Installation
- [ ] Open site on mobile device
- [ ] Browser should prompt "Install App"
- [ ] Test camera access
- [ ] Test geolocation access

### 5. Core Functionality
- [ ] Register a test location (sede)
- [ ] Register a test professor
- [ ] Test attendance marking with face recognition
- [ ] Verify attendance records are saved

## 🔄 Quick Fix Commands

```bash
# If frontend shows localhost:8000 errors
cd frontend && npm run build:prod && docker-compose build frontend

# If CORS errors appear
docker exec -it biometria_api bash -c "echo 'CORS_ORIGINS=https://asistencia.sistemaslab.dev' >> .env"
docker-compose restart backend

# If admin login fails
docker exec -it biometria_db psql -U biometria -d biometria_db -c "SELECT email, role FROM users WHERE role='admin';"
```

## 📱 Mobile Testing

1. **Android**
   - Chrome: Menu → "Add to Home Screen"
   - Should create app icon
   - Opens in fullscreen mode

2. **iOS**
   - Safari: Share → "Add to Home Screen"
   - Creates web app icon
   - Opens without browser chrome

## 🔔 Monitoring

- **Telegram Alerts**: @richardsasvin_bot
- **Chat ID**: 598890339
- **Auto-recovery**: Running every 2 minutes
- **Memory**: 16GB RAM + 6GB swap configured

## 📞 Support Contacts

- **System Admin**: Richard Ortiz
- **Telegram**: @richardsasvin_bot
- **Project**: Sistema de Asistencia Biométrica SASVIN

## ⚠️ Important Security Notes

1. **Change default admin password immediately!**
2. **Update SECRET_KEY in production .env**
3. **Enable HTTPS only (already configured)**
4. **Regular backups not yet configured (no disk space)**

## 🚫 Known Limitations

- Backup system pending (disk space issue)
- No staging environment
- Manual deployment process via Dokploy

---

Last Updated: March 2024
Status: Production with pending fixes