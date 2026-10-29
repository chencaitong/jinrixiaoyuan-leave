import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const [source,destination]=process.argv.slice(2);
let html=fs.readFileSync(path.join(source,'index.html'),'utf8');
let js=fs.readFileSync(path.join(source,'privacy.js'),'utf8')+'\n'+fs.readFileSync(path.join(source,'app.js'),'utf8');
const css=fs.readFileSync(path.join(source,'style.css'),'utf8');
for(const [name,mime] of [['neutral-avatar.svg','image/svg+xml'],['brick-cover.jpg','image/jpeg']]){
  const uri='data:'+mime+';base64,'+fs.readFileSync(path.join(source,'assets',name)).toString('base64');
  js=js.replaceAll('assets/'+name,uri);
}
js=js.replace(/\r\n?/g,'\n').replaceAll('</script','<\\/script');
const digest=createHash('sha256').update(js).digest('base64');
html=html.replace("script-src 'self'",()=>"script-src 'self' 'sha256-"+digest+"'");
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+css+'</style>');
html=html.replace('<script src="privacy.js"></script>','');
html=html.replace('<script src="app.js"></script>',()=>'<script>'+js+'</script>');
new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1],{filename:'offline.html'});
fs.writeFileSync(destination,html);
