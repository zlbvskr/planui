import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker({failFetch=false,failWrite=false}={}) {
  const events={}, entries=new Map(), deleted=[], opened=[];
  const prefix='planui-assets-%2Fplanui%2F-';
  const self={registration:{scope:'https://example.test/planui/',active:{}},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,handler)=>events[name]=handler};
  const caches={open:async name=>{opened.push(name);return {put:async(req,res)=>{if(failWrite)throw Error('quota');entries.set(typeof req==='string'?req:req.url,res);},match:async key=>entries.get(typeof key==='string'?key:key.url)};},keys:async()=>[`${prefix}old`,'other-app','planui-assets-%2Fother%2F-old'],delete:async name=>{deleted.push(name);return true;}};
  const fetch=async req=>{if(failFetch)throw Error('network');return new Response(typeof req==='string'?req:req.url);};
  runInNewContext(source,{self,caches,fetch,URL,Request,Response,Set,Error});
  const wait=name=>{let task;events[name]({waitUntil:p=>task=p});return task;};
  return {events,entries,deleted,opened,wait,prefix};
}
test('worker leaves sibling apps, other origins, unknown assets and writes to the network',()=>{
  const w=worker();
  for(const [url,method] of [['https://example.test/outside','GET'],['https://example.test/planui-other/x','GET'],['https://external.test/planui/x','GET'],['https://example.test/planui/api','GET'],['https://example.test/planui/index.html','POST']]) {
    let handled=false;w.events.fetch({request:new Request(url,{method}),respondWith:()=>handled=true});assert.equal(handled,false,url);
  }
});
test('worker stages complete assets and removes only outdated caches for its own scope',async()=>{
  const w=worker();await w.wait('install');assert.equal(w.entries.size,8);await w.wait('activate');assert.deepEqual(w.deleted,[`${w.prefix}old`]);
});
test('failed install never opens a cache; quota failure removes its partial staging cache',async()=>{
  const network=worker({failFetch:true});await assert.rejects(network.wait('install'));assert.equal(network.opened.length,0);
  const quota=worker({failWrite:true});await assert.rejects(quota.wait('install'));assert.deepEqual(quota.deleted,[`${quota.prefix}dev-v1`]);
});
test('navigation serves the installed shell and does not mix it with a newly deployed index',async()=>{
  const w=worker();w.entries.set('/planui/index.html',new Response('installed shell'));let reply;
  const request={method:'GET',url:'https://example.test/planui/',mode:'navigate'};
  w.events.fetch({request,respondWith:p=>reply=p});assert.equal(await(await reply).text(),'installed shell');
});
