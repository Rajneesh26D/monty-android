package com.monty.study;

import android.content.ClipData;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "FileViewer")
public class FileViewerPlugin extends Plugin {
    @PluginMethod public void open(PluginCall call) {
        try {
            String value = call.getString("uri"), mime = call.getString("mime");
            if (value == null || mime == null || !(mime.equals("application/pdf") || mime.startsWith("image/"))) {
                call.reject("Choose a PDF or image to open."); return;
            }
            Uri input = Uri.parse(value);
            if (!"file".equals(input.getScheme())) throw new IllegalArgumentException();
            File file = new File(input.getPath()).getCanonicalFile();
            File allowed = new File(getContext().getCacheDir(), "open-files").getCanonicalFile();
            if (!file.getPath().startsWith(allowed.getPath() + File.separator) || !file.isFile()) throw new IllegalArgumentException();
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            view.setClipData(ClipData.newRawUri("Monty file", uri));
            Intent chooser = Intent.createChooser(view, "Open with").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No compatible app is installed. Install a PDF or image viewer and try again.");
        } catch (Exception error) { call.reject("Could not open this file. Please try again."); }
    }
}
