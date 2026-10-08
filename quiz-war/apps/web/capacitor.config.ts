import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android packaging. `server.hostname` is the production web domain so the WebView origin is
 * https://<domain>; that keeps cookies/passkeys/App Links on one origin. Never put secrets here.
 */
const config: CapacitorConfig = {
  appId: process.env.ANDROID_APP_ID ?? 'app.quizwar.bd',
  appName: 'QUIZ WAR',
  webDir: 'dist',
  android: {
    path: '../android',
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
  },
  server: {
    androidScheme: 'https',
    hostname: process.env.CAP_HOSTNAME ?? 'quizwar.app',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#1d4ed8',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    StatusBar: { overlaysWebView: false, style: 'LIGHT', backgroundColor: '#1d4ed8' },
    SocialLogin: { google: true, apple: false, facebook: false, twitter: false },
  },
};

export default config;
