import fs from 'node:fs';
import { buildTaobaoParams, TAOBAO_GATEWAY, gmt8Timestamp } from '../scripts/lib/union-api.mjs';
const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if(m) env[m[1]]=m[2].replace(/^['"]|['"]$/g,''); }
for(const k of ['TB_APP_KEY','TB_APP_SECRET','TB_ADZONE_ID']) if(!env[k]) throw new Error(`missing ${k}`);
const methods=['taobao.tbk.dg.material.optional','taobao.tbk.dg.material.optional.upgrade','taobao.tbk.dg.optimus.material','taobao.tbk.item.convert','taobao.tbk.dg.newuser.order.get'];
const rows=[];
for(const method of methods){
 const biz={adzone_id:env.TB_ADZONE_ID,q:'Dior',page_no:1,page_size:1,num_iids:'611446979513',platform:2};
 const params=buildTaobaoParams({appKey:env.TB_APP_KEY,secret:env.TB_APP_SECRET,method,biz,timestamp:gmt8Timestamp()});
 const response=await fetch(TAOBAO_GATEWAY,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=utf-8'},body:new URLSearchParams(params)});
 const body=await response.text(); let parsed; try{parsed=JSON.parse(body)}catch{}
 const error=parsed?.error_response||null;
 rows.push({method,httpStatus:response.status,ok:response.ok,errorCode:error?.code??null,errorSubCode:error?.sub_code??null,errorMessage:error?.msg??null,errorSubMessage:error?.sub_msg??null,requestId:error?.request_id??null,response:parsed||body});
}
fs.writeFileSync('_probe/pid-audit-api-responses.json',JSON.stringify({checkedAt:new Date().toISOString(),calls:rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(({method,httpStatus,errorCode,errorSubCode,errorMessage,errorSubMessage,requestId})=>({method,httpStatus,errorCode,errorSubCode,errorMessage,errorSubMessage,requestId})),null,2));
