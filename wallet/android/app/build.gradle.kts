import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val wallet = Properties().apply {
    rootProject.file("wallet.properties").inputStream().use { load(it) }
}

android {
    namespace = "com.ahoshan.joma"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ahoshan.joma"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "BASE_URL", "\"${wallet.getProperty("base_url", "").trimEnd('/')}\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${wallet.getProperty("google_web_client_id", "")}\"")
    }

    signingConfigs {
        // Test key, committed so every build has the same fingerprint (see README).
        // Use your own private key for a Play Store release.
        getByName("debug") {
            storeFile = file("joma-test.keystore")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Credential Manager: native Google sign-in and passkeys, no browser involved.
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
