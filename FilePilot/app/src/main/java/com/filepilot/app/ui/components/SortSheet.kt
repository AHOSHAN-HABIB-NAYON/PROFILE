package com.filepilot.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.filepilot.app.core.model.SortField
import com.filepilot.app.core.model.SortOrder
import com.filepilot.app.core.model.ViewMode

/** Sort field, direction, layout and hidden-file toggle in one compact sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SortSheet(
    sort: SortOrder,
    viewMode: ViewMode,
    showHidden: Boolean?,
    onSort: (SortOrder) -> Unit,
    onViewMode: (ViewMode) -> Unit,
    onShowHidden: ((Boolean) -> Unit)?,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
            Text("View", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
                SegmentedButton(
                    selected = viewMode == ViewMode.LIST,
                    onClick = { onViewMode(ViewMode.LIST) },
                    shape = SegmentedButtonDefaults.itemShape(0, 2),
                    icon = { Icon(Icons.AutoMirrored.Rounded.List, null) },
                ) { Text("List") }
                SegmentedButton(
                    selected = viewMode == ViewMode.GRID,
                    onClick = { onViewMode(ViewMode.GRID) },
                    shape = SegmentedButtonDefaults.itemShape(1, 2),
                    icon = { Icon(Icons.Rounded.GridView, null) },
                ) { Text("Grid") }
            }
            Text("Sort by", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 4.dp))
            SortField.entries.forEach { field ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .selectable(selected = sort.field == field, role = Role.RadioButton) { onSort(sort.copy(field = field)) }
                        .padding(horizontal = 12.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = sort.field == field, onClick = null, modifier = Modifier.padding(12.dp))
                    Text(field.label, style = MaterialTheme.typography.bodyLarge)
                }
            }
            Row(Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
                FilterChip(
                    selected = sort.ascending,
                    onClick = { onSort(sort.copy(ascending = true)) },
                    label = { Text(ascendingLabel(sort.field)) },
                    leadingIcon = { Icon(Icons.Rounded.ArrowUpward, null) },
                )
                Spacer(Modifier.width(8.dp))
                FilterChip(
                    selected = !sort.ascending,
                    onClick = { onSort(sort.copy(ascending = false)) },
                    label = { Text(descendingLabel(sort.field)) },
                    leadingIcon = { Icon(Icons.Rounded.ArrowDownward, null) },
                )
            }
            if (showHidden != null && onShowHidden != null) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onShowHidden(!showHidden) }
                        .padding(horizontal = 24.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Show hidden files", style = MaterialTheme.typography.bodyLarge)
                        Text("Files and folders starting with a dot", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(checked = showHidden, onCheckedChange = null)
                }
            }
        }
    }
}

fun ascendingLabel(field: SortField) = when (field) {
    SortField.NAME -> "A to Z"
    SortField.DATE -> "Oldest first"
    SortField.SIZE -> "Smallest first"
    SortField.TYPE -> "A to Z"
}

fun descendingLabel(field: SortField) = when (field) {
    SortField.NAME -> "Z to A"
    SortField.DATE -> "Newest first"
    SortField.SIZE -> "Largest first"
    SortField.TYPE -> "Z to A"
}
