# R8 rules for AppFix Studio release builds.

# Keep stack traces readable in crash reports.
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# sora-editor loads language/scheme classes and uses reflection internally.
-keep class io.github.rosemoe.sora.** { *; }
-dontwarn io.github.rosemoe.sora.**

# apksig: signing and verification (no reflection, but keep it whole so error messages stay meaningful).
-keep class com.android.apksig.** { *; }

# BouncyCastle is looked up through the JCA provider mechanism (reflection), and has optional dependencies.
-keep class org.bouncycastle.jcajce.provider.** { *; }
-keep class org.bouncycastle.jce.provider.** { *; }
-keep class org.bouncycastle.pqc.jcajce.provider.** { *; }
-dontwarn org.bouncycastle.**
-dontwarn javax.naming.**

# kotlinx.serialization: type-safe navigation routes and stored JSON (reports, settings, change history).
-keepclassmembers @kotlinx.serialization.Serializable class com.appfix.** {
    *** Companion;
    static ** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.appfix.**$$serializer { *; }
-keepclassmembers class com.appfix.** {
    *** Companion;
}
-keepclasseswithmembers class com.appfix.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep @kotlinx.serialization.Serializable class com.appfix.** { *; }
-keepclassmembers enum com.appfix.** { *; }

# java-diff-utils
-dontwarn com.github.difflib.**

# Referenced by libraries but not present on Android.
-dontwarn java.awt.**
-dontwarn javax.lang.model.**
-dontwarn org.slf4j.**
-dontwarn com.google.errorprone.annotations.**
