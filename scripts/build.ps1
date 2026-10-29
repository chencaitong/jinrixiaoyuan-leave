param(
 [string]$JdkPath=$env:JAVA_HOME,
 [string]$PythonPath='python',
 [string]$NodePath='node',
 [string]$BuildToolsPath,
 [string]$PlatformPath,
 [string]$SigningKey,
 [string]$SigningPasswordFile,
 [string]$OutputApk
)
$ErrorActionPreference='Stop'
$ProjectRoot=Split-Path $PSScriptRoot
if(!$JdkPath){throw 'Set JAVA_HOME or supply -JdkPath.'}
$sdkRoot=$env:ANDROID_HOME
if(!$sdkRoot){$sdkRoot=$env:ANDROID_SDK_ROOT}
if(!$BuildToolsPath -and $sdkRoot){$BuildToolsPath=Join-Path $sdkRoot 'build-tools\35.0.0'}
if(!$PlatformPath -and $sdkRoot){$PlatformPath=Join-Path $sdkRoot 'platforms\android-35'}
if(!$BuildToolsPath -or !$PlatformPath){throw 'Set ANDROID_HOME or supply -BuildToolsPath and -PlatformPath.'}
if(!$OutputApk){$OutputApk=Join-Path $ProjectRoot 'artifacts\jinrixiaoyuan-leave-v1.2.0.apk'}
$buildPath=Join-Path $ProjectRoot '.local\build'
$assetsPath=Join-Path $buildPath 'assets\ui'
$classesPath=Join-Path $buildPath 'classes'
$dexPath=Join-Path $buildPath 'dex'
$resPath=Join-Path $ProjectRoot 'android\res'
$uiPath=Join-Path $ProjectRoot 'web'
function Run-Tool([string]$Executable,[string[]]$Arguments){& $Executable @Arguments;if($LASTEXITCODE -ne 0){throw "Build step failed: $Executable"}}
@($buildPath,$assetsPath,$classesPath,$dexPath,(Split-Path $OutputApk)) | ForEach-Object {New-Item -ItemType Directory -Force -Path $_ | Out-Null}
$allowed=@('index.html','style.css','app.js','privacy.js','assets\neutral-avatar.svg','assets\brick-cover.jpg')
foreach($file in $allowed){$target=Join-Path $assetsPath $file;New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null;Copy-Item -LiteralPath (Join-Path $uiPath $file) -Destination $target -Force}
foreach($file in Get-ChildItem -LiteralPath $assetsPath -Recurse -File){$relative=[IO.Path]::GetRelativePath($assetsPath,$file.FullName);if($relative -notin ($allowed+@('offline.html'))){throw 'Unexpected file in build assets. Use a clean .local build directory.'}}
Run-Tool $NodePath @((Join-Path $PSScriptRoot 'prepare-offline.mjs'),$uiPath,(Join-Path $assetsPath 'offline.html'))
$androidJar=Join-Path $PlatformPath 'android.jar'
$resourcesZip=Join-Path $buildPath 'resources.zip'
$baseApk=Join-Path $buildPath 'base.apk'
$normalizedApk=Join-Path $buildPath 'normalized.apk'
$alignedApk=Join-Path $buildPath 'aligned.apk'
Run-Tool (Join-Path $BuildToolsPath 'aapt2.exe') @('compile','--dir',$resPath,'-o',$resourcesZip)
Run-Tool (Join-Path $BuildToolsPath 'aapt2.exe') @('link','-o',$baseApk,'--manifest',(Join-Path $ProjectRoot 'android\AndroidManifest.xml'),'-I',$androidJar,'-A',(Join-Path $buildPath 'assets'),'--min-sdk-version','26','--target-sdk-version','34','-R',$resourcesZip)
$sources=@(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'android\src') -Filter '*.java' -Recurse | ForEach-Object {$_.FullName})
Run-Tool (Join-Path $JdkPath 'bin\javac.exe') (@('-encoding','UTF-8','-source','8','-target','8','-classpath',$androidJar,'-d',$classesPath)+$sources)
$classes=@(Get-ChildItem -LiteralPath $classesPath -Filter '*.class' -Recurse | ForEach-Object {$_.FullName})
Run-Tool (Join-Path $JdkPath 'bin\java.exe') (@('-cp',(Join-Path $BuildToolsPath 'lib\d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',$androidJar,'--output',$dexPath)+$classes)
Run-Tool $PythonPath @((Join-Path $PSScriptRoot 'normalize-apk.py'),$baseApk,$normalizedApk,(Join-Path $dexPath 'classes.dex'))
Run-Tool (Join-Path $BuildToolsPath 'zipalign.exe') @('-f','-p','4',$normalizedApk,$alignedApk)
if([bool]$SigningKey -ne [bool]$SigningPasswordFile){throw 'Supply both signing parameters, or neither.'}
if(!$SigningKey){
 $signingPath=Join-Path $ProjectRoot '.local\signing';New-Item -ItemType Directory -Force -Path $signingPath | Out-Null
 $SigningKey=Join-Path $signingPath 'research.jks';$SigningPasswordFile=Join-Path $signingPath 'password.txt'
 if(!(Test-Path -LiteralPath $SigningKey)){
  $bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [IO.File]::WriteAllText($SigningPasswordFile,[Convert]::ToBase64String($bytes))
  Run-Tool (Join-Path $JdkPath 'bin\keytool.exe') @('-genkeypair','-keystore',$SigningKey,'-storepass:file',$SigningPasswordFile,'-keypass:file',$SigningPasswordFile,'-alias','research-demo','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Research Demo')
 }
}
Run-Tool (Join-Path $JdkPath 'bin\java.exe') @('-jar',(Join-Path $BuildToolsPath 'lib\apksigner.jar'),'sign','--ks',$SigningKey,'--ks-pass',"file:$SigningPasswordFile",'--out',$OutputApk,$alignedApk)
Run-Tool (Join-Path $JdkPath 'bin\java.exe') @('-jar',(Join-Path $BuildToolsPath 'lib\apksigner.jar'),'verify','--verbose',$OutputApk)
Run-Tool (Join-Path $BuildToolsPath 'zipalign.exe') @('-c','-p','4',$OutputApk)
Get-FileHash -LiteralPath $OutputApk -Algorithm SHA256 | Format-List
