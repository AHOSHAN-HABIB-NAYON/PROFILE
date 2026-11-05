package app.quizwar.bd;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Live voice: while a voice chat is on, play it loud through the phone speaker (Android would
 * otherwise use the quiet earpiece for calls). Turned back to normal when the voice chat ends.
 */
@CapacitorPlugin(name = "QwAudio")
public class QwAudioPlugin extends Plugin {
    @PluginMethod
    public void speaker(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        // Audio calls start on the earpiece (phone at the ear), like a normal phone call.
        boolean earpiece = Boolean.TRUE.equals(call.getBoolean("earpiece", false));
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) {
            call.resolve();
            return;
        }
        try {
            if (on) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                if (Build.VERSION.SDK_INT >= 31) {
                    List<AudioDeviceInfo> devices = am.getAvailableCommunicationDevices();
                    AudioDeviceInfo pick = null;
                    for (AudioDeviceInfo d : devices) {
                        int t = d.getType();
                        // Headphones / Bluetooth win; otherwise the loud speaker.
                        if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_USB_HEADSET) {
                            pick = d;
                            break;
                        }
                        if (t == (earpiece ? AudioDeviceInfo.TYPE_BUILTIN_EARPIECE : AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)) pick = d;
                    }
                    if (pick != null) am.setCommunicationDevice(pick);
                } else {
                    //noinspection deprecation
                    am.setSpeakerphoneOn(!earpiece && !am.isWiredHeadsetOn() && !am.isBluetoothScoOn());
                }
            } else {
                if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice();
                else {
                    //noinspection deprecation
                    am.setSpeakerphoneOn(false);
                }
                am.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Exception ignored) {
            // Never break the voice chat because of audio routing.
        }
        call.resolve();
    }
}
