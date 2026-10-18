import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.appfix.studio"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.appfix.studio"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 2
        versionName = "0.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/versions/9/OSGI-INF/MANIFEST.MF")
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkDependencies = false
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "OldTargetApi", "ObsoleteLintCustomCheck")
        xmlReport = true
        htmlReport = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all { test ->
            System.getenv("APPFIX_SAMPLE_APK")?.let { test.environment("APPFIX_SAMPLE_APK", it) }
        }
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(project(":core"))

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.documentfile)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.apksig)
    implementation(libs.sora.editor)
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
}

/**
 * Packs files the app ships as assets:
 * - bundled/sample-project.zip: the sample app, importable from the Home screen
 * - bundled/wrapper/*: Gradle wrapper templates used by the "Add Gradle wrapper" repair
 */
abstract class BundleAppFixAssets : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sampleDir: DirectoryProperty

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.NAME_ONLY)
    abstract val wrapperFiles: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun bundle() {
        val out = outputDir.get().asFile
        out.deleteRecursively()
        val bundled = File(out, "bundled").apply { mkdirs() }
        val skip = setOf("build", ".gradle", ".idea", ".kotlin", ".cxx")
        val root = sampleDir.get().asFile
        ZipOutputStream(File(bundled, "sample-project.zip").outputStream().buffered()).use { zip ->
            root.walkTopDown()
                .onEnter { it == root || it.name !in skip }
                .filter { it.isFile && it.name != "local.properties" }
                .sortedBy { it.relativeTo(root).invariantSeparatorsPath }
                .forEach { f ->
                    val entry = ZipEntry("sample-project/" + f.relativeTo(root).invariantSeparatorsPath)
                    entry.time = 0L // reproducible archive
                    zip.putNextEntry(entry)
                    f.inputStream().use { it.copyTo(zip) }
                    zip.closeEntry()
                }
        }
        val wrapper = File(bundled, "wrapper").apply { mkdirs() }
        wrapperFiles.files.forEach { it.copyTo(File(wrapper, it.name), overwrite = true) }
    }
}

val bundleAppFixAssets = tasks.register<BundleAppFixAssets>("bundleAppFixAssets") {
    sampleDir.set(rootProject.layout.projectDirectory.dir("sample-project"))
    wrapperFiles.from(
        rootProject.file("gradle/wrapper/gradle-wrapper.jar"),
        rootProject.file("gradlew"),
        rootProject.file("gradlew.bat"),
    )
    outputDir.set(layout.buildDirectory.dir("generated/appfixAssets"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(bundleAppFixAssets, BundleAppFixAssets::outputDir)
    }
}
