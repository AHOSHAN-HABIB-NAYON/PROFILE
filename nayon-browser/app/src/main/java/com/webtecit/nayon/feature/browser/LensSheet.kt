package com.webtecit.nayon.feature.browser

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.SettingsRow
import com.webtecit.nayon.core.designsystem.theme.Spacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LensSheet(onDismiss: () -> Unit, onCamera: () -> Unit, onGallery: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = Spacing.lg)) {
            Text(stringResource(R.string.lens_title), style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.md))
            SettingsRow(stringResource(R.string.lens_camera), onCamera, icon = Icons.Outlined.PhotoCamera, showChevron = false)
            SettingsRow(stringResource(R.string.lens_gallery), onGallery, icon = Icons.Outlined.Image, showChevron = false)
        }
    }
}
