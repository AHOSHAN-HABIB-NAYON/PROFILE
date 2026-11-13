package com.webtecit.filepilot.feature.toolkit

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.CallMerge
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.webtecit.filepilot.core.common.Formatters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Tool screens that work on picked files: the route says which one. */
enum class FileTool(val title: String) {
    IMAGE_TO_PDF("Image to PDF"),
    TEXT_TO_PDF("Text to PDF"),
    MERGE_PDF("Merge PDF"),
    SPLIT_PDF("Split & rotate PDF"),
    PDF_TO_IMAGES("PDF to images"),
    COMPRESS_IMAGE("Compress images"),
    RESIZE_IMAGE("Resize images"),
    CONVERT_IMAGE("Convert images"),
}

@Composable
fun FileToolScreen(tool: FileTool, onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ToolkitViewModel = hiltViewModel()) {
    when (tool) {
        FileTool.IMAGE_TO_PDF -> ImageToPdf(onBack, onOpenFolder, viewModel)
        FileTool.TEXT_TO_PDF -> TextToPdf(onBack, onOpenFolder, viewModel)
        FileTool.MERGE_PDF -> MergePdf(onBack, onOpenFolder, viewModel)
        FileTool.SPLIT_PDF -> SplitPdf(onBack, onOpenFolder, viewModel)
        FileTool.PDF_TO_IMAGES -> PdfToImages(onBack, onOpenFolder, viewModel)
        FileTool.COMPRESS_IMAGE, FileTool.RESIZE_IMAGE, FileTool.CONVERT_IMAGE -> ImageTool(tool, onBack, onOpenFolder, viewModel)
    }
}

// ----- Image to PDF ---------------------------------------------------------------------------

@Composable
private fun ImageToPdf(onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ToolkitViewModel) {
    val context = LocalContext.current
    val run by viewModel.run.collectAsStateWithLifecycle()
    val images = remember { mutableStateListOf<Uri>() }
    var a4 by remember { mutableStateOf(true) }
    var name by remember { mutableStateOf("Images") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris -> images.addAll(uris.filterNot { it in images }) }
    ToolScaffold(
        title = "Image to PDF", onBack = onBack, run = run,
        actionLabel = "Create PDF", actionIcon = Icons.Rounded.PictureAsPdf, actionEnabled = images.isNotEmpty() && name.isNotBlank(),
        onAction = {
            val list = images.toList()
            val fileName = name.trim()
            viewModel.start("Creating $fileName.pdf", "PDF created") { report ->
                val out = MediaTools.uniqueFile(ToolOutput.documents(), fileName, "pdf")
                try {
                    out.outputStream().use { stream ->
                        MediaTools.imagesToPdf(list.map { u -> { context.contentResolver.openInputStream(u) ?: error("An image can't be opened.") } }, stream, a4) { n ->
                            report(n.toFloat() / list.size, "Page $n of ${list.size}")
                        }
                    }
                } catch (e: Throwable) {
                    out.delete()
                    throw e
                }
                listOf(out)
            }
        },
        onOpenFolder = onOpenFolder,
    ) {
        if (images.isEmpty()) {
            PickArea("Choose images", "They become pages in this order", Icons.Rounded.AddPhotoAlternate) { picker.launch("image/*") }
        } else {
            Text("${images.size} images · use the arrows to change the order", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            images.chunked(3).forEachIndexed { row, chunk ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    chunk.forEachIndexed { c, uri ->
                        val index = row * 3 + c
                        Box(Modifier.weight(1f).aspectRatio(0.75f).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
                            AsyncImage(model = uri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(0.75f))
                            Text(
                                "${index + 1}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(6.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).padding(horizontal = 6.dp, vertical = 1.dp),
                                color = Color.Black,
                            )
                            Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)), horizontalArrangement = Arrangement.SpaceBetween) {
                                SmallIcon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, "Move earlier", index > 0) { images.add(index - 1, images.removeAt(index)) }
                                SmallIcon(Icons.Rounded.Close, "Remove", true) { images.removeAt(index) }
                                SmallIcon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, "Move later", index < images.lastIndex) { images.add(index + 1, images.removeAt(index)) }
                            }
                        }
                    }
                    repeat(3 - chunk.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            Surface(
                onClick = { picker.launch("image/*") }, shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)), color = Color.Transparent,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.AddPhotoAlternate, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Add more", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        OptionCard("Page size") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = a4, onClick = { a4 = true }, label = { Text("A4, fit image") })
                FilterChip(selected = !a4, onClick = { a4 = false }, label = { Text("Same as image") })
            }
        }
        NameField(name, "pdf") { name = it }
    }
}

@Composable
private fun SmallIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(34.dp)) {
        Icon(icon, label, tint = if (enabled) Color.White else Color.White.copy(alpha = 0.3f), modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun NameField(name: String, extension: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = name, onValueChange = onChange, singleLine = true,
        label = { Text("File name") }, suffix = { Text(".$extension") },
        supportingText = { Text("Saved in ${if (extension == "pdf") "Documents" else "Pictures"}/FilePilot") },
        modifier = Modifier.fillMaxWidth(),
    )
}

// ----- Text to PDF ----------------------------------------------------------------------------

@Composable
private fun TextToPdf(onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ToolkitViewModel) {
    val run by viewModel.run.collectAsStateWithLifecycle()
    var title by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var size by remember { mutableFloatStateOf(12f) }
    var name by remember { mutableStateOf("Document") }
    ToolScaffold(
        title = "Text to PDF", onBack = onBack, run = run,
        actionLabel = "Create PDF", actionIcon = Icons.Rounded.PictureAsPdf, actionEnabled = (text.isNotBlank() || title.isNotBlank()) && name.isNotBlank(),
        onAction = {
            val fileName = name.trim()
            val t = title
            val body = text
            val fs = size
            viewModel.start("Creating $fileName.pdf", "PDF created") { report ->
                report(null, "Laying out pages…")
                val out = MediaTools.uniqueFile(ToolOutput.documents(), fileName, "pdf")
                try {
                    out.outputStream().use { MediaTools.textToPdf(body, t, fs, it) }
                } catch (e: Throwable) {
                    out.delete()
                    throw e
                }
                listOf(out)
            }
        },
        onOpenFolder = onOpenFolder,
    ) {
        OutlinedTextField(title, { title = it }, label = { Text("Title (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            text, { text = it }, label = { Text("Text") },
            supportingText = { Text("${text.length} characters · ${if (text.isBlank()) 0 else text.trim().split(Regex("\\s+")).size} words") },
            modifier = Modifier.fillMaxWidth().heightIn(min = 220.dp),
        )
        OptionCard("Font size") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(10f, 12f, 14f, 16f, 18f).forEach { s ->
                    FilterChip(selected = size == s, onClick = { size = s }, label = { Text("${s.toInt()} pt") })
                }
            }
        }
        NameField(name, "pdf") { name = it }
    }
}

// ----- Merge PDF ------------------------------------------------------------------------------

@Composable
private fun MergePdf(onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ToolkitViewModel) {
    val context = LocalContext.current
    val run by viewModel.run.collectAsStateWithLifecycle()
    val pdfs = remember { mutableStateListOf<Uri>() }
    var name by remember { mutableStateOf("Merged") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> pdfs.addAll(uris.filterNot { it in pdfs }) }
    ToolScaffold(
        title = "Merge PDF", onBack = onBack, run = run,
        actionLabel = "Merge ${pdfs.size} PDFs", actionIcon = Icons.Rounded.CallMerge, actionEnabled = pdfs.size >= 2 && name.isNotBlank(),
        onAction = {
            val list = pdfs.toList()
            val fileName = name.trim()
            viewModel.start("Merging into $fileName.pdf", "PDF merged") { report ->
                val out = MediaTools.uniqueFile(ToolOutput.documents(), fileName, "pdf")
                val descriptors = list.map { context.contentResolver.openFileDescriptor(it, "r") ?: error("A PDF can't be opened.") }
                try {
                    out.outputStream().use { stream -> MediaTools.combinePdfs(descriptors, stream) { n -> report(null, "Page $n") } }
                } catch (e: Throwable) {
                    out.delete()
                    throw e
                } finally {
                    descriptors.forEach { runCatching { it.close() } }
                }
                listOf(out)
            }
        },
        onOpenFolder = onOpenFolder,
    ) {
        if (pdfs.isEmpty()) {
            PickArea("Choose PDFs", "Two or more, merged in order", Icons.Rounded.PictureAsPdf) { picker.launch(arrayOf("application/pdf")) }
        } else {
            OptionCard("Order") {
                pdfs.forEachIndexed { i, uri ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${i + 1}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.width(24.dp))
                        Text(displayName(context, uri), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        IconButton(onClick = { pdfs.add(i - 1, pdfs.removeAt(i)) }, enabled = i > 0) { Icon(Icons.Rounded.KeyboardArrowUp, "Move up") }
                        IconButton(onClick = { pdfs.add(i + 1, pdfs.removeAt(i)) }, enabled = i < pdfs.lastIndex) { Icon(Icons.Rounded.KeyboardArrowDown, "Move down") }
                        IconButton(onClick = { pdfs.removeAt(i) }) { Icon(Icons.Rounded.Close, "Remove") }
                    }
                }
                androidx.compose.material3.TextButton(onClick = { picker.launch(arrayOf("application/pdf")) }) { Text("Choose more PDFs") }
            }
            Text(
                "Pages are copied as high-quality images, so text in the merged PDF can't be selected. Your original files don't change.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        NameField(name, "pdf") { name = it }
    }
}

// ----- Split / rotate PDF ---------------------------------------------------------------------

@Composable
private fun SplitPdf(onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ToolkitViewModel) {
    val context = LocalContext.current
    val run by viewModel.run.collectAsStateWithLifecycle()
    var pdf by remember { mutableStateOf<Uri?>(null) }
    var pages by remember { mutableIntStateOf(0) }
    var range by remember { mutableStateOf("") }
    var rotate by remember { mutableIntStateOf(0) }
    var separate by remember { mutableStateOf(false) }
    var openError by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) pdf = uri }
    LaunchedEffect(pdf) {
        val uri = pdf ?: return@LaunchedEffect
        val result = withContext(Dispatchers.IO) {
            runCatching { context.contentResolver.openFileDescriptor(uri, "r")!!.use { MediaTools.pageCount(it) } }
        }
        pages = result.getOrDefault(0)
        openError = result.exceptionOrNull()?.message
        range = if (pages > 0) "1-$pages" else ""
    }
    val rangeError = remember(range, pages) { if (pages == 0) null else runCatching { MediaTools.parsePages(range, pages) }.exceptionOrNull()?.message }
    val base = pdf?.let { displayName(context, it).substringBeforeLast('.') } ?: "Pages"
    ToolScaffold(
        title = "Split & rotate PDF", onBack = onBack, run = run,
        actionLabel = if (separate) "Save pages as separate PDFs" else "Save as new PDF", actionIcon = Icons.Rounded.ContentCut,
        actionEnabled = pdf != null && pages > 0 && rangeError == null,
        onAction = {
            val uri = pdf ?: return@ToolScaffold
            val chosen = MediaTools.parsePages(range, pages)
            val turn = rotate
            val each = separate
            viewModel.start("Splitting $base.pdf", "PDF saved") { report ->
                val out = ArrayList<java.io.File>()
                val groups = if (each) chosen.map { listOf(it) } else listOf(chosen)
                groups.forEachIndexed { g, group ->
                    val file = MediaTools.uniqueFile(
                        ToolOutput.documents(),
                        if (each) "${base}_page_${group[0] + 1}" else "${base}_pages",
                        "pdf",
                    )
                    context.contentResolver.openFileDescriptor(uri, "r")!!.use { pfd ->
                        try {
                            file.outputStream().use { MediaTools.combinePdfs(listOf(pfd), it, pick = { _, _ -> group }, rotate = turn) }
                        } catch (e: Throwable) {
                            file.delete()
                            throw e
                        }
                    }
                    out += file
                    report((g + 1f) / groups.size, "${g + 1} of ${groups.size}")
                }
                out
            }
        },
        onOpenFolder = onOpenFolder,
    ) {
        if (pdf == null) {
            PickArea("Choose a PDF", "Pick pages, split them out or rotate them", Icons.Rounded.PictureAsPdf) { picker.launch(arrayOf("application/pdf")) }
        } else {
            OptionCard("PDF") {
                Text(displayName(context, pdf!!), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(openError ?: "$pages pages", color = if (openError != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                androidx.compose.material3.TextButton(onClick = { picker.launch(arrayOf("application/pdf")) }) { Text("Choose another") }
            }
            OptionCard("Pages") {
                OutlinedTextField(
                    range, { range = it }, singleLine = true, isError = rangeError != null,
                    label = { Text("Pages, e.g. 1-3, 5") }, supportingText = { Text(rangeError ?: "Leave 1-$pages for all pages") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !separate, onClick = { separate = false }, label = { Text("One PDF") })
                    FilterChip(selected = separate, onClick = { separate = true }, label = { Text("Each page separately") })
                }
            }
            OptionCard("Rotate pages") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(0, 90, 180, 270).forEach { r ->
                        FilterChip(selected = rotate == r, onClick = { rotate = r }, label = { Text(if (r == 0) "None" else "$r°") })
                    }
                }
            }
        }
    }
}

// ----- PDF to images --------------------------------------------------------------------------

@Composable
private fun PdfToImages(onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ToolkitViewModel) {
    val context = LocalContext.current
    val run by viewModel.run.collectAsStateWithLifecycle()
    var pdf by remember { mutableStateOf<Uri?>(null) }
    var pages by remember { mutableIntStateOf(0) }
    var format by remember { mutableStateOf(ImageFormat.JPG) }
    var dpi by remember { mutableIntStateOf(150) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) pdf = uri }
    LaunchedEffect(pdf) {
        val uri = pdf ?: return@LaunchedEffect
        pages = withContext(Dispatchers.IO) { runCatching { context.contentResolver.openFileDescriptor(uri, "r")!!.use { MediaTools.pageCount(it) } }.getOrDefault(0) }
    }
    val base = pdf?.let { displayName(context, it).substringBeforeLast('.') } ?: "PDF"
    ToolScaffold(
        title = "PDF to images", onBack = onBack, run = run,
        actionLabel = "Save $pages images", actionIcon = Icons.Rounded.PhotoLibrary, actionEnabled = pdf != null && pages > 0,
        onAction = {
            val uri = pdf ?: return@ToolScaffold
            val f = format
            val d = dpi
            viewModel.start("Saving pages of $base", "Images saved") { report ->
                context.contentResolver.openFileDescriptor(uri, "r")!!.use { pfd ->
                    MediaTools.pdfToImages(pfd, base, java.io.File(ToolOutput.pictures(), base.take(60)), f, d) { done, total ->
                        report(done.toFloat() / total, "Page $done of $total")
                    }
                }
            }
        },
        onOpenFolder = onOpenFolder,
    ) {
        if (pdf == null) {
            PickArea("Choose a PDF", "Every page becomes a picture", Icons.Rounded.PictureAsPdf) { picker.launch(arrayOf("application/pdf")) }
        } else {
            OptionCard("PDF") {
                Text(displayName(context, pdf!!), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (pages > 0) "$pages pages" else "This PDF can't be opened (it may be password-protected).", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OptionCard("Format") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(ImageFormat.JPG, ImageFormat.PNG).forEach { fmt -> FilterChip(selected = format == fmt, onClick = { format = fmt }, label = { Text(fmt.label) }) }
                }
            }
            OptionCard("Quality") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(100 to "Small", 150 to "Good", 220 to "High", 300 to "Print").forEach { (v, l) ->
                        FilterChip(selected = dpi == v, onClick = { dpi = v }, label = { Text(l) })
                    }
                }
            }
        }
    }
}

// ----- Image compress / resize / convert ------------------------------------------------------

@Composable
private fun ImageTool(tool: FileTool, onBack: () -> Unit, onOpenFolder: (String) -> Unit, viewModel: ToolkitViewModel) {
    val context = LocalContext.current
    val run by viewModel.run.collectAsStateWithLifecycle()
    val images = remember { mutableStateListOf<Uri>() }
    var quality by remember { mutableFloatStateOf(if (tool == FileTool.COMPRESS_IMAGE) 70f else 90f) }
    var maxSide by remember { mutableIntStateOf(if (tool == FileTool.RESIZE_IMAGE) 1920 else 0) }
    var format by remember { mutableStateOf(if (tool == FileTool.CONVERT_IMAGE) ImageFormat.PNG else ImageFormat.JPG) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris -> images.addAll(uris.filterNot { it in images }) }
    val before = remember(images.toList()) { images.sumOf { sizeOf(context, it) } }
    ToolScaffold(
        title = tool.title, onBack = onBack, run = run,
        actionLabel = "Save ${images.size} image${if (images.size == 1) "" else "s"}", actionIcon = Icons.Rounded.Save, actionEnabled = images.isNotEmpty(),
        onAction = {
            val list = images.toList()
            val q = quality.toInt()
            val side = maxSide
            val fmt = format
            viewModel.start("${tool.title}: ${list.size} images", "Images saved") { report ->
                val dir = ToolOutput.pictures()
                list.mapIndexed { i, uri ->
                    val base = displayName(context, uri).substringBeforeLast('.')
                    val suffix = when (tool) { FileTool.COMPRESS_IMAGE -> "_small"; FileTool.RESIZE_IMAGE -> "_${side}px"; else -> "" }
                    val out = MediaTools.uniqueFile(dir, base + suffix, fmt.extension)
                    try {
                        out.outputStream().use { stream ->
                            MediaTools.processImage({ context.contentResolver.openInputStream(uri) ?: error("An image can't be opened.") }, stream, fmt, q, side)
                        }
                    } catch (e: Throwable) {
                        out.delete()
                        throw e
                    }
                    report((i + 1f) / list.size, "${i + 1} of ${list.size}")
                    out
                }
            }
        },
        onOpenFolder = onOpenFolder,
    ) {
        if (images.isEmpty()) {
            PickArea("Choose images", "Your originals are kept", Icons.Rounded.AddPhotoAlternate) { picker.launch("image/*") }
        } else {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                images.forEach { uri ->
                    AsyncImage(model = uri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(72.dp).clip(RoundedCornerShape(12.dp)))
                }
            }
            Text("${images.size} images · ${Formatters.size(before)} now", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            androidx.compose.material3.TextButton(onClick = { picker.launch("image/*") }) { Text("Add more") }
        }
        if (tool == FileTool.CONVERT_IMAGE || tool == FileTool.COMPRESS_IMAGE) {
            OptionCard("Save as") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ImageFormat.entries.forEach { f -> FilterChip(selected = format == f, onClick = { format = f }, label = { Text(f.label) }) }
                }
                if (format == ImageFormat.PNG) Text("PNG keeps every detail, so files are bigger; quality doesn't apply.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (format != ImageFormat.PNG) {
            OptionCard("Quality: ${quality.toInt()}%") {
                Slider(value = quality, onValueChange = { quality = it }, valueRange = 30f..100f)
                Text("Lower quality makes smaller files. 70% looks the same for most photos.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (tool != FileTool.CONVERT_IMAGE) {
            OptionCard("Longest side") {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(0 to "Keep", 3840 to "3840 px", 1920 to "1920 px", 1280 to "1280 px", 800 to "800 px").forEach { (v, l) ->
                        FilterChip(selected = maxSide == v, onClick = { maxSide = v }, label = { Text(l) })
                    }
                }
            }
        }
        Text("Saved in Pictures/FilePilot", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
