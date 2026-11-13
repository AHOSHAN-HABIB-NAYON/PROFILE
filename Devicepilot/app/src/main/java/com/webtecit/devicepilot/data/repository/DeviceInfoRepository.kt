package com.webtecit.devicepilot.data.repository

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.display.DisplayManager
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Display
import com.webtecit.devicepilot.core.common.Formatters
import com.webtecit.devicepilot.core.common.Reading
import com.webtecit.devicepilot.core.common.UnavailableReason
import com.webtecit.devicepilot.domain.model.DisplayInfo
import com.webtecit.devicepilot.domain.model.InfoSection
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.sqrt

data class CameraInfo(
    val id: String,
    val facing: String,
    val megapixels: Reading<Float>,
    val resolution: Reading<String>,
    val hasFlash: Boolean,
    val focalLengthsMm: List<Float>,
    val apertures: List<Float>,
    val hardwareLevel: String,
)

data class SensorEntry(val name: String, val type: String, val vendor: String, val maxRange: Float, val resolution: Float, val powerMa: Float)

@Singleton
class DeviceInfoRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val system: SystemRepository,
    private val battery: BatteryRepository,
    private val network: NetworkRepository,
) {

    fun deviceName(): String {
        val userName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            runCatching { Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) }.getOrNull()
        } else null
        return userName?.takeIf { it.isNotBlank() } ?: marketingModel()
    }

    fun marketingModel(): String {
        val manufacturer = Build.MANUFACTURER.replaceFirstChar { it.titlecase(Locale.US) }
        return if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) Build.MODEL else "$manufacturer ${Build.MODEL}"
    }

    fun androidVersionLabel(): String = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"

    fun securityPatch(): Reading<String> =
        Build.VERSION.SECURITY_PATCH.takeIf { it.isNotBlank() }?.let { Reading.Measured(it) }
            ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)

    // ------------------------------------------------------------------ display

    fun display(): DisplayInfo {
        val dm = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val display = dm.getDisplay(Display.DEFAULT_DISPLAY)
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION") display.getRealMetrics(metrics)
        val mode = display.mode
        val width = mode.physicalWidth.takeIf { it > 0 } ?: metrics.widthPixels
        val height = mode.physicalHeight.takeIf { it > 0 } ?: metrics.heightPixels
        val diagonal: Reading<Float> = if (metrics.xdpi > 0 && metrics.ydpi > 0) {
            val w = width / metrics.xdpi
            val h = height / metrics.ydpi
            Reading.Estimated(sqrt(w * w + h * h), "pixels ÷ reported DPI")
        } else Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
        val rates = display.supportedModes
            .filter { it.physicalWidth == mode.physicalWidth && it.physicalHeight == mode.physicalHeight }
            .map { it.refreshRate }
            .ifEmpty { display.supportedModes.map { it.refreshRate } }
            .map { (it * 10).toInt() / 10f }
            .distinct().sorted()
        val hdr = runCatching {
            @Suppress("DEPRECATION")
            display.hdrCapabilities?.supportedHdrTypes?.map {
                when (it) {
                    Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION -> "Dolby Vision"
                    Display.HdrCapabilities.HDR_TYPE_HDR10 -> "HDR10"
                    Display.HdrCapabilities.HDR_TYPE_HLG -> "HLG"
                    Display.HdrCapabilities.HDR_TYPE_HDR10_PLUS -> "HDR10+"
                    else -> "Type $it"
                }
            }
        }.getOrNull().orEmpty()
        val wide: Reading<Boolean> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Reading.Measured(display.isWideColorGamut)
        else Reading.Unavailable(UnavailableReason.NOT_SUPPORTED)
        return DisplayInfo(
            widthPx = minOf(width, height),
            heightPx = maxOf(width, height),
            densityDpi = metrics.densityDpi,
            densityBucket = densityBucket(metrics.densityDpi),
            xdpi = metrics.xdpi,
            ydpi = metrics.ydpi,
            diagonalInches = diagonal,
            refreshRate = display.refreshRate,
            supportedRefreshRates = rates,
            hdrTypes = hdr,
            isWideColorGamut = wide,
        )
    }

    private fun densityBucket(dpi: Int) = when {
        dpi <= 120 -> "ldpi"
        dpi <= 160 -> "mdpi"
        dpi <= 240 -> "hdpi"
        dpi <= 320 -> "xhdpi"
        dpi <= 480 -> "xxhdpi"
        else -> "xxxhdpi"
    }

    // ------------------------------------------------------------------ cameras & sensors

    fun cameras(): Reading<List<CameraInfo>> = try {
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        Reading.Measured(cm.cameraIdList.map { id ->
            val ch = cm.getCameraCharacteristics(id)
            val facing = when (ch.get(CameraCharacteristics.LENS_FACING)) {
                CameraCharacteristics.LENS_FACING_BACK -> "Rear"
                CameraCharacteristics.LENS_FACING_FRONT -> "Front"
                CameraCharacteristics.LENS_FACING_EXTERNAL -> "External"
                else -> "Unknown"
            }
            val px = ch.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE)
            val level = when (ch.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)) {
                CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY -> "Legacy"
                CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED -> "Limited"
                CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_FULL -> "Full"
                CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_3 -> "Level 3"
                4 -> "External"
                else -> "Unknown"
            }
            CameraInfo(
                id = id,
                facing = facing,
                megapixels = px?.let { Reading.Measured(it.width * it.height / 1_000_000f) } ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
                resolution = px?.let { Reading.Measured("${it.width} × ${it.height}") } ?: Reading.Unavailable(UnavailableReason.NOT_AVAILABLE),
                hasFlash = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true,
                focalLengthsMm = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.toList().orEmpty(),
                apertures = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_APERTURES)?.toList().orEmpty(),
                hardwareLevel = level,
            )
        })
    } catch (e: Exception) {
        Reading.Unavailable(UnavailableReason.NOT_AVAILABLE)
    }

    fun sensors(): List<SensorEntry> {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        return sm.getSensorList(Sensor.TYPE_ALL).map {
            SensorEntry(it.name, sensorTypeName(it), it.vendor, it.maximumRange, it.resolution, it.power)
        }
    }

    private fun sensorTypeName(s: Sensor): String = when (s.type) {
        Sensor.TYPE_ACCELEROMETER -> "Accelerometer"
        Sensor.TYPE_GYROSCOPE -> "Gyroscope"
        Sensor.TYPE_MAGNETIC_FIELD -> "Magnetometer"
        Sensor.TYPE_PROXIMITY -> "Proximity"
        Sensor.TYPE_LIGHT -> "Light"
        Sensor.TYPE_PRESSURE -> "Barometer"
        Sensor.TYPE_GRAVITY -> "Gravity"
        Sensor.TYPE_LINEAR_ACCELERATION -> "Linear acceleration"
        Sensor.TYPE_ROTATION_VECTOR -> "Rotation vector"
        Sensor.TYPE_STEP_COUNTER -> "Step counter"
        Sensor.TYPE_STEP_DETECTOR -> "Step detector"
        Sensor.TYPE_AMBIENT_TEMPERATURE -> "Ambient temperature"
        Sensor.TYPE_RELATIVE_HUMIDITY -> "Humidity"
        Sensor.TYPE_HEART_RATE -> "Heart rate"
        Sensor.TYPE_SIGNIFICANT_MOTION -> "Significant motion"
        Sensor.TYPE_GAME_ROTATION_VECTOR -> "Game rotation vector"
        Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR -> "Geomagnetic rotation"
        else -> s.stringType.substringAfterLast('.').replace('_', ' ').replaceFirstChar { it.titlecase(Locale.US) }
    }

    // ------------------------------------------------------------------ full report

    suspend fun report(): List<InfoSection> = withContext(Dispatchers.Default) {
        val mem = system.memory()
        val storage = system.storage()
        val cpu = system.cpu()
        val disp = display()
        val bat = battery.current()
        val net = network.current()

        fun <T> Reading<T>.txt(f: (T) -> String = { it.toString() }) = display(f)

        val sections = mutableListOf<InfoSection>()
        sections += InfoSection("Device", listOf(
            "Device name" to deviceName(),
            "Manufacturer" to Build.MANUFACTURER,
            "Brand" to Build.BRAND,
            "Model" to Build.MODEL,
            "Device" to Build.DEVICE,
            "Product" to Build.PRODUCT,
            "Board" to Build.BOARD,
            "Hardware" to Build.HARDWARE,
        ))
        sections += InfoSection("Software", listOf(
            "Android version" to Build.VERSION.RELEASE,
            "API level" to Build.VERSION.SDK_INT.toString(),
            "Build number" to Build.DISPLAY,
            "Security patch" to securityPatch().txt(),
            "Kernel version" to system.kernelVersion().txt(),
            "Bootloader" to Build.BOOTLOADER,
            "Build fingerprint" to Build.FINGERPRINT,
            "Java VM" to (System.getProperty("java.vm.version") ?: "—"),
            "Uptime" to Formatters.duration(system.uptimeMillis()),
        ))
        sections += InfoSection("Processor", buildList {
            add("Processor" to system.processorName().txt())
            add("CPU architecture" to (System.getProperty("os.arch") ?: "—"))
            add("Supported ABIs" to Build.SUPPORTED_ABIS.joinToString(", "))
            add("Cores" to cpu.coreCount.toString())
            val maxes = cpu.cores.mapNotNull { it.maxKhz }.distinct().sortedDescending()
            add("Max frequencies" to if (maxes.isEmpty()) UnavailableReason.RESTRICTED.label else maxes.joinToString(", ") { Formatters.mhz(it) })
        })
        sections += InfoSection("Memory & Storage", listOf(
            "Total RAM" to Formatters.bytes(mem.totalBytes),
            "Available RAM" to Formatters.bytes(mem.availableBytes),
            "Low-RAM device" to if (system.isLowRamDevice()) "Yes" else "No",
            "Total internal storage" to Formatters.bytes(storage.totalBytes),
            "Available storage" to Formatters.bytes(storage.freeBytes),
        ))
        sections += InfoSection("Display", listOf(
            "Resolution" to "${disp.widthPx} × ${disp.heightPx} px",
            "Density" to "${disp.densityDpi} dpi (${disp.densityBucket})",
            "Size" to disp.diagonalInches.txt { String.format(Locale.US, "%.1f in", it) },
            "Refresh rate" to Formatters.hertz(disp.refreshRate),
            "Supported refresh rates" to disp.supportedRefreshRates.joinToString(", ") { Formatters.hertz(it) },
            "HDR" to disp.hdrTypes.ifEmpty { listOf("Not supported") }.joinToString(", "),
        ))
        if (bat != null) {
            sections += InfoSection("Battery", listOf(
                "Level" to "${bat.levelPercent}%",
                "Status" to bat.chargeState.label,
                "Power source" to bat.source.label,
                "Health" to bat.health.label,
                "Technology" to bat.technology.txt(),
                "Voltage" to bat.voltageMv.txt { Formatters.volts(it) },
                "Temperature" to bat.temperatureC.txt { Formatters.celsius(it) },
                "Cycle count" to bat.cycleCount.txt(),
                "Capacity" to bat.capacityEstimateMah.txt { "$it mAh" },
            ))
        }
        sections += InfoSection("Cameras", when (val cams = cameras()) {
            is Reading.Measured -> cams.value.map { c ->
                "${c.facing} camera ${c.id}" to buildString {
                    append(c.megapixels.txt { String.format(Locale.US, "%.1f MP", it) })
                    if (c.hasFlash) append(", flash")
                    c.apertures.firstOrNull()?.let { append(", f/$it") }
                }
            }.ifEmpty { listOf("Cameras" to "None found") }
            else -> listOf("Cameras" to cams.txt())
        })
        sections += InfoSection("Sensors", sensors().map { it.type to it.name }.distinctBy { it.first }.ifEmpty { listOf("Sensors" to "None found") })
        sections += InfoSection("Network", buildList {
            add("Connection" to net.type.label)
            add("Internet validated" to if (net.validated) "Yes" else "No")
            add("Metered" to if (net.metered) "Yes" else "No")
            net.wifi?.let { w ->
                add("Wi-Fi SSID" to w.ssid.txt())
                add("Signal" to w.rssiDbm.txt { "$it dBm" })
                add("Link speed" to w.linkSpeedMbps.txt { "$it Mbps" })
                add("Frequency" to w.frequencyMhz.txt { "$it MHz" })
                add("Standard" to w.standard.txt())
            }
        })
        sections
    }

    fun reportAsText(sections: List<InfoSection>): String = buildString {
        appendLine("Devicepilot — Device Report")
        appendLine("Generated: ${Formatters.dateTime(System.currentTimeMillis())}")
        appendLine()
        sections.forEach { s ->
            appendLine("== ${s.title} ==")
            s.rows.forEach { (k, v) -> appendLine("$k: $v") }
            appendLine()
        }
        appendLine("Values marked (est.) are estimates. Values shown as Not Available / Restricted are not exposed by this device.")
    }
}
