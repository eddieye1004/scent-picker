import fs from 'node:fs'; import {createHash} from 'node:crypto'; import {PORTRAITS} from '../scripts/lib/gold-portraits.mjs';
const data=JSON.parse(fs.readFileSync('data/affiliate-links.json','utf8'));
const gold=[...new Set(PORTRAITS.flatMap(p=>p.gold))]; const rows=[];
for(const [id,url] of Object.entries(data.taobao||{})){
 let parsed; try{parsed=new URL(url)}catch{}
 const params=new URLSearchParams(parsed?.search||'');
 rows.push({id,platform:'taobao',host:parsed?.hostname||null,path:parsed?.pathname||null,explicitPid:params.get('pid')||null,opaqueE:params.has('e'),verdict:'无法判定',reason:'s.click e payload opaque; optional.upgrade returns a new click URL, not attribution for this existing URL; item.convert permission denied; no per-item App-UA result for this id',urlSha256:createHash('sha256').update(url).digest('hex'),gold:gold.includes(id)});
}
const jd=Object.entries(data.jd||{}).map(([id,url])=>({id,platform:'jd',host:new URL(url).hostname,urlSha256:createHash('sha256').update(url).digest('hex'),verdict:'不适用淘宝pid；京东名义条目',reason:'JD short link is not a Taobao PID attribution record'}));
const out={generatedAt:new Date().toISOString(),counts:{taobao:rows.length,jd:jd.length,goldUnique:gold.length,goldWithTaobao:rows.filter(x=>x.gold).length,goldWithoutTaobao:gold.filter(x=>!rows.some(r=>r.id===x)).length,explicitPid:rows.filter(x=>x.explicitPid).length},rows:[...rows,...jd]};
fs.writeFileSync('_probe/pid-audit-url-inventory.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out.counts)); console.log('JD',JSON.stringify(jd));
