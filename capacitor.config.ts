import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flowist.app',
  appName: 'Flowist',
  webDir: 'dist',
  server: {
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      showSpinner: false,
      backgroundColor: '#ffffff',
      backgroundColorDark: '#000000',
    },
    // Native Google + Apple sign-in are configured at runtime via
    // @capgo/capacitor-social-login → SocialLogin.initialize() in
    // src/utils/googleAuth.ts and src/utils/nativeAppleAuth.ts.
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: false,
    },
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
    zoomEnabled: true,
  },
  ios: {
    scrollEnabled: true,
    backgroundColor: '#ffffff',
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
