package com.monty.study;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.util.Arrays;
public class FileTransferTest {
    @Test public void copies135MBWithOnlyBoundedBuffers() throws Exception {
        final long size=135062760L;long[] left={size},written={0};
        InputStream in=new InputStream(){public int read(){throw new AssertionError();}public int read(byte[] b,int off,int len){if(left[0]==0)return -1;int n=(int)Math.min(len,left[0]);Arrays.fill(b,off,off+n,(byte)7);left[0]-=n;return n;}};
        OutputStream out=new OutputStream(){public void write(int b){throw new AssertionError();}public void write(byte[] b,int off,int len){assertTrue(len<=65536);assertEquals(7,b[off]);written[0]+=len;}};
        assertEquals(size,FileTransfer.copy(in,out,size));assertEquals(size,written[0]);
    }
    @Test public void rejectsOversizedStreams() throws Exception {
        try{FileTransfer.copy(new ByteArrayInputStream(new byte[20]),new ByteArrayOutputStream(),10);fail();}catch(IOException expected){}
    }
}
