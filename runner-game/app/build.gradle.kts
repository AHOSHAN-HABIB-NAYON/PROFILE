plugins {
    id("com.android.application")
}

android {
    namespace = "com.ahoshan.dourbaj"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ahoshan.dourbaj"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        // A fixed debug key, so a newer build installs over an older one.
        getByName("debug") {
            storeFile = file("debug.keystore")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
