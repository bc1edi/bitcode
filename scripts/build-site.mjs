// Authoring only. Generated HTML is committed; Vercel has no build step.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateCatalog } from './site/catalog.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFile(path.join(root,p),'utf8');
const template=await read('site/index.template.html');
const catalogs=await Promise.all(['en','it'].map(async lang=>[lang,JSON.parse(await read(`i18n/${lang}.json`))]));
const keys=Object.keys(catalogs[0][1]).sort();
for(const [lang,strings] of catalogs) validateCatalog(catalogs[0][1],strings,lang);
const {sessions}=JSON.parse(await read('assets/site/recordings.json'));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=s=>JSON.stringify(s).replaceAll('<','\\u003c');
const ids=['bitcoin','lightning','liquid','rgb','cashu','local','code','extensions'];
for(const [lang,t] of catalogs){
 const localizedSessions=Object.fromEntries(Object.entries(sessions).map(([id,s])=>{const lines=t[`terminal.${id}.output`].split('\n');if(lines.length!==s.lines.length)throw Error('Recorded line count changed: '+id);return [id,{...s,lines:s.lines.map((line,i)=>({...line,text:lines[i]}))}];}));
 const terminal=(id,mode)=>{
  const s=localizedSessions[id];const hero=mode==='hero';const sticky=mode==='sticky';
  const rows=s.lines.map(l=>`<div class="hero-cli-line ${l.className?'hero-cli-line--'+escape(l.className):''}">${escape(l.text)||'&nbsp;'}</div>`).join('');
  const body=`<div class="hero-cli-body" ${hero?'id="hero-cli-output"':''} data-session="${id}" data-player="${mode}" lang="en" aria-hidden="true">${rows}</div><div class="sr-only" lang="en">${escape(s.lines.map(l=>l.text).join("\n"))}</div>`;
  if(hero)return body;
  return `<figure class="session-panel ${sticky?'session-panel--sticky':'inline-session'}" ${sticky?`data-panel="${id}"`:''}><div class="terminal"><div class="terminal-bar"><span class="terminal-title">bitcode · ${id}</span><span class="demo-label">${escape(t['ui.recorded'])}</span></div>${body}<div class="terminal-bottom"><span>${s.recordedAt.slice(0,10)}</span><a href="${s.source}">${escape(t['ui.source'])} ↗</a></div></div><figcaption><code>${escape(s.command)}</code><span>${escape(t[s.context])}</span></figcaption></figure>`;
 };
 const tabs=['source','ollama','qvac','scriptable'];
 const labels=[t['ui.sourceTab'],'Ollama','QVAC','Scriptable'];
 const installTabs=`<div class="install-tabs" aria-label="${escape(t['ui.installTabs'])}">${tabs.map((id,i)=>`<a id="tab-${id}" href="#install-${id}" data-install-tab="${id}">${escape(labels[i])}</a>`).join('')}<span class="install-indicator" aria-hidden="true"></span></div>`;
 const cmds={ollama:'node bitcode.mjs -m ollama/gpt-oss:20b',qvac:'npm --prefix integrations/qvac start\nnode bitcode.mjs -m qvac/bitcode-local',scriptable:'node bitcode.mjs --read-only --json -p "review this repo"'};
 const panels=tabs.slice(1).map(id=>`<div class="install-box" id="install-${id}" data-install-panel><div class="install-bar"><span>${id==='qvac'?'QVAC':id==='ollama'?'Ollama':'Scriptable'}</span><button class="copy-button" type="button" data-copy="install-${id}-command" aria-label="${escape(t['ui.copy'])}" hidden><svg class="icon" aria-hidden="true"><use href="#i-copy"/></svg></button></div><pre id="install-${id}-command">${escape(cmds[id])}</pre><div class="install-next"><p>${escape(t['ui.'+({ollama:'ollamaNote',qvac:'qvacNote',scriptable:'scriptNote'}[id])])}</p></div></div>`).join('');
 const extras=`<div class="site-preferences container"><button type="button" id="motion-toggle" aria-pressed="false" hidden>${escape(t['ui.motionPause'])}</button><p>${escape(t['ui.privacy'])}</p></div><div class="language-banner" hidden><span>${escape(t['ui.banner'])}</span><a data-language="it" href="/it/">${escape(t['ui.bannerLink'])}</a><button type="button" aria-label="${escape(t['ui.dismiss'])}">×</button></div><div class="brand-menu" role="group" aria-label="${escape(t['ui.brandMenu'])}" hidden><button type="button" data-logo-copy>${escape(t['ui.copySvg'])}</button><a href="/assets/site/bitcode.svg" download="bitcode.svg">${escape(t['ui.downloadSvg'])}</a><a href="https://github.com/faktotum-project/bitcode/tree/main/design/system">${escape(t['ui.brand'])} ↗</a></div><dialog id="genesis-dialog" aria-labelledby="genesis-title"><p class="eyebrow" id="genesis-title">${escape(t['ui.genesisLabel'])}</p><blockquote lang="en">The Times 03/Jan/2009 Chancellor on brink of second bailout for banks</blockquote><button class="button button-secondary" type="button" data-genesis-close>${escape(t['ui.genesisClose'])}</button></dialog>`;
 const data={...t,heroSession:terminal('bitcoin','hero'),storySessions:ids.map(id=>terminal(id,'sticky')).join(''),installTabs,installPanels:panels,extras,jsonld:json({'@context':'https://schema.org','@type':'SoftwareApplication',name:'bitcode',applicationCategory:'DeveloperApplication',operatingSystem:'Linux, macOS, Windows',softwareVersion:'0.2.0',description:t['meta.description'],url:'https://bitcode-agent.vercel.app/'+t.path,inLanguage:lang,license:'https://github.com/faktotum-project/bitcode/blob/main/LICENSE',downloadUrl:'https://github.com/faktotum-project/bitcode'}),siteData:json({lang,ui:Object.fromEntries(Object.entries(t).filter(([k])=>k.startsWith('ui.')).map(([k,v])=>[k.slice(3),v])),sessions:localizedSessions})};
 for(const id of ids)data['session.'+id]=terminal(id,'inline');
 const html='<!-- Generated by node scripts/build-site.mjs. Edit site/index.template.html and i18n/*.json. -->\n'+template.replace(/\{\{([\w.]+)\}\}/g,(_,key)=>{if(!(key in data))throw Error('Unknown template key: '+key);return ['heroSession','storySessions','installTabs','installPanels','extras','jsonld','siteData'].includes(key)||key.startsWith('session.')?data[key]:escape(data[key]);});
 if(/\{\{[\w.]+\}\}/.test(html))throw Error('Unresolved placeholder');
 const out=lang==='en'?'index.html':'it/index.html';await mkdir(path.dirname(path.join(root,out)),{recursive:true});await writeFile(path.join(root,out),html);
 console.log(`Generated ${out} (${keys.length} keys)`);
}
const base='https://bitcode-agent.vercel.app';
const alternates=`<xhtml:link rel="alternate" hreflang="en" href="${base}/"/><xhtml:link rel="alternate" hreflang="it" href="${base}/it/"/><xhtml:link rel="alternate" hreflang="x-default" href="${base}/"/>`;
await writeFile(path.join(root,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${base}/</loc>${alternates}</url><url><loc>${base}/it/</loc>${alternates}</url></urlset>\n`);
await writeFile(path.join(root,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
