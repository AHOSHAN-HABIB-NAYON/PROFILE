package com.webtecit.devicepilot.feature.tools

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeviceThermostat
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.ScreenshotMonitor
import androidx.compose.material.icons.filled.SdStorage
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.webtecit.devicepilot.core.designsystem.Brand
import com.webtecit.devicepilot.core.designsystem.DpCard
import com.webtecit.devicepilot.core.designsystem.DpScaffold
import com.webtecit.devicepilot.core.designsystem.IconBadge
import com.webtecit.devicepilot.core.designsystem.NoteText
import com.webtecit.devicepilot.core.designsystem.Spacing
import com.webtecit.devicepilot.core.navigation.Routes

private data class ToolItem(val icon: ImageVector, val title: String, val subtitle: String, val route: String, val tint: @Composable () -> Color)

private val tools = listOf(
    ToolItem(Icons.Default.PhoneAndroid, "Phone Details", "Hardware & software", Routes.DEVICE_INFO) { Brand.Green },
    ToolItem(Icons.Default.QueryStats, "Performance", "Live monitor", Routes.PERFORMANCE) { Brand.Teal },
    ToolItem(Icons.Default.BatteryChargingFull, "Charging", "Battery & history", Routes.CHARGING) { Brand.Green },
    ToolItem(Icons.Default.Speed, "Speed Up", "Recommendations", Routes.SPEED_UP) { Brand.Amber },
    ToolItem(Icons.Default.RocketLaunch, "RAM Boost", "Memory status", Routes.RAM_BOOST) { Brand.Green },
    ToolItem(Icons.Default.DeviceThermostat, "Phone Cooling", "Temperature", Routes.COOLING) { Brand.Amber },
    ToolItem(Icons.Default.CleaningServices, "Smart Clean", "Junk files", Routes.JUNK) { Brand.Teal },
    ToolItem(Icons.Default.SdStorage, "Large Files", "Find big files", Routes.files("LARGE")) { Brand.Teal },
    ToolItem(Icons.Default.ContentCopy, "Duplicates", "Exact copies", Routes.DUPLICATES) { Brand.Teal },
    ToolItem(Icons.Default.TouchApp, "Hardware Tests", "Screen, sensors…", Routes.DIAGNOSTICS) { MaterialTheme.colorScheme.tertiary },
    ToolItem(Icons.Default.NetworkCheck, "Network", "Speed test & info", Routes.NETWORK) { MaterialTheme.colorScheme.tertiary },
    ToolItem(Icons.Default.Apps, "App Manager", "Installed apps", Routes.APPS) { Brand.Green },
    ToolItem(Icons.Default.ScreenshotMonitor, "Display", "Refresh rate & HDR", Routes.DISPLAY) { Brand.Teal },
    ToolItem(Icons.Default.Lightbulb, "Speed Tips", "Optimisation guide", Routes.TIPS) { Brand.Amber },
)

@Composable
fun ToolsScreen(navigate: (String) -> Unit) {
    DpScaffold("Tools", null) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Adaptive(150f.dpCompat()),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = padding.calculateTopPadding() + Spacing.sm, bottom = Spacing.xxl),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                NoteText("Every tool reads real data from your phone. Nothing is changed without your action.")
            }
            items(tools, key = { it.route }) { t ->
                DpCard(onClick = { navigate(t.route) }) {
                    IconBadge(t.icon, t.tint())
                    Spacer(Modifier.height(Spacing.sm))
                    Text(t.title, style = MaterialTheme.typography.titleSmall)
                    Text(t.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

private fun Float.dpCompat() = androidx.compose.ui.unit.Dp(this)
