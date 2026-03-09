import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sasvin.biometria',
  appName: 'Sasvin Biometrico',
  webDir: 'dist/frontend/browser',
  server: {
    // Beta: Remote URL — native app loads web from production server
    // Remove this before app store submission (use bundled build instead)
    url: 'https://biometria.sistemaslab.dev',
    cleartext: false,
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
