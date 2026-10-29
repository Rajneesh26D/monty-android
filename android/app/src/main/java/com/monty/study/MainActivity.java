package com.monty.study;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureStorePlugin.class);
        registerPlugin(MontyUpdaterPlugin.class);
        registerPlugin(FileViewerPlugin.class);
        super.onCreate(savedInstanceState);
        UpdateWorker.schedule(this);
    }
}
