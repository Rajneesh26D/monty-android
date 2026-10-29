package com.monty.study;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** The existing repository's device token API, backed by Android Keystore. */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {
    private static final String ALIAS = "monty-device-token";
    private String entry(PluginCall call) {
        return "cloud".equals(call.getString("key")) ? "cloud" : "token";
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @PluginMethod public void get(PluginCall call) {
        try {
            String stored = getContext().getSharedPreferences("monty-secure", 0).getString(entry(call), null);
            JSObject result = new JSObject();
            if (stored == null) result.put("value", org.json.JSONObject.NULL);
            else {
                String[] parts = stored.split(":", 2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception e) { call.reject("Could not read the device connection. Reconnect in Settings."); }
    }
    @PluginMethod public void set(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null || value.length() > 4096) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
                Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!getContext().getSharedPreferences("monty-secure", 0).edit().putString(entry(call), encrypted).commit()) throw new Exception();
            call.resolve();
        } catch (Exception e) { call.reject("Could not save the device connection."); }
    }
    @PluginMethod public void remove(PluginCall call) {
        if (getContext().getSharedPreferences("monty-secure", 0).edit().remove(entry(call)).commit()) call.resolve();
        else call.reject("Could not remove the device connection.");
    }
}
