import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {validateCatalog} from './catalog.mjs';
const root=new URL('../../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const pub='site/public/';
const en=JSON.parse(await read('site/src/i18n/en.json')),it=JSON.parse(await read('site/src/i18n/it.json'));
validateCatalog(en,it,'it');
const broken={...it};delete broken['text.018'];assert.throws(()=>validateCatalog(en,broken,'it'),/missing text\.018/);
assert.throws(()=>validateCatalog(en,{...it,extra:'unexpected'},'it'),/extra extra/);
const before=await Promise.all(['index.html','it/index.html','sitemap.xml','robots.txt'].map(p=>read(pub+p)));
await import('./build.mjs');
const after=await Promise.all(['index.html','it/index.html','sitemap.xml','robots.txt'].map(p=>read(pub+p)));
assert.ok(after.every((html,i)=>html===before[i]),'Generated site is stale; run npm run build:site');
const idsExpected=['bitcoin','lightning','liquid','rgb','cashu','local','code','extensions'];
for(const [i,lang] of ['en','it'].entries()){
 const html=after[i];assert.ok(!html.includes('{{'));assert.match(html,new RegExp(`<html lang="${lang}"`));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate ID');
 for(const match of html.matchAll(/(?:href|aria-controls)="#([^"]+)"/g)) assert.ok(ids.includes(match[1]),`Missing anchor ${match[1]}`);
 assert.deepEqual([...html.matchAll(/data-story="([^"]+)"/g)].map(m=>m[1]),idsExpected);
 const ld=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
 assert.equal(ld['@type'],'SoftwareApplication');assert.equal(ld.inLanguage,lang);assert.equal(ld.url,'https://bitcode-agent.vercel.app/'+(lang==='it'?'it/':''));
 for(const hreflang of ['en','it','x-default'])assert.match(html,new RegExp(`rel="alternate" hreflang="${hreflang}"`));
 assert.equal((html.match(/<script(?:\s|>)/g)||[]).length,3,'JSON-LD, static data, and one runtime only');
 for(const match of html.matchAll(/(?:src|poster)="(\/assets\/[^"]+)"/g))assert.ok((await stat(new URL(pub+match[1].slice(1),root))).isFile(),match[1]);
 assert.equal((html.match(/preload="none" loading="lazy"/g)||[]).length,3);
 assert.equal((html.match(/srclang="it"/g)||[]).length,3);
 assert.equal((html.match(/<video\b/g)||[]).length,3,"Only the recorded demos are video elements; the hero loop is added by the runtime");
 for(const match of html.matchAll(/srcset="(\/assets\/[^"]+)"/g))assert.ok((await stat(new URL(pub+match[1].slice(1),root))).isFile(),match[1]);
 const hero=html.match(/<figure class="hero-team" data-hero-video data-src-desktop="([^"]+)" data-src-mobile="([^"]+)">/);
 assert.ok(hero,"Hero figure declares both loop variants");
 for(const base of hero.slice(1))for(const ext of ["webm","mp4","webp"])assert.ok((await stat(new URL(pub+base.slice(1)+"."+ext,root))).isFile(),base+"."+ext);
 assert.match(html,/<img class="hero-poster" src="\/assets\/site\/hero\/sats-team-desktop\.webp"[^>]+alt="[^"]+"/,"Poster is a real image with alternative text");
}
const contract=JSON.parse(await read('site/src/design-contract.json'));
const css=await read(pub+'assets/site/base.css');const tokens=Object.fromEntries([...css.match(/:root\s*\{(.*?)\}/s)[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2]]));
assert.deepEqual(tokens,contract.tokens,'Original design tokens changed');
for(const file of ['site/public/assets/site/base.css','site/public/assets/site/motion.css','site/public/assets/site/site.js','site/scripts/render-og.mjs','site/src/index.template.html']){
 const source=await read(file);
 const newColors=[...source.matchAll(/#[a-fA-F0-9]{3,8}\b/g)].map(m=>m[0].toLowerCase()).filter(color=>!contract.colors.includes(color));
 assert.deepEqual(newColors,[],`Colors outside the original palette in ${file}`);
}
const recordings=JSON.parse(await read(pub+'assets/site/recordings.json'));
for(const [id,s] of Object.entries(recordings.sessions)){
 for(const catalog of [en,it])assert.equal(catalog[`terminal.${id}.output`],s.lines.map(line=>line.text).join('\n'),`Recorded output must remain original: ${id}`);
 const transcript=await read(pub+s.source.slice(1));
 for(const line of s.lines){if(line.text.startsWith('$ '))continue;assert.ok(transcript.includes(line.text),`${id} line not found in original stdout: ${line.text}`);}
 assert.ok(/^[a-f0-9]{40}$/.test(s.sourceCommit));assert.ok(!Number.isNaN(Date.parse(s.recordedAt)));
}
for(const id of ['installation','configuration','features']){
 const english=await read(`${pub}assets/demos/${id}.en.vtt`),italian=await read(`${pub}assets/demos/${id}.it.vtt`);
 const times=s=>s.split('\n').filter(l=>l.includes('-->'));assert.deepEqual(times(english),times(italian));
}
assert.equal(JSON.parse(await read('vercel.json')).buildCommand,'');
for(const id of ['node','script','hash','merkle']){const f=`assets/sats/${id}/idle-256.webp`;assert.ok((await readFile(new URL(f,root))).equals(await readFile(new URL(pub+f,root))),`Stale Sat copy: ${f}`);}
console.log(`✓ ${Object.keys(en).length} i18n keys; missing/extra key rejection; deterministic generated files; anchors, SEO, captions and assets; unchanged design tokens; original CLI excerpts; no Vercel build`);
