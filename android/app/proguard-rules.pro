# ProGuard / R8 rules for Capacitor + Play Billing + WebView JS bridge

# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ---------- Capacitor ----------
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}
-keep class * extends com.getcapacitor.Plugin { *; }

# ---------- Cordova (used by some Capacitor plugins) ----------
-keep class org.apache.cordova.** { *; }

# ---------- WebView JavaScript interface ----------
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ---------- Google Play Billing ----------
-keep class com.android.billingclient.api.** { *; }
-keep class com.android.vending.billing.** { *; }

# ---------- Firebase / Google Services (safe defaults) ----------
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ---------- AndroidX ----------
-dontwarn androidx.**
-keep class androidx.core.app.CoreComponentFactory { *; }

# ---------- Kotlin ----------
-dontwarn kotlin.**
-dontwarn kotlinx.**

# ---------- Suppress reflection warnings from plugins ----------
-dontwarn org.chromium.**
-dontwarn com.google.errorprone.**
-dontwarn javax.annotation.**
