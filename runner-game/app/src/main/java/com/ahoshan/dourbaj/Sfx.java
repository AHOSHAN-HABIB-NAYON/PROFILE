package com.ahoshan.dourbaj;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

import java.util.Random;

/** Small sound effects synthesised at start-up, so the game needs no audio files. */
final class Sfx {

    private static final int RATE = 22050;

    private AudioTrack jump;
    private AudioTrack doubleJump;
    private AudioTrack coin;
    private AudioTrack hit;
    private AudioTrack slide;

    boolean muted;

    Sfx() {
        try {
            jump = make(sweep(0.16f, 330f, 720f, 0.30f));
            doubleJump = make(sweep(0.18f, 520f, 1100f, 0.26f));
            coin = make(coinTone());
            hit = make(crash());
            slide = make(whoosh());
        } catch (Exception e) {
            // Sound is optional: if the device refuses an audio track, play silently.
            release();
        }
    }

    void jump() {
        play(jump);
    }

    void doubleJump() {
        play(doubleJump);
    }

    void coin() {
        play(coin);
    }

    void hit() {
        play(hit);
    }

    void slide() {
        play(slide);
    }

    void release() {
        AudioTrack[] all = {jump, doubleJump, coin, hit, slide};
        for (AudioTrack t : all) {
            if (t != null) {
                t.release();
            }
        }
        jump = doubleJump = coin = hit = slide = null;
    }

    private void play(AudioTrack track) {
        if (muted || track == null) {
            return;
        }
        try {
            track.stop();
            track.reloadStaticData();
            track.play();
        } catch (IllegalStateException ignored) {
            // A track in a bad state just stays quiet.
        }
    }

    private static AudioTrack make(short[] pcm) {
        AudioTrack track = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                .setBufferSizeInBytes(pcm.length * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build();
        track.write(pcm, 0, pcm.length);
        return track;
    }

    /** A rising tone with a soft attack and an exponential tail. */
    private static short[] sweep(float seconds, float fromHz, float toHz, float volume) {
        int n = (int) (seconds * RATE);
        short[] out = new short[n];
        double phase = 0;
        for (int i = 0; i < n; i++) {
            float t = i / (float) n;
            double hz = fromHz + (toHz - fromHz) * t;
            phase += 2 * Math.PI * hz / RATE;
            double tone = Math.sin(phase) + 0.25 * Math.sin(phase * 2);
            double env = Math.min(1, t * 20) * Math.exp(-t * 3.5);
            out[i] = (short) (tone * env * volume * Short.MAX_VALUE);
        }
        return out;
    }

    /** Two quick bell notes (B5 then E6), like a classic coin pickup. */
    private static short[] coinTone() {
        int first = (int) (0.07f * RATE);
        int n = (int) (0.30f * RATE);
        short[] out = new short[n];
        for (int i = 0; i < n; i++) {
            boolean second = i >= first;
            double hz = second ? 1318.5 : 987.8;
            int local = second ? i - first : i;
            double t = local / (double) RATE;
            double env = Math.min(1, local / 60.0) * Math.exp(-t * (second ? 11 : 4));
            double tone = Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(2 * Math.PI * hz * 2 * t);
            out[i] = (short) (tone * env * 0.22 * Short.MAX_VALUE);
        }
        return out;
    }

    /** Filtered noise with a falling thump underneath. */
    private static short[] crash() {
        int n = (int) (0.45f * RATE);
        short[] out = new short[n];
        Random random = new Random(7);
        double low = 0;
        double phase = 0;
        for (int i = 0; i < n; i++) {
            float t = i / (float) n;
            low += (random.nextDouble() * 2 - 1 - low) * 0.18;
            phase += 2 * Math.PI * (140 - 90 * t) / RATE;
            double env = Math.exp(-t * 6);
            double sample = low * 0.9 + Math.sin(phase) * 0.8;
            out[i] = (short) (Util.clamp((float) (sample * env * 0.45), -1f, 1f) * Short.MAX_VALUE);
        }
        return out;
    }

    /** A short airy swish for sliding. */
    private static short[] whoosh() {
        int n = (int) (0.25f * RATE);
        short[] out = new short[n];
        Random random = new Random(3);
        double band = 0;
        double prev = 0;
        for (int i = 0; i < n; i++) {
            float t = i / (float) n;
            double white = random.nextDouble() * 2 - 1;
            band += (white - band) * (0.05 + 0.25 * t);
            double high = band - prev;
            prev = band;
            double env = Math.sin(Math.PI * t);
            out[i] = (short) (Util.clamp((float) (high * env * 4.0), -1f, 1f) * 0.5f * Short.MAX_VALUE);
        }
        return out;
    }
}
