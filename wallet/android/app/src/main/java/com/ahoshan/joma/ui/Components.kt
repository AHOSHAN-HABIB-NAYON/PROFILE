package com.ahoshan.joma.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ahoshan.joma.data.Transaction
import com.ahoshan.joma.ui.theme.Brand
import com.ahoshan.joma.ui.theme.MoneyIn
import com.ahoshan.joma.ui.theme.MoneyInSoft
import com.ahoshan.joma.ui.theme.MoneyOut
import com.ahoshan.joma.ui.theme.MoneyOutSoft
import com.ahoshan.joma.ui.theme.Send
import com.ahoshan.joma.ui.theme.SendSoft

/** The app's wallet logo on a green rounded square. */
@Composable
fun WalletMark(size: Dp) {
    Box(
        Modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.28f))
            .background(Brand),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(size * 0.62f)) {
            val w = this.size.width
            val h = this.size.height
            drawRoundRect(Color.White.copy(alpha = 0.3f), Offset(0f, h * 0.24f), Size(w, h * 0.7f), CornerRadius(w * 0.16f))
            drawRoundRect(Color.White, Offset(0f, h * 0.1f), Size(w * 0.86f, h * 0.7f), CornerRadius(w * 0.16f))
            drawCircle(Brand, radius = w * 0.1f, center = Offset(w * 0.64f, h * 0.45f))
        }
    }
}

@Composable
fun Avatar(name: String, size: Dp = 40.dp) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.take(1),
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleMedium,
        )
    }
}

private data class TxLook(val icon: ImageVector, val tint: Color, val background: Color, val title: String, val subtitle: String)

private fun look(tx: Transaction): TxLook {
    val who = tx.counterpartyName ?: "মুছে ফেলা অ্যাকাউন্ট"
    return when (tx.type) {
        "deposit" -> TxLook(Icons.Filled.Add, MoneyIn, MoneyInSoft, "টাকা যোগ", methodNames[tx.method].orEmpty())
        "withdraw" -> TxLook(Icons.Filled.KeyboardArrowDown, MoneyOut, MoneyOutSoft, "টাকা তোলা", methodNames[tx.method].orEmpty())
        "transfer_in" -> TxLook(Icons.AutoMirrored.Filled.ArrowBack, MoneyIn, MoneyInSoft, "$who পাঠিয়েছেন", tx.note.orEmpty())
        else -> TxLook(Icons.AutoMirrored.Filled.ArrowForward, Send, SendSoft, "$who-কে পাঠানো", tx.note.orEmpty())
    }
}

@Composable
fun TransactionRow(tx: Transaction, modifier: Modifier = Modifier) {
    val l = look(tx)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(l.background),
            contentAlignment = Alignment.Center,
        ) {
            Icon(l.icon, contentDescription = null, tint = l.tint)
        }
        Column(Modifier.weight(1f)) {
            Text(l.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(l.subtitle, shortDate(tx.createdAt)).filter { it.isNotBlank() }.joinToString(" • "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                (if (tx.incoming) "+" else "−") + "৳" + taka(tx.amount),
                fontWeight = FontWeight.Bold,
                color = if (tx.incoming) MoneyIn else MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.End,
            )
            Text(
                "ব্যালেন্স ৳" + taka(tx.balanceAfter),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
