# Android Setup Guide for Npd

---

## 📦 Supabase Setup

Supabase does **NOT** require any special Android config file (no `google-services.json` equivalent).  
The Supabase URL and Anon Key are already embedded in the app code (`src/lib/supabase.ts`).  
Authentication and database work over HTTPS — no native SDK or Gradle plugin needed.

### Deep Link / OAuth Redirect Setup

For Supabase OAuth (Google Sign-In via Supabase), ensure your redirect URL is whitelisted in your [Supabase Dashboard](https://supabase.com/dashboard) → Authentication → URL Configuration:

- `https://polputoxbnclumxhvnjd.supabase.co/auth/v1/callback`
- Your app's deep link scheme (e.g., `nota.npd.com://callback`)

---

## Google Sign-In (via @codetrix-studio/capacitor-google-auth)

Google Sign-In is handled by the `@codetrix-studio/capacitor-google-auth` Capacitor plugin in this project.  
Do **not** use `ee.forgr.capacitor.social.login.*` imports unless you fully migrate the app to `@capgo/capacitor-social-login`.

### Step 1: Confirm the plugin dependency

**File:** `package.json`

```json
"@codetrix-studio/capacitor-google-auth": "^3.4.0-rc.4"
```

After installing dependencies, run:

```bash
npx cap sync android
```

> `google-services.json` and `com.google.gms.google-services` are **not required** for this plugin setup.

---

## Complete AndroidManifest.xml

**File:** `android/app/src/main/AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="nota.npd.com">

    <!-- Internet & Network -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <!-- Push & Local Notifications -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <!-- Foreground Service (for notifications) -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

    <!-- Microphone (for voice notes/recording) -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />

    <!-- Camera (for scanning/photos) -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <!-- Biometric (for app lock) -->
    <uses-permission android:name="android.permission.USE_BIOMETRIC" />
    <uses-permission android:name="android.permission.USE_FINGERPRINT" />

    <!-- Calendar (for system calendar sync) -->
    <uses-permission android:name="android.permission.READ_CALENDAR" />
    <uses-permission android:name="android.permission.WRITE_CALENDAR" />

    <!-- Google Advertising ID for analytics & ads -->
    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />

    <!-- ==================== APPLICATION ==================== -->
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:label="@string/title_activity_main"
            android:launchMode="singleTask"
            android:name=".MainActivity"
            android:theme="@style/AppTheme.NoActionBarLaunch">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Deep Link support -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="voice-brushstrokes.lovable.app" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>

    </application>

</manifest>
```

---

## Complete MainActivity.java (Google Sign-In + Splash Screen)

**File:** `android/app/src/main/java/nota/npd/com/MainActivity.java`

```java
package nota.npd.com;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

/**
 * Main Activity for Npd App
 * - Google Sign-In via @codetrix-studio/capacitor-google-auth
 * - Edge-to-edge layout (Android 15+ / API 35)
 * - Backend: Supabase (no Firebase)
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuth.class);

        // Enable edge-to-edge rendering (required for Android 15+ / API 35)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
    }
}
```

---

## Splash Screen Setup (Android 12+ API)

### styles.xml

**File:** `android/app/src/main/res/values/styles.xml`

```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <!-- Splash background color -->
    <item name="windowSplashScreenBackground">#3b78ed</item>
</style>
```

---

## App-Level Dependencies (build.gradle)

**File:** `android/app/build.gradle`

```gradle
dependencies {
    // Google Play Billing
    implementation "com.android.billingclient:billing:7.1.1"
    
    // Android 12+ SplashScreen API (backward compatible to API 21)
    implementation "androidx.core:core-splashscreen:1.0.1"
}
```

> **No Firebase dependencies needed.** All backend (auth, database, sync) is handled by Supabase via the web layer.

---

## strings.xml

**File:** `android/app/src/main/res/values/strings.xml`

```xml
    <!-- Google Sign-In Web Client ID (for @capgo/capacitor-social-login) -->
    <string name="server_client_id">425291387152-u06impgmsgg286jg7odo4f40fu6pjmb5.apps.googleusercontent.com</string>
```

---

## Summary: What Changed (Firebase → Supabase)

| Before (Firebase)                     | Now (Supabase)                              |
|---------------------------------------|---------------------------------------------|
| `google-services.json` for Firebase   | `google-services.json` only for Google Sign-In identity |
| Firebase Auth SDK                     | Supabase Auth (web-based, no native SDK)    |
| Firebase Realtime Database SDK        | Supabase PostgreSQL (via JS client)         |
| Firebase Gradle plugins & BoM         | **Removed** — not needed                    |
| `firebase-auth`, `firebase-database`  | **Removed** from `build.gradle`             |

---

## 🎨 Fix Bottom Navigation Bar Gap (Edge-to-Edge)

The app now uses a transparent overlay status bar. To also fix the **bottom system navigation bar gap** (light gray bar below the app), you need to set the navigation bar color in your Android theme.

### Step 1: Open `android/app/src/main/res/values/styles.xml`

Add these lines inside the `<style>` tag:

```xml
<style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
    <!-- Existing items... -->
    
    <!-- Match navigation bar to app background -->
    <item name="android:navigationBarColor">@android:color/white</item>
    <item name="android:windowLightNavigationBar">true</item>
</style>
```

### Step 2: For Dark Themes

If your app supports dark mode, also create `android/app/src/main/res/values-night/styles.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="android:navigationBarColor">#152518</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
</resources>
```

### Step 3: Edge-to-Edge (Optional, API 35+)

For full edge-to-edge on Android 15+, add this to `MainActivity.java`:

```java
import androidx.core.view.WindowCompat;

@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
}
```

Then run `npx cap sync android` to apply changes.
