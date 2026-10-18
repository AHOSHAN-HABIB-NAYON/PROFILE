package com.appfix.sample

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private var taps = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val counter = findViewById<TextView>(R.id.counter)
        findViewById<Button>(R.id.primary_button).setOnClickListener {
            taps++
            counter.text = getString(R.string.tap_count, taps)
        }
    }
}
