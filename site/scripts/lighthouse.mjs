// Optional development audit. Use an installed Lighthouse CLI; nothing is added to the client.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const cli=process.env.SITE_LIGHTHOUSE_CLI||require.resolve('lighthouse/cli/index.js');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const out=new URL('../../artifacts/site/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const summary=[];
for(const lang of ['en','it'])for(const device of ['mobile','desktop']){
 const output=out+`lighthouse-${lang}-${device}.json`;
 const args=[cli,base+(lang==='it'?'/it/':'/'),'--chrome-flags=--headless --no-sandbox','--only-categories=performance,accessibility,best-practices,seo','--output=json','--output-path='+output,'--quiet'];
 if(device==='desktop')args.push('--preset=desktop');
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Lighthouse exit '+code)));});
 const report=JSON.parse(await readFile(output,'utf8'));
 const scores=Object.fromEntries(Object.entries(report.categories).map(([id,c])=>[id,Math.round(c.score*100)]));
 const result={lang,device,scores,cls:report.audits['cumulative-layout-shift'].numericValue,lcpMs:report.audits['largest-contentful-paint'].numericValue,lighthouseVersion:report.lighthouseVersion,fetchTime:report.fetchTime,url:report.finalDisplayedUrl};
 summary.push(result);console.log(JSON.stringify(result));
}
await writeFile(out+'lighthouse-summary.json',JSON.stringify(summary,null,2)+'\n');
if(summary.some(r=>Object.values(r.scores).some(score=>score<95)))process.exitCode=1;
