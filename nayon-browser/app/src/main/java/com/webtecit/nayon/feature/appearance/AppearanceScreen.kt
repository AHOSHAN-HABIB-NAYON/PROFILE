package com.webtecit.nayon.feature.appearance

import android.text.format.DateFormat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Brightness4
import androidx.compose.material.icons.outlined.Contrast
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.WbTwilight
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Tonality
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webtecit.nayon.NayonViewModelFactory
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.GroupDivider
import com.webtecit.nayon.core.designsystem.component.RadioRow
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.component.SectionHeader
import com.webtecit.nayon.core.designsystem.component.SettingsGroup
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.component.SettingsSwitchRow
import com.webtecit.nayon.core.designsystem.component.ThemeCard
import com.webtecit.nayon.core.designsystem.theme.AppearanceSettings
import com.webtecit.nayon.core.designsystem.theme.Brightness
import com.webtecit.nayon.core.designsystem.theme.Layout
import com.webtecit.nayon.core.designsystem.theme.LocalBrightness
import com.webtecit.nayon.core.designsystem.theme.NayonTheme
import com.webtecit.nayon.core.designsystem.theme.Spacing
import com.webtecit.nayon.core.designsystem.theme.ThemeFamily
import com.webtecit.nayon.core.designsystem.theme.ThemeMode
import com.webtecit.nayon.core.designsystem.theme.availableThemeFamilies
import com.webtecit.nayon.core.designsystem.theme.colorSchemeFor
import java.util.Calendar

@Composable
fun AppearanceRoute(
    onBack: () -> Unit,
    viewModel: AppearanceViewModel = viewModel(factory = NayonViewModelFactory.Factory),
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    AppearanceScreen(
        settings = settings,
        families = availableThemeFamilies(),
        onBack = onBack,
        onModeSelected = { viewModel.setMode(it) },
        onFamilySelected = { viewModel.setFamily(it) },
        onDarkStartChanged = { viewModel.setDarkStart(it) },
        onDarkEndChanged = { viewModel.setDarkEnd(it) },
        onScheduleAmoledChanged = { viewModel.setScheduleUsesAmoled(it) },
    )
}

private enum class EditingTime { START, END }

@Composable
fun AppearanceScreen(
    settings: AppearanceSettings,
    families: List<ThemeFamily>,
    onBack: () -> Unit,
    onModeSelected: (ThemeMode) -> Unit,
    onFamilySelected: (ThemeFamily) -> Unit,
    onDarkStartChanged: (Int) -> Unit,
    onDarkEndChanged: (Int) -> Unit,
    onScheduleAmoledChanged: (Boolean) -> Unit,
) {
    var editing by rememberSaveable { mutableStateOf<EditingTime?>(null) }
    val brightness = LocalBrightness.current
    val context = LocalContext.current

    ScreenScaffold(title = stringResource(R.string.appearance_title), onBack = onBack) {
        item { SectionHeader(stringResource(R.string.appearance_mode)) }
        item {
            SettingsGroup(Modifier.selectableGroup()) {
                ThemeMode.entries.forEachIndexed { index, mode ->
                    if (index > 0) GroupDivider()
                    RadioRow(
                        title = stringResource(mode.nameRes()),
                        subtitle = stringResource(mode.descriptionRes()),
                        icon = mode.icon(),
                        selected = settings.mode == mode,
                        onSelect = { onModeSelected(mode) },
                    )
                }
            }
        }

        if (settings.mode == ThemeMode.SCHEDULED) {
            item { SectionHeader(stringResource(R.string.appearance_schedule)) }
            item {
                SettingsGroup {
                    SettingsRow(
                        title = stringResource(R.string.appearance_dark_from),
                        subtitle = formatMinute(context, settings.darkStartMinute),
                        icon = Icons.Outlined.Bedtime,
                        onClick = { editing = EditingTime.START },
                    )
                    GroupDivider()
                    SettingsRow(
                        title = stringResource(R.string.appearance_dark_until),
                        subtitle = formatMinute(context, settings.darkEndMinute),
                        icon = Icons.Outlined.WbTwilight,
                        onClick = { editing = EditingTime.END },
                    )
                    GroupDivider()
                    SettingsSwitchRow(
                        title = stringResource(R.string.appearance_schedule_amoled),
                        subtitle = stringResource(R.string.appearance_schedule_amoled_desc),
                        icon = Icons.Outlined.Contrast,
                        checked = settings.scheduleUsesAmoled,
                        onCheckedChange = onScheduleAmoledChanged,
                    )
                }
            }
        }

        item { SectionHeader(stringResource(R.string.appearance_color_theme)) }
        item {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val columns = (maxWidth / Layout.themeCardMinWidth).toInt().coerceIn(2, 4)
                Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    families.chunked(columns).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                            row.forEach { family ->
                                ThemeCard(
                                    name = stringResource(family.nameRes()),
                                    description = stringResource(family.descriptionRes()),
                                    preview = colorSchemeFor(family, brightness, context),
                                    selected = settings.family == family,
                                    onClick = { onFamilySelected(family) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }

    editing?.let { which ->
        val initial = if (which == EditingTime.START) settings.darkStartMinute else settings.darkEndMinute
        TimePickerDialog(
            initialMinute = initial,
            onDismiss = { editing = null },
            onConfirm = { minute ->
                if (which == EditingTime.START) onDarkStartChanged(minute) else onDarkEndChanged(minute)
                editing = null
            },
        )
    }
}

private fun ThemeMode.icon(): ImageVector = when (this) {
    ThemeMode.SYSTEM -> Icons.Outlined.Brightness4
    ThemeMode.LIGHT -> Icons.Outlined.LightMode
    ThemeMode.DARK -> Icons.Outlined.DarkMode
    ThemeMode.AMOLED -> Icons.Outlined.Tonality
    ThemeMode.SCHEDULED -> Icons.Outlined.Schedule
}

private fun formatMinute(context: android.content.Context, minuteOfDay: Int): String {
    val cal = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, minuteOfDay / 60)
        set(Calendar.MINUTE, minuteOfDay % 60)
    }
    return DateFormat.getTimeFormat(context).format(cal.time)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimePickerDialog(initialMinute: Int, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    val context = LocalContext.current
    val state = rememberTimePickerState(
        initialHour = initialMinute / 60,
        initialMinute = initialMinute % 60,
        is24Hour = remember { DateFormat.is24HourFormat(context) },
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.appearance_pick_time)) },
        text = { TimePicker(state = state) },
        confirmButton = {
            TextButton(onClick = { onConfirm(state.hour * 60 + state.minute) }) { Text(stringResource(R.string.action_save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

@Preview(name = "Light", widthDp = 360, heightDp = 900)
@Composable
private fun AppearancePreviewLight() {
    NayonTheme(ThemeFamily.AURORA, Brightness.LIGHT) {
        AppearanceScreen(AppearanceSettings(mode = ThemeMode.SCHEDULED), ThemeFamily.entries.dropLast(1),
            {}, {}, {}, {}, {}, {})
    }
}

@Preview(name = "AMOLED", widthDp = 360, heightDp = 900)
@Composable
private fun AppearancePreviewAmoled() {
    NayonTheme(ThemeFamily.OBSIDIAN, Brightness.AMOLED) {
        AppearanceScreen(AppearanceSettings(family = ThemeFamily.OBSIDIAN, mode = ThemeMode.AMOLED),
            ThemeFamily.entries.dropLast(1), {}, {}, {}, {}, {}, {})
    }
}

