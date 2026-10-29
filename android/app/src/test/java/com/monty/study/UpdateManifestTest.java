package com.monty.study;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateManifestTest {
    private JSONObject release() throws Exception {
        JSONObject packages = new JSONObject();
        for (String abi : new String[]{"arm64-v8a", "universal"}) packages.put(abi, new JSONObject()
            .put("url", "https://github.com/Rajneesh26D/monty-android/releases/download/v2.0.2/monty-" + abi + ".apk")
            .put("size", 123456).put("sha256", "a".repeat(64)));
        return new JSONObject().put("schemaVersion", 1).put("applicationId", "com.monty.study")
            .put("versionCode", 20002).put("versionName", "2.0.2").put("minSdk", 24).put("packages", packages);
    }
    private UpdateManifest parse(JSONObject json, boolean arm64) throws Exception {
        return new UpdateManifest(json, "Rajneesh26D/monty-android", "com.monty.study", arm64);
    }
    private void rejected(JSONObject json) throws Exception {
        try { parse(json, true); fail("Unsafe manifest accepted"); }
        catch (IllegalArgumentException expected) { }
    }
    @Test public void choosesTheDeviceAbiAndFallsBackToUniversal() throws Exception {
        assertTrue(parse(release(), true).url.endsWith("arm64-v8a.apk"));
        assertTrue(parse(release(), false).url.endsWith("universal.apk"));
        JSONObject json = release(); json.getJSONObject("packages").remove("arm64-v8a");
        assertTrue(parse(json, true).url.endsWith("universal.apk"));
    }
    @Test public void rejectsAnotherAppAndSchema() throws Exception {
        rejected(release().put("applicationId", "com.other.app"));
        rejected(release().put("schemaVersion", 2));
    }
    @Test public void rejectsUntrustedDownloadLocations() throws Exception {
        for (String url : new String[]{
            "http://github.com/Rajneesh26D/monty-android/releases/download/v2/app.apk",
            "https://github.com/other/repo/releases/download/v2/app.apk",
            "https://evil.test/Rajneesh26D/monty-android/releases/download/v2/app.apk",
            "https://github.com@evil.test/Rajneesh26D/monty-android/releases/download/v2/app.apk",
            "https://github.com/Rajneesh26D/monty-android/releases/download/v2/app.apk?token=test"
        }) {
            JSONObject json = release(); json.getJSONObject("packages").getJSONObject("arm64-v8a").put("url", url);
            rejected(json);
        }
    }
    @Test public void rejectsTruncatedHashesAndOversizeApks() throws Exception {
        JSONObject json = release(); json.getJSONObject("packages").getJSONObject("arm64-v8a").put("sha256", "abc"); rejected(json);
        json = release(); json.getJSONObject("packages").getJSONObject("arm64-v8a").put("size", 301L * 1024 * 1024); rejected(json);
        json = release(); json.getJSONObject("packages").getJSONObject("arm64-v8a").put("size", -1); rejected(json);
    }
}
