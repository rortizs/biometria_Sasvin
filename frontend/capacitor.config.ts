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
