# FilePilot uses no reflection-based serialization except kotlinx.serialization for
# navigation routes, whose generated serializers are kept by the library's own consumer rules.
-keepattributes SourceFile,LineNumberTable

# Archive libraries reference optional codecs and logging bindings that are not bundled.
-dontwarn org.slf4j.**
-dontwarn org.brotli.**
-dontwarn com.github.luben.zstd.**
-dontwarn org.objectweb.asm.**
-dontwarn org.osgi.**
-dontwarn javax.annotation.**
-keep class org.tukaani.xz.** { *; }
