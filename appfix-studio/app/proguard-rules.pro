# AppFix Studio ships without code shrinking for now (isMinifyEnabled = false).
# Rules below are kept for when minification is enabled.
-keep class io.github.rosemoe.sora.** { *; }
-keep class com.android.apksig.** { *; }
-keepclassmembers class **$$serializer { *; }
