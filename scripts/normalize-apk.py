import sys, zipfile
source,destination,dex=sys.argv[1:]
with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_STORED) as target:
    for entry in original.infolist():
        if entry.is_dir():
            continue
        target.writestr(entry.filename,original.read(entry.filename))
    with open(dex,'rb') as stream:
        target.writestr('classes.dex',stream.read())
