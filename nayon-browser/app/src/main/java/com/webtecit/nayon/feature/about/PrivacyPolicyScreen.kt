package com.webtecit.nayon.feature.about

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.webtecit.nayon.R
import com.webtecit.nayon.core.designsystem.component.ScreenScaffold
import com.webtecit.nayon.core.designsystem.theme.Spacing

private val sections = listOf(
    R.string.privacy_section_summary to R.string.privacy_summary,
    R.string.privacy_section_current to R.string.privacy_current,
    R.string.privacy_section_not_collected to R.string.privacy_not_collected,
    R.string.privacy_section_deletion to R.string.privacy_deletion,
    R.string.privacy_section_changes to R.string.privacy_changes,
)

@Composable
fun PrivacyPolicyScreen(onBack: () -> Unit) {
    ScreenScaffold(title = stringResource(R.string.privacy_title), onBack = onBack) {
        item {
            Card(colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
            )) {
                Text(stringResource(R.string.privacy_draft_notice), style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(Spacing.lg))
            }
        }
        sections.forEach { (title, body) -> item { PolicySection(title, body) } }
    }
}

@Composable
private fun PolicySection(@StringRes title: Int, @StringRes body: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs), modifier = Modifier.padding(top = Spacing.sm)) {
        Text(stringResource(title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
        Text(stringResource(body), style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
