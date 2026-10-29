const test=require('node:test');
const assert=require('node:assert/strict');
const {normalize,anonymize}=require('../web/privacy.js');
const fresh=()=>({version:1,profile:{name:'小美',school:'集美大学',phone:'18000000000',studentId:'DEMO-0001',avatar:'assets/neutral-avatar.svg',cover:'assets/brick-cover.jpg',bio:'暂无个性签名',status:'添加状态',major:'示例专业',className:'示例班级',department:'示例院系',fans:'0',menus:[{label:'个人主页',group:'大学圈',target:'profile'}]},settings:{font:'sans',accent:'#54c9c2',blue:'#3e54de'},leaves:[{id:'demo-1',phone:'18000000000',reason:'示例请假事由',cancelPerson:'',cancelNote:'',parentAttachment:'',studentAttachment:'',workflow:[{title:'审核',person:'审核老师',opinion:'示例意见'}]}]});
test('anonymization replaces profile, references, reviewer and images without changing the input',()=>{
 const original=fresh(),privatePhone='1'+'37'+'1'.repeat(8);
 original.profile.name='待清理姓名';original.profile.school='待清理学校';original.profile.phone=privatePhone;original.profile.studentId='PRIVATE-STUDENT';
 original.profile.avatar='data:image/png;base64,AAAA';original.leaves[0].phone=privatePhone;original.leaves[0].reason='待清理姓名 '+privatePhone+' PRIVATE-STUDENT';original.leaves[0].workflow[0].person='待清理审核人';original.leaves[0].cancelNote='私有说明';
 const clean=anonymize(original,fresh()),text=JSON.stringify(clean);
 for(const forbidden of ['待清理姓名','待清理学校',privatePhone,'PRIVATE-STUDENT','待清理审核人','私有说明','data:image/png;base64,AAAA'])assert.equal(text.includes(forbidden),false);
 assert.equal(clean.profile.name,'小美');assert.equal(clean.profile.school,'集美大学');assert.equal(clean.profile.phone,'18000000000');assert.equal(clean.leaves[0].phone,'18000000000');assert.equal(clean.privacyRevision,1);assert.equal(original.profile.name,'待清理姓名');
});
test('prototype poisoning is rejected before normalization',()=>{
 const value=fresh();value.extra=JSON.parse('{"__proto__":{"polluted":true}}');assert.throws(()=>normalize(value,fresh()),/Unsafe backup key/);assert.equal({}.polluted,undefined);
});
test('unsupported images are discarded and unknown properties are not retained',()=>{
 const value=fresh();value.profile.avatar='https://example.invalid/tracking.png';value.profile.cover='data:image/svg+xml;base64,AAAA';value.profile.hiddenSecret='discard';const clean=normalize(value,fresh());assert.equal(clean.profile.avatar,'assets/neutral-avatar.svg');assert.equal(clean.profile.cover,'assets/brick-cover.jpg');assert.equal('hiddenSecret' in clean.profile,false);
});
test('backup size, types and duplicate IDs are bounded',()=>{
 const value=fresh();value.leaves=Array(101).fill(value.leaves[0]);assert.throws(()=>normalize(value,fresh()));const duplicate=fresh();duplicate.leaves.push({...duplicate.leaves[0]});assert.throws(()=>normalize(duplicate,fresh()),/Duplicate/);const wrong=fresh();wrong.profile.name={nested:'unexpected'};assert.throws(()=>normalize(wrong,fresh()));
});
test('saved privacy revision and chosen appearance survive normalization',()=>{
 const value=fresh();value.privacyRevision=1;value.designRevision=3;value.settings.font='kaiti';const clean=normalize(value,fresh());assert.equal(clean.privacyRevision,1);assert.equal(clean.designRevision,3);assert.equal(clean.settings.font,'kaiti');
});
test('offline bundle has a CSP hash matching browser-normalized script bytes',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),child=require('node:child_process');
 const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','test-offline.html');fs.mkdirSync(path.dirname(output),{recursive:true});
 child.execFileSync('node',[path.join(root,'scripts','prepare-offline.mjs'),path.join(root,'web'),output]);
 const html=fs.readFileSync(output,'utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\r\n?/g,'\n');
 const hash=crypto.createHash('sha256').update(script).digest('base64');assert.equal(html.includes("'sha256-"+hash+"'"),true);assert.equal(html.includes('<script src='),false);
});
