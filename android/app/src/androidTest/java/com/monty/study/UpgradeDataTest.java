package com.monty.study;
import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.*;
@RunWith(AndroidJUnit4.class)
public class UpgradeDataTest {
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    @Test public void seed() throws Exception {
        Context c=context();
        assertTrue(c.getSharedPreferences("upgrade-proof",0).edit().putString("progress","keep-answers").commit());
        try(FileOutputStream out=new FileOutputStream(new File(c.getFilesDir(),"upgrade-proof.txt"))){out.write("keep-notes".getBytes("UTF-8"));}
        try(SQLiteDatabase db=c.openOrCreateDatabase("upgrade-proof.db",0,null)){db.execSQL("CREATE TABLE IF NOT EXISTS progress(value TEXT)");db.execSQL("INSERT INTO progress VALUES('keep-results')");}
    }
    @Test public void verify() throws Exception {
        Context c=context();assertEquals("keep-answers",c.getSharedPreferences("upgrade-proof",0).getString("progress",null));
        try(FileInputStream in=new FileInputStream(new File(c.getFilesDir(),"upgrade-proof.txt"))){byte[] bytes=new byte[10];assertEquals(10,in.read(bytes));assertEquals("keep-notes",new String(bytes,"UTF-8"));}
        try(SQLiteDatabase db=c.openOrCreateDatabase("upgrade-proof.db",0,null);android.database.Cursor cursor=db.rawQuery("SELECT value FROM progress",null)){assertTrue(cursor.moveToFirst());assertEquals("keep-results",cursor.getString(0));}
    }
}
