package com.appfix.core.project

import kotlinx.serialization.Serializable

@Serializable
enum class Framework(val displayName: String) {
    ANDROID_NATIVE("Native Android (Gradle)"),
    FLUTTER("Flutter"),
    REACT_NATIVE("React Native"),
    EXPO("Expo (React Native)"),
    CORDOVA("Cordova"),
    CAPACITOR("Capacitor"),
    UNITY("Unity"),
    XAMARIN("Xamarin / .NET MAUI"),
    KOTLIN_MULTIPLATFORM("Kotlin Multiplatform"),
    GRADLE_JVM("Gradle (non-Android)"),
    UNKNOWN("Unknown"),
}

@Serializable
enum class ModuleType { APPLICATION, LIBRARY, OTHER }

@Serializable
data class GradleModule(
    val gradlePath: String,
    val dir: String,
    val buildFile: String?,
    val type: ModuleType,
    val namespace: String? = null,
    val applicationId: String? = null,
    val compileSdk: Int? = null,
    val minSdk: Int? = null,
    val targetSdk: Int? = null,
    val versionCode: Int? = null,
    val versionName: String? = null,
    val manifestPath: String? = null,
    val resDir: String? = null,
    val usesCompose: Boolean = false,
)

@Serializable
data class ProjectInfo(
    /** Root of the project, relative to the workspace (empty when the workspace itself is the root). */
    val root: String,
    val framework: Framework,
    val languages: List<String>,
    val uiToolkits: List<String>,
    /** Directory containing the Gradle Android build, relative to [root] ("" or "android"). */
    val androidDir: String?,
    val modules: List<GradleModule>,
    val gradleVersion: String?,
    val agpVersion: String?,
    val kotlinVersion: String?,
    val hasGradleWrapper: Boolean,
    val hasWrapperJar: Boolean,
    val usesKotlinDsl: Boolean,
    val sourceFileCount: Int,
    val notes: List<String>,
) {
    val appModule: GradleModule? get() = modules.firstOrNull { it.type == ModuleType.APPLICATION }
    val isEditableAndroid: Boolean get() = androidDir != null && modules.any { it.type != ModuleType.OTHER }

    /** Explains how this project would be built. Never claims on-device builds are possible. */
    val buildCommand: String? get() = when (framework) {
        Framework.ANDROID_NATIVE -> "./gradlew assembleDebug"
        Framework.FLUTTER -> "flutter build apk --debug"
        Framework.REACT_NATIVE -> "npm ci && cd android && ./gradlew assembleDebug"
        Framework.EXPO -> if (androidDir != null) "npm ci && cd android && ./gradlew assembleDebug" else "npx expo prebuild && cd android && ./gradlew assembleDebug"
        Framework.CAPACITOR -> "npm ci && npx cap sync android && cd android && ./gradlew assembleDebug"
        Framework.CORDOVA -> "cordova build android"
        Framework.KOTLIN_MULTIPLATFORM -> "./gradlew assembleDebug"
        else -> null
    }
}
