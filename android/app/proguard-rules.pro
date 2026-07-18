# R8 / ProGuard rules for Flowist (Capacitor + WebView app)
# Keep line numbers for readable stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep annotations/signatures used by reflection & JSON libs
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# ---------- Capacitor ----------
# Capacitor discovers plugins & bridge methods via reflection.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class * implements com.getcapacitor.Plugin { *; }

# Community / Capgo / Cordova plugins loaded via reflection
-keep class com.capacitorjs.** { *; }
-keep class ee.forgr.** { *; }
-keep class ca.byteihq.** { *; }
-keep class io.capawesome.** { *; }
-keep class org.apache.cordova.** { *; }

# App package (Capacitor MainActivity + any custom plugins)
-keep class nota.npd.com.** { *; }

# ---------- WebView JS interfaces ----------
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ---------- Google Play Billing ----------
-keep class com.android.billingclient.** { *; }
-dontwarn com.android.billingclient.**

# ---------- Google Play Services / GMS ----------
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ---------- AndroidX / Material ----------
-dontwarn androidx.**
-dontwarn com.google.android.material.**

# ---------- OkHttp / Okio (transitive) ----------
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**

# ---------- Kotlin ----------
-dontwarn kotlin.**
-dontwarn kotlinx.**
