# DevicePilot uses no reflection-based serialization. Keep the VPN service and receivers
# (they are referenced from the manifest, which R8 already handles).
-keepattributes SourceFile,LineNumberTable
