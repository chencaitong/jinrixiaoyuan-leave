/* Local schema validation and data anonymization; no network access. */
(() => {
  'use strict';
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  function inspect(value, depth=0, budget={count:0}) {
    if (++budget.count>20000 || depth>14) throw new Error('Backup is too complex');
    if (!value || typeof value!=='object') return;
    for (const key of Object.keys(value)) {
      if (forbidden.has(key)) throw new Error('Unsafe backup key');
      inspect(value[key],depth+1,budget);
    }
  }
  function normalize(candidate, defaults) {
    if (!candidate || candidate.version!==1 || !candidate.profile || !candidate.settings || !Array.isArray(candidate.leaves) || !Array.isArray(candidate.profile.menus)) throw new Error('Invalid backup');
    inspect(candidate);
    function copy(value, template, path='') {
      if (Array.isArray(template)) {
        if (value===undefined) value=template;
        const max=path.endsWith('workflow')?30:path.endsWith('menus')?40:100;
        if (!Array.isArray(value) || value.length>max) throw new Error('Invalid backup list');
        return value.map((item,i)=>copy(item,template[0],path+'.'+i));
      }
      if (template && typeof template==='object') {
        if (value===undefined) value=template;
        if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid backup object');
        const out={};
        for (const key of Object.keys(template)) out[key]=copy(value[key],template[key],path+'.'+key);
        return out;
      }
      if (typeof template==='string') {
        if (value===undefined) return template;
        const image=/\.(avatar|cover)$/.test(path), max=image?2200000:4000;
        if (typeof value!=='string' || value.length>max) throw new Error('Invalid backup text');
        if (image && value!==template && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value) && !/^assets\/(neutral-avatar\.svg|brick-cover\.jpg)$/.test(value)) return template;
        return value;
      }
      return typeof value===typeof template?value:template;
    }
    const result=copy(candidate,defaults);
    const ids=result.leaves.map(l=>l.id);
    if (new Set(ids).size!==ids.length) throw new Error('Duplicate record IDs');
    result.settings.font=['sans','kaiti'].includes(result.settings.font)?result.settings.font:'sans';
    for (const key of ['accent','blue']) if (!/^#[0-9a-f]{6}$/i.test(result.settings[key])) result.settings[key]=defaults.settings[key];
    result.privacyRevision=candidate.privacyRevision===1?1:0;
    result.designRevision=candidate.designRevision===3?3:0;
    return result;
  }
  function anonymize(candidate, defaults) {
    const value=normalize(candidate,defaults), previous=value.profile;
    const tokens=[previous.name,previous.school,previous.phone,previous.studentId,...value.leaves.flatMap(l=>[l.phone,l.cancelPerson,...l.workflow.map(n=>n.person)])].filter(t=>typeof t==='string'&&t.length>=2).sort((a,b)=>b.length-a.length);
    function redact(v) {
      if (typeof v==='string') {
        let text=v;
        for (const token of tokens) text=text.split(token).join('示例信息');
        return text.replace(/\b1[3-9]\d{9}\b/g,'示例电话').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'example@example.invalid');
      }
      if (Array.isArray(v)) return v.map(redact);
      if (v && typeof v==='object') return Object.fromEntries(Object.entries(v).map(([k,item])=>[k,redact(item)]));
      return v;
    }
    const clean=redact(value);
    clean.profile={...clean.profile,...defaults.profile,menus:defaults.profile.menus.map(m=>({...m}))};
    clean.leaves.forEach((l,i)=>{
      l.id='example-record-'+(i+1); l.phone=defaults.profile.phone;
      l.reason=defaults.leaves[0].reason; l.cancelPerson=l.cancelPerson?'示例用户':'';
      l.cancelNote='';l.parentAttachment='';l.studentAttachment='';
      l.workflow.forEach(n=>{n.person=n.person?'审核老师':'';n.opinion=n.opinion?'示例意见':'';});
    });
    clean.privacyRevision=1;
    return clean;
  }
  const api=Object.freeze({normalize,anonymize});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.CampusPrivacy=api;
})();
