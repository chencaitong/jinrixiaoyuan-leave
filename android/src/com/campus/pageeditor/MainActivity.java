package com.campus.pageeditor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceResponse;
import android.webkit.ConsoleMessage;
import android.util.Log;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int PICK_IMAGE=101, SAVE_BACKUP=102, OPEN_BACKUP=103;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web=new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDefaultTextEncodingName("UTF-8");
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);
        s.setTextZoom(100);
        web.addJavascriptInterface(new NativeBridge(),"CampusNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request){
                Uri uri=request.getUrl();
                if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith("/assets/ui/")){
                    String asset=uri.getPath().substring("/assets/".length());
                    if(asset.contains(".."))return new WebResourceResponse("text/plain","UTF-8",null);
                    String mime=asset.endsWith(".html")?"text/html":asset.endsWith(".js")?"application/javascript":asset.endsWith(".css")?"text/css":asset.endsWith(".jpg")?"image/jpeg":asset.endsWith(".png")?"image/png":asset.endsWith(".svg")?"image/svg+xml":"application/octet-stream";
                    try{return new WebResourceResponse(mime,"UTF-8",getAssets().open(asset));}catch(Exception ex){Log.e("CampusEditor","Cannot read bundled asset: "+asset,ex);}
                }
                return new WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){
                return !request.getUrl().toString().startsWith("https://appassets.androidplatform.net/assets/ui/");
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onConsoleMessage(ConsoleMessage message){if(message.messageLevel()==ConsoleMessage.MessageLevel.ERROR)Log.e("CampusEditor","UI script error at line "+message.lineNumber());return true;}
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);
                fileCallback=callback;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.setType("image/*");
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                try{startActivityForResult(pick,PICK_IMAGE);}catch(Exception ex){fileCallback.onReceiveValue(null);fileCallback=null;showToast("无法打开图片选择器");}
                return true;
            }
        });
        setContentView(web);
        try(InputStream in=getAssets().open("ui/offline.html");ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;
            while((count=in.read(buffer))!=-1)out.write(buffer,0,count);
            web.loadDataWithBaseURL("https://appassets.androidplatform.net/assets/ui/",out.toString("UTF-8"),"text/html","UTF-8",null);
        }catch(Exception ex){Log.e("CampusEditor","Cannot initialize offline page",ex);new AlertDialog.Builder(this).setTitle("无法加载应用").setMessage("应用资源读取失败，请重新安装最新安装包。").setPositiveButton("关闭",(d,w)->finish()).show();}
    }

    public final class NativeBridge {
        @JavascriptInterface public void setPageTheme(String color, boolean darkIcons){runOnUiThread(()->{
            try{getWindow().setStatusBarColor(Color.parseColor(color));getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR|(darkIcons?View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR:0));}catch(IllegalArgumentException ignored){}
        });}
        @JavascriptInterface public void saveBackup(String json){
            if(json==null||json.length()>8*1024*1024){showToast("备份内容过大");return;}
            pendingBackup=json;
            runOnUiThread(()->{
                Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                save.setType("application/json");save.addCategory(Intent.CATEGORY_OPENABLE);
                save.putExtra(Intent.EXTRA_TITLE,"校园页面备份.json");
                try{startActivityForResult(save,SAVE_BACKUP);}catch(Exception ex){showToast("无法打开文件保存窗口");}
            });
        }
        @JavascriptInterface public void openBackup(){runOnUiThread(()->{
            Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.setType("*/*");
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            try{startActivityForResult(pick,OPEN_BACKUP);}catch(Exception ex){showToast("无法打开文件选择器");}
        });}
        @JavascriptInterface public void printPage(){runOnUiThread(()->{
            try{PrintManager pm=(PrintManager)getSystemService(PRINT_SERVICE);pm.print("校园页面",web.createPrintDocumentAdapter("校园页面"),null);}catch(Exception ex){showToast("当前设备不支持打印");}
        });}
        @JavascriptInterface public void confirmExit(){runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setTitle("退出应用？").setMessage("编辑的内容已自动保存在本机。").setNegativeButton("继续使用",null).setPositiveButton("退出",(d,w)->finish()).show());}
    }
    @Override protected void onActivityResult(int request,int result,Intent intent){
        super.onActivityResult(request,result,intent);
        if(request==PICK_IMAGE){if(fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&intent!=null?WebChromeClient.FileChooserParams.parseResult(result,intent):null);fileCallback=null;}return;}
        if(result!=RESULT_OK||intent==null||intent.getData()==null)return;
        Uri uri=intent.getData();
        if(request==SAVE_BACKUP&&pendingBackup!=null){
            try(OutputStream stream=getContentResolver().openOutputStream(uri)){
                if(stream==null)throw new Exception();stream.write(pendingBackup.getBytes(StandardCharsets.UTF_8));notifyPage("备份已保存");
            }catch(Exception ex){notifyPage("备份保存失败，请重新选择位置");}
            pendingBackup=null;
        }else if(request==OPEN_BACKUP){
            new Thread(()->{try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){
                if(in==null)throw new Exception();byte[] buffer=new byte[8192];int count;
                while((count=in.read(buffer))!=-1){if(out.size()+count>8*1024*1024)throw new Exception();out.write(buffer,0,count);}
                String json=out.toString("UTF-8");runOnUiThread(()->web.evaluateJavascript("window.CampusApp.importBackup("+JSONObject.quote(json)+")",null));
            }catch(Exception ex){notifyPage("无法读取备份，请选择小于 8 MB 的 JSON 文件");}}).start();
        }
    }
    private void showToast(String text){runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show());}
    private void notifyPage(String text){runOnUiThread(()->web.evaluateJavascript("window.CampusApp.notify("+JSONObject.quote(text)+")",null));}
    @Override public void onBackPressed(){web.evaluateJavascript("window.CampusApp && window.CampusApp.back()",null);}
    @Override protected void onPause(){web.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}web.removeJavascriptInterface("CampusNative");web.destroy();super.onDestroy();}
}
