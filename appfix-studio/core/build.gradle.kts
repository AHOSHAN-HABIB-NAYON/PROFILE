// Pure Kotlin/JVM module: all analysis, import-safety, diff and repair logic lives here
// so it can be unit-tested on any JVM without an Android device or emulator.
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)
    api(libs.diff.utils)
    api(libs.bouncycastle.pkix)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}

tasks.test {
    // CI passes the freshly built sample APK so the APK inspector is tested against a real build.
    System.getenv("APPFIX_SAMPLE_APK")?.let { systemProperty("appfix.sampleApk", it) }
    // When CI asks for generated projects to be written, the test must really run (not come from cache).
    if (System.getenv("APPFIX_GENERATED_OUT") != null) {
        outputs.cacheIf { false }
        outputs.upToDateWhen { false }
    }
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
