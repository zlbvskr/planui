import {createZipArchive} from '../backup/zipCodec';
import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {WishItem, Project} from '../../domain/types';
import {PLANUI_DB_SCHEMA_VERSION} from '../../domain/types';
import {parseLocalizedPriceInput,formatExactPriceUk,validateExactPriceObject,buildWishItemRecord,getWishPurchaseStatus,setWishPurchaseStatus,filterAndGroupWishes,setWishArchivedState} from '../../domain/wishlist';
import {validateWishItemRecord,validateDomainSnapshot,MAX_SINGLE_MEDIA_BYTES} from '../../domain/validation';
import {validateAndPrepareRasterMedia,buildInspirationItemRecord} from '../../domain/personalSpace';
import {InMemoryTransactionalEngine,STORE_NAMES} from '../db';
import {PlanuiRepositories} from '../repositories';
import {exportFullBackupZip,validateBackupArchive,executeAtomicBackupReplacement,migrateSupportedDomainSnapshot} from '../backup/backupService';
const now='2026-11-04T15:00:00.000Z',later='2026-11-05T15:00:00.000Z';
const wish=(id='wish'):WishItem=>buildWishItemRecord({id,title:'Моя річ',nowIso:now}).wish;
function legacy(id='legacy'):WishItem{return {...wish(id),note:'  Оригінальна нотатка\n',timing:'someday',estimatedPrice:{amountMinor:120,amountDecimal:'001.20',currency:'UAH'},state:'fulfilled',fulfilledAt:'2024-02-29T21:17:00.000Z',archived:true,revision:4};}
async function fixture(){const engine=new InMemoryTransactionalEngine(),repos=new PlanuiRepositories(engine);await repos.getOrInitSettings(now);return {engine,repos};}
const snap=async(repos:PlanuiRepositories)=>(await repos.captureCoherentSnapshot(now)).snapshot;
const filtered=(wishes:WishItem[],viewScope:any,categoryFilter:any='all',timingFilter:any='all')=>filterAndGroupWishes({wishes,viewScope,categoryFilter,timingFilter});
async function image(id='image'){return validateAndPrepareRasterMedia({id,bytes:new Uint8Array(await readFile(new URL('../../../public/pwa-192x192.png',import.meta.url))),declaredMimeType:'image/png',nowIso:now});}
function project(folderId:string|null):Project{return {id:'project',title:'Проєкт',description:null,desiredOutcome:null,completionCriteria:null,targetDate:null,folderId,goalId:null,lifeAreaId:null,collaboratorText:null,state:'active',archived:false,createdAt:now,updatedAt:now,completedAt:null,revision:1};}
describe('M9 revised Wishlist and purchases',()=>{
 it('round-trips comma/dot decimal and every supported minor-unit boundary exactly',()=>{
  for(const raw of ['1,20','1.20','001,2','01.20'])assert.deepEqual(parseLocalizedPriceInput(raw,'UAH'),{amountMinor:120,amountDecimal:'1.20',currency:'UAH'});
  assert.equal(parseLocalizedPriceInput('1 234,56','EUR')?.amountMinor,123456);assert.equal(parseLocalizedPriceInput('1\u202f234.56','EUR')?.amountDecimal,'1234.56');
  const maximum=parseLocalizedPriceInput('90071992547409,91','UAH')!;assert.equal(maximum.amountMinor,Number.MAX_SAFE_INTEGER);assert.equal(maximum.amountDecimal,'90071992547409.91');assert.deepEqual(validateExactPriceObject(maximum),maximum);
  assert.equal(formatExactPriceUk(maximum)?.replace(/\s/g,''),'90071992547409,91UAH');
  const jpy=parseLocalizedPriceInput('9007199254740991','JPY')!;assert.equal(formatExactPriceUk(jpy)?.replace(/\s/g,''),'9007199254740991JPY');assert.throws(()=>parseLocalizedPriceInput('90071992547409.92','UAH'));
 });
 it('distinguishes absent, zero, ambiguous and invalid prices without rounding',()=>{
  assert.equal(parseLocalizedPriceInput(undefined,undefined),null);assert.equal(parseLocalizedPriceInput('   ',null),null);assert.equal(parseLocalizedPriceInput('0','UAH')?.amountMinor,0);assert.equal(formatExactPriceUk(parseLocalizedPriceInput('0','UAH')),'0,00 UAH');
  for(const raw of ['1 2','12 34','1,234','1.234','1,234.56','1.234,56','1\t234','-0','NaN','Infinity','1e3','.50','0,001'])assert.throws(()=>parseLocalizedPriceInput(raw,'UAH'),raw);
  assert.throws(()=>parseLocalizedPriceInput('1.0','JPY'));assert.throws(()=>parseLocalizedPriceInput('0',null));assert.throws(()=>validateExactPriceObject({amountMinor:1.2,amountDecimal:'0.01',currency:'UAH'}));
 });
 it('keeps title-only creation minimal and never creates planning or accounting records',async()=>{
  const {repos}=await fixture();const item=wish();assert.equal(item.timing,'later');assert.equal(item.estimatedPrice,null);assert.equal(getWishPurchaseStatus(item),'want');await repos.saveWishItem(item);
  const result=await snap(repos);assert.equal(result.wishes.length,1);assert.equal(result.tasks.length,0);assert.equal(result.events.length,0);assert.equal(result.reservations.length,0);assert.equal(result.projects.length,0);
 });
 it('preserves legacy fulfillment/archive data without inferring purchase or purchase timestamps',async()=>{
  const {repos}=await fixture();const old=legacy();await repos.saveWishItem(old);const result=await snap(repos);assert.deepEqual(result.wishes[0],{...old,revision:1});assert.equal(getWishPurchaseStatus(old),'legacy_fulfilled');assert.equal(old.purchasedAt,undefined);
  const changed=setWishPurchaseStatus(old,'purchased',now);assert.equal(changed.purchasedAt,now);assert.equal(changed.fulfilledAt,old.fulfilledAt);assert.equal(changed.state,'fulfilled');assert.equal(changed.archived,true);assert.deepEqual(changed.estimatedPrice,old.estimatedPrice);
  const inactive=setWishPurchaseStatus(changed,'not_relevant',later);assert.equal(inactive.purchasedAt,now);assert.equal(inactive.fulfilledAt,old.fulfilledAt);assert.equal(inactive.timing,old.timing);
 });
 it('separates active/purchased/no-longer-relevant/legacy/archive scopes and keeps time metadata',()=>{
  const want=wish('want'),bought=setWishPurchaseStatus(wish('bought'),'purchased',now),irrelevant=setWishPurchaseStatus(wish('irrelevant'),'not_relevant',now),old={...legacy(),archived:false},archived=setWishArchivedState(bought,true,later);
  const records=[want,bought,irrelevant,old];assert.deepEqual(filtered(records,'active').wishes,[want]);assert.deepEqual(filtered(records,'purchased').wishes,[bought]);assert.deepEqual(filtered(records,'not_relevant').wishes,[irrelevant]);assert.deepEqual(filtered(records,'fulfilled').wishes,[old]);assert.deepEqual(filtered([archived],'archived').wishes,[archived]);assert.equal(filtered([archived],'purchased').wishes.length,0);assert.equal(archived.purchasedAt,now);assert.equal(archived.timing,'later');
 });
 it('keeps arbitrary category names independent from timing and preserves wishes when deleting categories',async()=>{
  const {repos}=await fixture();for(const [id,name,order] of [['now','Зараз',0],['later','Пізніше',1],['other','Мої дивні категорії',2]] as const)await repos.saveWishlistCategory({id,name,order,createdAt:now,updatedAt:now,revision:1});
  const item={...wish(),categoryId:'now',timing:'later' as const};await repos.saveWishItem(item);assert.equal(filtered([item],'active','now','now').wishes.length,0);assert.equal(filtered([item],'active','now','later').wishes.length,1);
  await repos.reorderWishlistCategoriesTransactionally(['other','later','now'],later);let result=await snap(repos);assert.deepEqual([...result.wishlistCategories].sort((a,b)=>a.order-b.order).map(c=>c.id),['other','later','now']);
  const category=result.wishlistCategories.find(c=>c.id==='now')!;await repos.saveWishlistCategory({...category,name:'Колись'},category.revision);assert.equal((await snap(repos)).wishes[0].timing,'later');
  await repos.deleteWishlistCategoryTransactionally('now',later);result=await snap(repos);assert.equal(result.wishes.length,1);assert.equal(result.wishes[0].categoryId,null);assert.equal(result.wishes[0].timing,'later');await assert.rejects(repos.reorderWishlistCategoriesTransactionally(['other'],now));
 });
 it('retains exact historical prices on note/default edits and requires explicit currency reinterpretation',async()=>{
  const {repos}=await fixture();const item={...legacy('priced'),state:'active' as const,fulfilledAt:null,archived:false};await repos.saveWishItem(item);const saved=(await snap(repos)).wishes[0];
  const noteEdit=buildWishItemRecord({id:saved.id,title:saved.title,existingWish:saved,note:'Нова нотатка',preferredCurrency:'EUR',nowIso:later}).wish;assert.deepEqual(noteEdit.estimatedPrice,saved.estimatedPrice);await repos.saveWishItem(noteEdit,saved.revision);
  assert.deepEqual(buildWishItemRecord({id:saved.id,title:saved.title,existingWish:saved,rawPriceAmount:'001,20',currencyCode:'UAH',nowIso:later}).wish.estimatedPrice,saved.estimatedPrice);
  await repos.updateSettingsPatch({preferredWishlistCurrency:'USD'});assert.deepEqual((await snap(repos)).wishes[0].estimatedPrice,saved.estimatedPrice);assert.equal(buildWishItemRecord({id:'new',title:'Нове',rawPriceAmount:'0',preferredCurrency:'USD',nowIso:now}).wish.estimatedPrice?.currency,'USD');
  assert.throws(()=>buildWishItemRecord({id:saved.id,title:saved.title,existingWish:saved,rawPriceAmount:'1,20',currencyCode:'EUR',nowIso:later}));
  const current=(await snap(repos)).wishes[0];const untouched=buildWishItemRecord({id:saved.id,title:saved.title,note:saved.note,existingWish:saved,rawPriceAmount:'001,20',currencyCode:'UAH',nowIso:later}).wish;assert.equal(untouched.note,saved.note);assert.deepEqual(untouched.estimatedPrice,saved.estimatedPrice);
  const changed=buildWishItemRecord({id:current.id,title:current.title,existingWish:current,rawPriceAmount:'1,20',currencyCode:'EUR',confirmCurrencyChange:true,nowIso:later}).wish;
  await assert.rejects(repos.saveWishItem(changed,current.revision));await repos.saveWishItem(changed,current.revision,{confirmCurrencyChange:true});assert.deepEqual((await snap(repos)).wishes[0].estimatedPrice,{amountMinor:120,amountDecimal:'1.20',currency:'EUR'});
 });
 it('keeps canonical project links on project moves and safely unlinks on explicit deletion',async()=>{
  const {repos}=await fixture();for(const id of ['a','b'])await repos.saveFolder({id,name:id,parentId:null,order:0,createdAt:now,updatedAt:now,revision:1});await repos.saveProject(project('a'));await repos.saveWishItem({...wish(),projectId:'project'});const before=(await snap(repos)).wishes[0];
  await repos.saveProject({...project('b'),updatedAt:later},1);assert.deepEqual((await snap(repos)).wishes[0],before);await repos.deleteProjectTransactionally('project','rehome_to_folder',later);assert.equal((await snap(repos)).wishes[0].projectId,null);assert.equal((await snap(repos)).tasks.length,0);validateDomainSnapshot(await snap(repos));
 });
 it('rejects unsafe links and missing media/project references, permitting user-entered HTTP/S',async()=>{
  const {repos}=await fixture();for(const linkUrl of ['javascript:alert(1)','data:text/html,x','file:///tmp/test','//example.com'])await assert.rejects(repos.saveWishItem({...wish(),linkUrl}));
  await repos.saveWishItem({...wish(),linkUrl:'https://example.com/item'});await assert.rejects(repos.saveWishItem({...wish('missing'),mediaId:'gone'}));await assert.rejects(repos.saveWishItem({...wish('missing'),projectId:'gone'}));
  const result=await snap(repos);assert.equal(result.wishes.length,1);assert.throws(()=>validateWishItemRecord({...wish(),purchaseStatus:'bad' as any}));assert.throws(()=>validateWishItemRecord({...wish(),purchaseStatus:'purchased'}));assert.throws(()=>validateDomainSnapshot({...result,wishes:[{...wish(),mediaId:'gone'}]}));
 });
 it('round-trips local raster bytes and every status with disabled-module ZIP export/import',async()=>{
  const {repos}=await fixture();const media=await image();await repos.saveWishItem({...wish('image-wish'),mediaId:media.meta.id,linkUrl:'https://example.com/'},undefined,{media});await repos.saveWishItem(legacy());await repos.saveWishItem(setWishPurchaseStatus(wish('bought'),'purchased',now));await repos.saveWishItem(setWishPurchaseStatus(wish('irrelevant'),'not_relevant',now));
  const settings=(await snap(repos)).settings;await repos.saveSettings({...settings,modules:{...settings.modules!,wishlistEnabled:false,userConfigured:true}},settings.revision);const before=await snap(repos);const backup=await exportFullBackupZip(repos,now);assert.equal(backup.manifest.backupVersion,9);
  const target=new PlanuiRepositories(new InMemoryTransactionalEngine());await executeAtomicBackupReplacement(target,await validateBackupArchive(backup.zipBytes),{explicitUserConfirmation:true,nowIso:now});const restored=await target.captureCoherentSnapshot(now);assert.deepEqual(restored.snapshot.wishes,before.wishes);assert.equal(restored.snapshot.settings.modules?.wishlistEnabled,false);assert.deepEqual(restored.mediaBlobs.get(media.meta.id),media.bytes);assert.equal(restored.snapshot.wishes.find(w=>w.id==='legacy')?.purchasedAt,undefined);
 });
 it('retains shared images across inspiration/wish deletion and releases only the final unreferenced asset',async()=>{
  const {repos}=await fixture();const media=await image();await repos.saveInspirationWithMediaTransactionally(buildInspirationItemRecord({id:'inspiration',kind:'image',mediaId:media.meta.id,nowIso:now}),media);await repos.saveWishItem({...wish(),mediaId:media.meta.id});assert.equal((await repos.deleteInspirationItemTransactionally('inspiration',later)).deletedMediaAsset,false);assert.equal((await snap(repos)).mediaMeta.length,1);
  await repos.deleteWishItemTransactionally('wish',later);const result=await repos.captureCoherentSnapshot(now);assert.equal(result.snapshot.mediaMeta.length,0);assert.equal(result.mediaBlobs.size,0);
 });
 it('keeps recovery-snapshot images even after their live wish is explicitly deleted',async()=>{
  const {repos}=await fixture();const media=await image();await repos.saveWishItem({...wish(),mediaId:media.meta.id},undefined,{media});const backup=await exportFullBackupZip(repos,now);await executeAtomicBackupReplacement(repos,await validateBackupArchive(backup.zipBytes),{explicitUserConfirmation:true,nowIso:later});assert.equal((await repos.listRecoverySnapshots()).length,1);await repos.deleteWishItemTransactionally('wish',later);assert.deepEqual((await repos.captureCoherentSnapshot(now)).mediaBlobs.get(media.meta.id),media.bytes);
 });
 it('replaces a wish image safely and rolls back media writes when storage fails',async()=>{
  const {repos,engine}=await fixture();const first=await image('one'),second=await image('two');await repos.saveWishItem({...wish(),mediaId:first.meta.id},undefined,{media:first});const old=(await snap(repos)).wishes[0];await repos.saveWishItem({...old,mediaId:second.meta.id},old.revision,{media:second});let result=await repos.captureCoherentSnapshot(now);assert.equal(result.mediaBlobs.has('one'),false);assert.deepEqual(result.mediaBlobs.get('two'),second.bytes);
  const third=await image('three');const failing=new PlanuiRepositories({dbName:engine.dbName,close:()=>engine.close(),runTransaction:(stores,mode,work)=>engine.runTransaction(stores,mode,tx=>work({...tx,put:async(store,record)=>{if(store===STORE_NAMES.mediaBlobs)throw Error('Quota exceeded');await tx.put(store,record);}}))});await assert.rejects(failing.saveWishItem({...wish('failure'),mediaId:third.meta.id},undefined,{media:third}));result=await repos.captureCoherentSnapshot(now);assert.equal(result.snapshot.wishes.length,1);assert.equal(result.mediaBlobs.has('three'),false);assert.equal(result.snapshot.mediaMeta.some(m=>m.id==='three'),false);
 });
 it('preserves old fulfilled and archived records byte-for-byte through supported migrations',async()=>{
  const {repos}=await fixture();await repos.saveWishItem(legacy());const source=await snap(repos);const exported=await exportFullBackupZip(repos,now);for(const version of [1,2,3,4,5,6,7]){const old={...source,settings:{...source.settings,dbSchemaVersion:version}};const migrated=migrateSupportedDomainSnapshot(old,{...exported.manifest,backupVersion:version,dbSchemaVersion:version}).snapshot;assert.deepEqual(migrated.wishes,source.wishes);assert.equal(migrated.wishes[0].purchasedAt,undefined);assert.equal(migrated.settings.dbSchemaVersion,PLANUI_DB_SCHEMA_VERSION);validateDomainSnapshot(migrated);}
 });
 it('rejects malformed/oversized local media and stale edits without losing the saved wish',async()=>{
  const {repos}=await fixture();await repos.saveWishItem(wish());await assert.rejects(repos.saveWishItem({...wish(),title:'Старе редагування'},99));assert.equal((await snap(repos)).wishes[0].title,'Моя річ');await repos.deleteWishItemTransactionally('wish',now);await assert.rejects(repos.saveWishItem(wish(),1));
  await assert.rejects(validateAndPrepareRasterMedia({id:'bad',bytes:new TextEncoder().encode('<svg><script>x</script></svg>'),declaredMimeType:'image/png',nowIso:now}));await assert.rejects(validateAndPrepareRasterMedia({id:'huge',bytes:new Uint8Array(MAX_SINGLE_MEDIA_BYTES+1),declaredMimeType:'image/png',nowIso:now}));assert.equal((await snap(repos)).wishes.length,0);
 });
 it('exports ZIP while its compression stream applies backpressure', {timeout:2000}, async()=>{
  const original=globalThis.CompressionStream;
  // Force writes to wait for a reader, reproducing Chromium's export stall.
  globalThis.CompressionStream=class {readable:ReadableStream;writable:WritableStream;constructor(){const stream=new TransformStream();this.readable=stream.readable;this.writable=stream.writable;}} as typeof CompressionStream;
  try{const zip=await createZipArchive([{path:'data.json',bytes:new TextEncoder().encode('{"note":"Бажання"}')}]);assert.equal(new DataView(zip.buffer).getUint32(0,true),0x04034b50);}finally{globalThis.CompressionStream=original;}
 });

});
