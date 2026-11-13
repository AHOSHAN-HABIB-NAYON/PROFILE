package com.webtecit.filepilot.core.storage

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.webtecit.filepilot.core.common.IoDispatcher
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher

/** Routes every id to its backend and turns ids into content:// URIs other apps can open. */
@Singleton
class FileSystems @Inject constructor(
    @ApplicationContext private val context: Context,
    @IoDispatcher io: CoroutineDispatcher,
) : FileSystemResolver {

    val local = LocalFileSystem(io, useNio = Build.VERSION.SDK_INT >= 26)
    val saf = SafFileSystem(context, io)

    override fun of(id: String): FileSystem = when {
        local.handles(id) -> local
        saf.handles(id) -> saf
        else -> throw FsException(FsError.NOT_SUPPORTED, "This location isn't supported.")
    }

    /** A URI with a per-file grant, for sharing and "Open with". */
    fun contentUri(id: String): Uri =
        if (saf.handles(id)) SafFileSystem.uriOf(id)
        else FileProvider.getUriForFile(context, "${context.packageName}.files", File(id))
}

@Module
@InstallIn(SingletonComponent::class)
abstract class FileSystemModule {
    @Binds
    abstract fun bindResolver(impl: FileSystems): FileSystemResolver
}
