package com.webtecit.devicepilot.ui.onboarding

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import kotlinx.coroutines.launch

private data class Page(val image: Int, val title: Int, val text: Int)

private val pages = listOf(
    Page(R.drawable.ill_dashboard, R.string.onb_1_title, R.string.onb_1_text),
    Page(R.drawable.ill_apps, R.string.onb_2_title, R.string.onb_2_text),
    Page(R.drawable.ill_firewall, R.string.onb_3_title, R.string.onb_3_text),
    Page(R.drawable.ill_temperature, R.string.onb_4_title, R.string.onb_4_text),
    Page(R.drawable.ill_permission, R.string.onb_5_title, R.string.onb_5_text),
)

@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    val pager = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val last = pager.currentPage == pages.lastIndex
    var agreed by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    var reading by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<Int?>(null) }
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).safeDrawingPadding().padding(20.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
            // Skip jumps to the last page, where the Privacy Policy and Disclaimer must be accepted.
            if (!last) TextButton(onClick = { scope.launch { pager.animateScrollToPage(pages.lastIndex) } }) {
                Text(stringResource(R.string.action_skip))
            }
        }
        HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth()) { i ->
            val p = pages[i]
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Image(painterResource(p.image), null, Modifier.fillMaxWidth().height(200.dp))
                Spacer(Modifier.height(24.dp))
                Text(stringResource(p.title), style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                Spacer(Modifier.height(10.dp))
                Text(stringResource(p.text), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 8.dp))
            }
        }
        if (last) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .clickable { agreed = !agreed }.testTag("agree").padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                androidx.compose.material3.Checkbox(agreed, { agreed = it })
                Text(stringResource(R.string.onb_agree), style = MaterialTheme.typography.bodySmall)
            }
            Row {
                TextButton(onClick = { reading = 0 }) { Text(stringResource(R.string.title_privacy)) }
                TextButton(onClick = { reading = 1 }) { Text(stringResource(R.string.title_disclaimer)) }
            }
            Spacer(Modifier.height(8.dp))
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                pages.indices.forEach { i ->
                    val active = i == pager.currentPage
                    val w by animateDpAsState(if (active) 22.dp else 8.dp, label = "dot")
                    val color by animateColorAsState(
                        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, label = "dotc")
                    Box(Modifier.height(8.dp).width(w).clip(RoundedCornerShape(50)).background(color))
                }
            }
            Button(
                enabled = !last || agreed,
                onClick = { if (last) onFinish() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
            ) {
                Text(stringResource(if (last) R.string.action_get_started else R.string.action_next))
            }
        }
    }
    reading?.let { which ->
        val sections = if (which == 0) listOf(
            R.string.privacy_s1_title to R.string.privacy_s1_text, R.string.privacy_s2_title to R.string.privacy_s2_text,
            R.string.privacy_s3_title to R.string.privacy_s3_text, R.string.privacy_s4_title to R.string.privacy_s4_text,
            R.string.privacy_s5_title to R.string.privacy_s5_text, R.string.privacy_s6_title to R.string.privacy_s6_text,
            R.string.privacy_s7_title to R.string.privacy_s7_text, R.string.privacy_s8_title to R.string.privacy_s8_text,
        ) else listOf(
            R.string.disc_s1_title to R.string.disc_s1_text, R.string.disc_s2_title to R.string.disc_s2_text,
            R.string.disc_s3_title to R.string.disc_s3_text, R.string.disc_s4_title to R.string.disc_s4_text,
            R.string.disc_s5_title to R.string.disc_s5_text, R.string.disc_s6_title to R.string.disc_s6_text,
        )
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { reading = null },
            title = { Text(stringResource(if (which == 0) R.string.title_privacy else R.string.title_disclaimer)) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    sections.forEach { (t, b) ->
                        Text(stringResource(t), style = MaterialTheme.typography.titleSmall)
                        Text(stringResource(b), style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(8.dp))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { reading = null }) { Text(stringResource(R.string.action_close)) } },
        )
    }
}
