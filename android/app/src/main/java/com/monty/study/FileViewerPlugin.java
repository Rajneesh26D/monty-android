package com.monty.study;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "FileViewer")
public class FileViewerPlugin extends Plugin {
    static final long MAX = 500L * 1024 * 1024;
    private final Map<String, Transfer> transfers = new ConcurrentHashMap<>();
    static class Transfer {
        File target, partial; FileOutputStream out; long size, written;
        Transfer(File target, long size) throws Exception {
            this.target=target; this.size=size;
            partial=new File(target.getParentFile(), UUID.randomUUID()+".part");
            out=new FileOutputStream(partial);
        }
    }
    private File target(PluginCall call) throws Exception {
        String id=call.getString("id"), mime=call.getString("mime"), name=call.getString("name");
        if(id==null || !id.matches("[A-Za-z0-9_-]{1,100}") || mime==null || !(mime.equals("application/pdf") || mime.startsWith("image/"))) throw new IOException("Invalid file.");
        String key=(Boolean.TRUE.equals(call.getBoolean("legacy",false))?"pdf:":"file:")+id+":"+name;
        File dir=new File(getContext().getCacheDir(),"open-files/"+UpdateService.hex(MessageDigest.getInstance("SHA-256").digest(key.getBytes("UTF-8"))));
        if(!dir.isDirectory()&&!dir.mkdirs()) throw new IOException("Could not create file cache.");
        String safe=(name==null?"file":name).replaceAll("[^\\p{L}\\p{N} ._-]","_");
        if(safe.length()>120)safe=safe.substring(safe.length()-120);
        if(safe.equals(".")||safe.equals("..")||safe.isEmpty())safe="file";
        return new File(dir,safe);
    }
    private void launch(PluginCall call,File file,String mime) {
        getActivity().runOnUiThread(()->{
            try {
                Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",file);
                Intent view=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                view.setClipData(ClipData.newRawUri("Monty file",uri));
                getActivity().startActivity(Intent.createChooser(view,"Open with").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
                JSObject result=new JSObject();result.put("opened",true);call.resolve(result);
            } catch(Exception error){call.reject("Could not open a viewer. Install a compatible PDF or image app.");}
        });
    }
    @PluginMethod public void openCached(PluginCall call) {
        getBridge().execute(()->{
            try {
                File file=target(call);
                if(!file.isFile()&&Boolean.TRUE.equals(call.getBoolean("legacy",false))) {
                    File original=new File(getContext().getFilesDir(),"pdfs/"+call.getString("id")+".pdf");
                    if(original.isFile()) {
                        Transfer t=new Transfer(file,original.length());
                        try(InputStream in=new FileInputStream(original);OutputStream out=t.out){FileTransfer.copy(in,out,MAX);}
                        if(!t.partial.renameTo(file))throw new IOException("Could not cache this PDF.");
                    }
                }
                if(file.isFile()&&file.length()>0)launch(call,file,call.getString("mime"));
                else {JSObject result=new JSObject();result.put("opened",false);call.resolve(result);}
            }catch(Exception error){call.reject("Could not read the file cache. Free some storage and retry.");}
        });
    }
    @PluginMethod public void begin(PluginCall call) {
        try {
            File file=target(call);long size=call.getData().optLong("size",-1);
            if(size<=0||size>MAX)throw new IOException("This file is empty or exceeds 500 MB.");
            if(file.getParentFile().getUsableSpace()<size+16L*1024*1024)throw new IOException("Free some phone storage to open this file.");
            String id=UUID.randomUUID().toString();transfers.put(id,new Transfer(file,size));
            JSObject result=new JSObject();result.put("session",id);call.resolve(result);
        }catch(Exception error){call.reject(error.getMessage());}
    }
    @PluginMethod public void append(PluginCall call) {
        try {
            Transfer t=transfers.get(call.getString("session"));String data=call.getString("data");
            if(t==null||data==null||data.length()>700000)throw new IOException("Invalid file transfer chunk.");
            byte[] bytes=Base64.decode(data,Base64.DEFAULT);
            if(t.written+bytes.length>t.size)throw new IOException("File transfer size mismatch.");
            t.out.write(bytes);t.written+=bytes.length;call.resolve();
        }catch(Exception error){call.reject("Could not prepare the file. Please retry.");}
    }
    @PluginMethod public void finish(PluginCall call) {
        Transfer t=transfers.remove(call.getString("session"));
        try {
            if(t==null)throw new IOException();
            t.out.getFD().sync();t.out.close();
            if(t.written!=t.size||!t.partial.renameTo(t.target))throw new IOException();
            launch(call,t.target,call.getString("mime"));
        }catch(Exception error){if(t!=null)t.partial.delete();call.reject("The file copy was incomplete. Please retry.");}
    }
    @PluginMethod public void cancel(PluginCall call) {
        Transfer t=transfers.remove(call.getString("session"));
        if(t!=null){try{t.out.close();}catch(Exception ignored){}t.partial.delete();}call.resolve();
    }
    @PluginMethod public void download(PluginCall call) {
        getBridge().execute(()->{
            File partial=null; HttpURLConnection connection=null;
            try {
                File file=target(call);String token=call.getString("token");
                if(token==null||!token.matches("[a-f0-9]{64}"))throw new IOException("Connect this phone to download the file.");
                URL url=new URL(BuildConfig.UPDATE_GATEWAY+"/api/"+(Boolean.TRUE.equals(call.getBoolean("legacy",false))?"pdfs/":"files/")+call.getString("id"));
                connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(20000);connection.setReadTimeout(60000);
                connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("User-Agent","Monty-Android");
                int status=connection.getResponseCode();
                if(status==401)throw new IOException("Reconnect this phone in Settings to download the file.");
                if(status!=200)throw new IOException("File download failed. Check your connection and retry.");
                long expected=connection.getContentLengthLong();
                if(expected>MAX)throw new IOException("This file exceeds 500 MB.");
                if(file.getParentFile().getUsableSpace()<(expected>0?expected:65536)+16L*1024*1024)throw new IOException("Free some storage to download the file.");
                partial=new File(file.getParentFile(),UUID.randomUUID()+".part");
                try(InputStream in=connection.getInputStream();FileOutputStream out=new FileOutputStream(partial)) {
                    long copied=FileTransfer.copy(in,out,MAX);
                    if(copied==0||(expected>=0&&copied!=expected))throw new IOException("Incomplete download. Please retry.");
                    out.getFD().sync();
                }
                if(!partial.renameTo(file))throw new IOException("Could not save the downloaded file.");
                partial=null;launch(call,file,call.getString("mime"));
            }catch(Exception error){call.reject(error.getMessage()==null?"Could not download this file.":error.getMessage());}
            finally{if(connection!=null)connection.disconnect();if(partial!=null)partial.delete();}
        });
    }
}
