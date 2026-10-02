import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mmu.fleetradar',
  appName: 'MMU FleetRadar 3D',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*'],
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
