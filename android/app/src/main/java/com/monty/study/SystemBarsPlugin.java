package com.monty.study;

import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Match system clock/navigation icon contrast to the currently visible app surface. */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
    @PluginMethod public void setAppearance(PluginCall call) {
        String background = call.getString("background", "#000000");
        if (!background.matches("#[0-9a-fA-F]{6}")) { call.reject("Invalid bar colour"); return; }
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            int colour = Color.parseColor(background);
            window.setStatusBarColor(colour);
            window.setNavigationBarColor(light && Build.VERSION.SDK_INT < Build.VERSION_CODES.O ? Color.BLACK : colour);
            WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }
            call.resolve();
        });
    }
}
