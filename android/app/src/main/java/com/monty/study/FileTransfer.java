package com.monty.study;
import java.io.*;
final class FileTransfer {
    static long copy(InputStream in, OutputStream out, long maximum) throws IOException {
        byte[] buffer = new byte[65536]; long total = 0; int n;
        while ((n = in.read(buffer)) != -1) {
            total += n;
            if (total > maximum) throw new IOException("The file exceeds its expected size.");
            out.write(buffer, 0, n);
        }
        return total;
    }
}
