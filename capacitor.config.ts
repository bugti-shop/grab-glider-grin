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
    SocialLogin: {
      google: {
        // Android uses the Web Client ID (OAuth 2.0 Web application) from Google Cloud.
        // The Android OAuth client (matching package + SHA-1) must also exist in the same project.
        webClientId: '425291387152-u06impgmsgg286jg7odo4f40fu6pjmb5.apps.googleusercontent.com',
      },
    },
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
