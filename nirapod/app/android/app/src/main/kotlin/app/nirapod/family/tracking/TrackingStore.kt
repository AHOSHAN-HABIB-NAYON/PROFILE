package app.nirapod.family.tracking

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Configuration (app-private SharedPreferences; app backups are disabled) and the offline point queue
 * (app-private SQLite). Only child devices store anything here.
 */
class TrackingStore(context: Context) {
    private val prefs = context.getSharedPreferences("nirapod_tracking", Context.MODE_PRIVATE)
    private val db = QueueDb(context)

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(v) = prefs.edit().putBoolean("enabled", v).apply()
    var apiBase: String
        get() = prefs.getString("api_base", "") ?: ""
        set(v) = prefs.edit().putString("api_base", v).apply()
    var uploadKey: String
        get() = prefs.getString("upload_key", "") ?: ""
        set(v) = prefs.edit().putString("upload_key", v).apply()
    var deviceId: String
        get() = prefs.getString("device_id", "") ?: ""
        set(v) = prefs.edit().putString("device_id", v).apply()
    /** Safe-walk trip mode until this time (epoch ms); 0 = off. */
    var tripUntil: Long
        get() = prefs.getLong("trip_until", 0L)
        set(v) = prefs.edit().putLong("trip_until", v).apply()

    /** Family places that apply to this child, JSON array of {id, lat, lng, radius}. */
    var geofences: String
        get() = prefs.getString("geofences", "[]") ?: "[]"
        set(v) = prefs.edit().putString("geofences", v).apply()
    /** Short high-accuracy burst after a geofence transition, until this time (epoch ms). */
    var burstUntil: Long
        get() = prefs.getLong("burst_until", 0L)
        set(v) = prefs.edit().putLong("burst_until", v).apply()

    /** Localized texts from the app (the selected language). */
    fun text(key: String, fallback: String): String = prefs.getString("t_$key", null) ?: fallback
    fun setTexts(map: Map<String, String>) {
        val e = prefs.edit()
        for ((k, v) in map) e.putString("t_$k", v)
        e.apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
        db.writableDatabase.delete(QueueDb.TABLE, null, null)
    }

    fun enqueue(point: JSONObject) {
        val v = ContentValues()
        v.put("json", point.toString())
        db.writableDatabase.insert(QueueDb.TABLE, null, v)
        // Keep at most 2000 points (about 2 days of movement) if the phone stays offline.
        db.writableDatabase.execSQL(
            "DELETE FROM ${QueueDb.TABLE} WHERE id NOT IN (SELECT id FROM ${QueueDb.TABLE} ORDER BY id DESC LIMIT 2000)"
        )
    }

    /** Oldest points first, at most [limit]. Returns ids and the JSON array. */
    fun peek(limit: Int): Pair<List<Long>, JSONArray> {
        val ids = ArrayList<Long>()
        val arr = JSONArray()
        db.readableDatabase.rawQuery(
            "SELECT id, json FROM ${QueueDb.TABLE} ORDER BY id ASC LIMIT $limit", null
        ).use { c ->
            while (c.moveToNext()) {
                ids.add(c.getLong(0))
                arr.put(JSONObject(c.getString(1)))
            }
        }
        return Pair(ids, arr)
    }

    fun remove(ids: List<Long>) {
        if (ids.isEmpty()) return
        db.writableDatabase.execSQL("DELETE FROM ${QueueDb.TABLE} WHERE id IN (${ids.joinToString(",")})")
    }

    fun size(): Long = android.database.DatabaseUtils.queryNumEntries(db.readableDatabase, QueueDb.TABLE)

    private class QueueDb(context: Context) : SQLiteOpenHelper(context, "nirapod_tracking.db", null, 1) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE $TABLE (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

        companion object {
            const val TABLE = "points"
        }
    }
}
