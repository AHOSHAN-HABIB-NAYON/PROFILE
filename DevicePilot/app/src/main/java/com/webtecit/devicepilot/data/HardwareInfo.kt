package com.webtecit.devicepilot.data

import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES20
import android.os.Build
import java.io.File
import java.util.Locale

data class CpuCluster(val cores: Int, val maxMhz: Int)

data class CameraSpec(
    val id: String,
    val facing: String,
    val megapixels: Float?,
    val resolution: String?,
    val aperture: Float?,
    val focalMm: Float?,
    val ois: Boolean,
    val flash: Boolean,
    val maxVideo: String?,
)

/** Hardware facts read on the device: CPU clusters, chipset name, GPU, cameras, rated battery. */
class HardwareInfo(private val context: Context) {

    fun cpuClusters(): List<CpuCluster> {
        val cores = Runtime.getRuntime().availableProcessors()
        val freqs = (0 until cores).mapNotNull { core ->
            runCatching {
                File("/sys/devices/system/cpu/cpu$core/cpufreq/cpuinfo_max_freq").readText().trim().toLong() / 1000
            }.getOrNull()?.toInt()
        }
        if (freqs.isEmpty()) return emptyList()
        return freqs.groupingBy { it }.eachCount().map { (mhz, n) -> CpuCluster(n, mhz) }.sortedByDescending { it.maxMhz }
    }

    fun clusterSummary(): String? = cpuClusters().takeIf { it.isNotEmpty() }?.joinToString("\n") {
        String.format(Locale.US, "%d × %.2f GHz", it.cores, it.maxMhz / 1000f)
    }

    /** SoC model code (Android 12+) or board platform, mapped to a marketing name when known. */
    fun chipset(): Pair<String?, String?> {
        val code = if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL.takeIf { it.isNotBlank() && it != Build.UNKNOWN } else null
        val maker = if (Build.VERSION.SDK_INT >= 31) Build.SOC_MANUFACTURER.takeIf { it.isNotBlank() && it != Build.UNKNOWN } else null
        val key = (code ?: Build.HARDWARE).uppercase(Locale.US)
        val name = SOC_NAMES.entries.firstOrNull { key.startsWith(it.key) }?.value
        val label = listOfNotNull(maker?.replaceFirstChar { it.uppercase() }, code).joinToString(" ").ifBlank { null }
        return name to label
    }

    @Volatile private var gpuCache: Pair<String?, String?>? = null

    /** GPU renderer and vendor, read from a tiny off-screen OpenGL ES context. */
    fun gpu(): Pair<String?, String?> {
        gpuCache?.let { return it }
        val result = runCatching {
            val display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val version = IntArray(2)
            EGL14.eglInitialize(display, version, 0, version, 1)
            val attribs = intArrayOf(EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT, EGL14.EGL_NONE)
            val configs = arrayOfNulls<EGLConfig>(1)
            val num = IntArray(1)
            EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, num, 0)
            val ctx = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT,
                intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
            val surface = EGL14.eglCreatePbufferSurface(display, configs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
            EGL14.eglMakeCurrent(display, surface, surface, ctx)
            val renderer = GLES20.glGetString(GLES20.GL_RENDERER)
            val vendor = GLES20.glGetString(GLES20.GL_VENDOR)
            EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            EGL14.eglDestroySurface(display, surface)
            EGL14.eglDestroyContext(display, ctx)
            EGL14.eglTerminate(display)
            renderer to vendor
        }.getOrDefault(null to null)
        gpuCache = result
        return result
    }

    /**
     * Rated battery capacity from Android's power profile (the value the system uses for its
     * battery statistics, also shown by other hardware-info apps). Returns null when unavailable.
     */
    fun ratedBatteryCapacityMah(): Int? = runCatching {
        val cls = Class.forName("com.android.internal.os.PowerProfile")
        val profile = cls.getConstructor(Context::class.java).newInstance(context)
        (cls.getMethod("getBatteryCapacity").invoke(profile) as Double).toInt()
    }.getOrNull()?.takeIf { it in 500..30_000 }

    fun cameras(): List<CameraSpec> = runCatching {
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        cm.cameraIdList.map { id ->
            val ch = cm.getCameraCharacteristics(id)
            val facing = when (ch.get(CameraCharacteristics.LENS_FACING)) {
                CameraCharacteristics.LENS_FACING_FRONT -> "Front"
                CameraCharacteristics.LENS_FACING_BACK -> "Rear"
                else -> "External"
            }
            val px = ch.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE)
            val mp = px?.let { it.width * it.height / 1_000_000f }
            val aperture = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_APERTURES)?.firstOrNull()
            val focal = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull()
            val ois = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION)
                ?.any { it == CameraCharacteristics.LENS_OPTICAL_STABILIZATION_MODE_ON } == true
            val flash = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            val video = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?.getOutputSizes(ImageFormat.PRIVATE)?.maxByOrNull { it.width.toLong() * it.height }
                ?.let { s -> videoLabel(s.width, s.height) }
            CameraSpec(id, facing, mp, px?.let { "${it.width} × ${it.height}" }, aperture, focal, ois, flash, video)
        }
    }.getOrDefault(emptyList())

    private fun videoLabel(w: Int, h: Int): String {
        val long = maxOf(w, h)
        return when {
            long >= 7680 -> "8K"
            long >= 3840 -> "4K"
            long >= 1920 -> "1080p"
            else -> "${minOf(w, h)}p"
        }
    }

    companion object {
        /** Common SoC model codes → marketing names (prefix match). */
        val SOC_NAMES = linkedMapOf(
            "SM8750" to "Snapdragon 8 Elite", "SM8650" to "Snapdragon 8 Gen 3", "SM8635" to "Snapdragon 8s Gen 3",
            "SM8550" to "Snapdragon 8 Gen 2", "SM8475" to "Snapdragon 8+ Gen 1", "SM8450" to "Snapdragon 8 Gen 1",
            "SM8350" to "Snapdragon 888", "SM8250" to "Snapdragon 865", "SM8150" to "Snapdragon 855",
            "SM7675" to "Snapdragon 7+ Gen 3", "SM7550" to "Snapdragon 7 Gen 3", "SM7475" to "Snapdragon 7+ Gen 2",
            "SM7450" to "Snapdragon 7 Gen 1", "SM7435" to "Snapdragon 7s Gen 2", "SM7325" to "Snapdragon 778G",
            "SM7225" to "Snapdragon 750G", "SM7150" to "Snapdragon 730", "SM7125" to "Snapdragon 720G",
            "SM6450" to "Snapdragon 6 Gen 1", "SM6375" to "Snapdragon 695", "SM6225" to "Snapdragon 680",
            "SM6150" to "Snapdragon 675", "SM6125" to "Snapdragon 665", "SM4450" to "Snapdragon 4 Gen 2",
            "SM4375" to "Snapdragon 4 Gen 1", "SM4350" to "Snapdragon 480", "SDM845" to "Snapdragon 845",
            "SDM660" to "Snapdragon 660", "SDM450" to "Snapdragon 450",
            "MT6991" to "Dimensity 9400", "MT6989" to "Dimensity 9300", "MT6985" to "Dimensity 9200",
            "MT6983" to "Dimensity 9000", "MT6897" to "Dimensity 8300", "MT6896" to "Dimensity 8200",
            "MT6895" to "Dimensity 8100", "MT6886" to "Dimensity 7200", "MT6878" to "Dimensity 7300",
            "MT6877" to "Dimensity 900/920/1080", "MT6855" to "Dimensity 7020/930", "MT6853" to "Dimensity 720/800U",
            "MT6835" to "Dimensity 6100+/6300", "MT6833" to "Dimensity 700/810", "MT6789" to "Helio G99",
            "MT6785" to "Helio G90T/G95", "MT6781" to "Helio G96", "MT6769" to "Helio G85/G88",
            "MT6768" to "Helio G80/G85", "MT6765" to "Helio P35/G35", "MT6762" to "Helio P22",
            "S5E9945" to "Exynos 2400", "S5E9935" to "Exynos 2200", "S5E9925" to "Exynos 2200",
            "S5E8845" to "Exynos 1480", "S5E8835" to "Exynos 1380", "S5E8825" to "Exynos 1280",
            "GS401" to "Google Tensor G4", "ZUMA" to "Google Tensor G3", "GS201" to "Google Tensor G2",
            "GS101" to "Google Tensor", "T618" to "Unisoc T618", "T606" to "Unisoc T606", "T616" to "Unisoc T616",
        )
    }
}
