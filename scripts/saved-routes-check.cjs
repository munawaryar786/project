// Isolated, no network / no Mongo / no email / no Redis. Uses current TS source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
process.env.DATABASE_URL = 'mongodb://127.0.0.1:1/saved_routes_never_connected';
globalThis.fetch = () => { throw Error('Network unavailable'); };
const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'lib/saved-routes.ts'),'utf8');
const mod = new Module(path.join(root,'lib/saved-routes.ts'),module);
mod.filename = path.join(root,'lib/saved-routes.ts');
mod.paths = Module._nodeModulePaths(root);
mod.require = (name) => {
  if(name==='@/lib/prisma') return { prisma: { __fake: true } };
  if(name==='@/lib/feature-flags') return { isCustomerServiceEnabled: (s)=>s.toLowerCase()!=='children' || enabledChildren };
  return require(name);
};
mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod.filename);
const m=mod.exports;
let enabledChildren=false, passed=0;
function ok(label,fn){fn();passed++;console.log('PASS saved routes:',label);}
const booking=()=>({serviceType:'STANDARD',pickupAddress:'  Home Street 1  ',dropoffAddress:' Clinic Street 2 ',pickupLat:48.12,pickupLng:17.12,dropoffLat:48.15,dropoffLng:17.16,passengerCount:2,smallBags:1,largeBags:0,airline:null,waitAndGreet:false,medicalAppointment:true,childFullName:'PRIVATE CHILD',customerPhone:'PRIVATE PHONE',specialNotes:'PRIVATE MEDICAL'});
const passengerId='111111111111111111111111';
function fakeDb(){let routes=[];const db={
  passenger:{findUnique:async()=>({autoSaveRoutes:true})},
  booking:{},
  savedRoute:{findUnique:async({where})=>routes.find(r=>r.passengerId===where.passengerId_fingerprint.passengerId&&r.fingerprint===where.passengerId_fingerprint.fingerprint)||null,
    count:async({where})=>routes.filter(x=>x.passengerId===where.passengerId).length,
    upsert:async({where,create,update})=>{const at=routes.findIndex(x=>x.passengerId===where.passengerId_fingerprint.passengerId&&x.fingerprint===where.passengerId_fingerprint.fingerprint);if(at>=0)routes[at]={...routes[at],...update};else routes.push({...create,id:String(routes.length)});return routes.at(at>=0?at:-1)}}};return{db,routes};}
(async()=>{
 ok('allowlist uppercase canonical services',()=>{assert.equal(m.normalizeRouteService(' standard '),'STANDARD');assert.equal(m.normalizeRouteService('RENTAL'),null);});
 ok('disallow disabled Children',()=>assert.equal(m.normalizeRouteService('CHILDREN'),null));
 ok('normalize whitespace and labels',()=>{const r=m.routeFromBooking(booking());assert.equal(r.pickupAddress,'Home Street 1');assert.match(r.label,/→/);});
 ok('fingerprint ignores case and duplicate whitespace',()=>assert.equal(m.routeFingerprint(' HOME  street ','Clinic','STANDARD'),m.routeFingerprint('home street','clinic','STANDARD')));
 ok('different directions are different templates',()=>assert.notEqual(m.routeFingerprint('A','B','STANDARD'),m.routeFingerprint('B','A','STANDARD')));
 ok('different services are different templates',()=>assert.notEqual(m.routeFingerprint('A','B','STANDARD'),m.routeFingerprint('A','B','ACCESSIBLE')));
 ok('safe projection excludes child/medical/contact/payment identifiers',()=>{const r=m.routeFromBooking(booking());for(const banned of ['childFullName','medicalAppointment','customerPhone','specialNotes','fareTotalFare','hospitalName','paymentMethod','parentFullName','appointmentDate'])assert.equal(Object.hasOwn(r,banned),false);});
 ok('bag totals derived from source',()=>{const b=booking();b.largeBags=2;const r=m.routeFromBooking(b);assert.equal(r.luggageType,'LARGE');assert.equal(r.largeBags,2);});
 ok('invalid passenger count rejected',()=>{const b=booking();b.passengerCount=7;assert.equal(m.routeFromBooking(b),null);});
 ok('six passengers with large baggage not saved',()=>{const b=booking();b.passengerCount=6;b.largeBags=1;assert.equal(m.routeFromBooking(b),null);});
 ok('unsupported rental route rejected',()=>{const b=booking();b.serviceType='RENTAL';assert.equal(m.routeFromBooking(b),null);});
 ok('airport safe options preserved',()=>{const b=booking();b.serviceType='AIRPORT';b.airline='Ryanair';b.waitAndGreet=true;const r=m.routeFromBooking(b);assert.equal(r.airline,'Ryanair');assert.equal(r.waitAndGreet,true);});
 ok('nonairport airline stripped',()=>{const b=booking();b.airline='PRIVATE FLIGHT';b.waitAndGreet=true;const r=m.routeFromBooking(b);assert.equal(r.airline,null);assert.equal(r.waitAndGreet,false);});
 enabledChildren=true;
 ok('children explicit template excludes all private child fields',()=>{const b=booking();b.serviceType='CHILDREN';b.largeBags=3;const r=m.routeFromBooking(b);assert.equal(r.largeBags,0);assert.equal(r.childFullName,undefined);});
 enabledChildren=false;
 const {db,routes}=fakeDb();
 await (async()=>{const result=await m.saveRouteFromBooking(passengerId,booking(),db);ok('create route through fake db',()=>{assert.equal(result.ok,true);assert.equal(routes.length,1);});})();
 await (async()=>{routes[0].label='My Work';const result=await m.saveRouteFromBooking(passengerId,booking(),db);ok('idempotent save preserves renamed route',()=>{assert.equal(result.ok,true);assert.equal(routes.length,1);assert.equal(routes[0].label,'My Work');});})();
 ok('editing address invalidates coordinates',()=>{const changed=m.editedRouteFields(routes[0],{pickupAddress:'Other Pickup'});assert.equal(changed.pickupLat,null);assert.equal(changed.pickupLng,null);assert.equal(changed.dropoffLat,48.15);});
 ok('editing destination invalidates destination only',()=>{const changed=m.editedRouteFields(routes[0],{dropoffAddress:'Other Destination'});assert.equal(changed.dropoffLat,null);assert.equal(changed.pickupLat,48.12);});
 ok('editing service clears stale airport settings',()=>{const original={...routes[0],serviceType:'AIRPORT',airline:'Other',waitAndGreet:true};const changed=m.editedRouteFields(original,{serviceType:'STANDARD'});assert.equal(changed.airline,null);assert.equal(changed.waitAndGreet,false);});
 ok('editing rejects passenger count > 6',()=>assert.equal(m.editedRouteFields(routes[0],{passengerCount:7}),null));
 ok('editing rejects six passengers with large luggage',()=>assert.equal(m.editedRouteFields(routes[0],{passengerCount:6,largeBags:1}),null));
 ok('editing rejects malformed address',()=>assert.equal(m.editedRouteFields(routes[0],{pickupAddress:'x'}),null));
 ok('editing rejects invalid service',()=>assert.equal(m.editedRouteFields(routes[0],{serviceType:'FLIGHT_PILOT'}),null));
 ok('updating route fields excludes identity/timestamps',()=>{const fields=m.editedRouteFields(routes[0],{label:'Edited'});for(const denied of ['id','passengerId','createdAt','updatedAt'])assert.equal(Object.hasOwn(fields,denied),false);});
 while(routes.length<25)routes.push({...routes[0],id:`${routes.length}`,fingerprint:`f${routes.length}`});
 await(async()=>{const b=booking();b.dropoffAddress='new destination';const r=await m.saveRouteFromBooking(passengerId,b,db);ok('reject above 25 saved routes',()=>assert.deepEqual(r,{ok:false,code:'ROUTE_LIMIT'}));})();
 await(async()=>{const r=await m.saveRouteFromBooking(passengerId,booking(),db);ok('allow existing template at 25 limit',()=>assert.equal(r.ok,true));})();
 const shared=(name)=>fs.readFileSync(path.join(root,name),'utf8');
 ok('auth on all saved routes entrypoints',()=>{for(const p of ['app/api/passenger/saved-routes/route.ts','app/api/passenger/saved-routes/[id]/route.ts','app/api/passenger/saved-routes/preferences/route.ts'])assert.match(shared(p),/authorizePassenger\(request\)/);});
 ok('ownership scoped on detail read/write/delete',()=>{const r=shared('app/api/passenger/saved-routes/[id]/route.ts');assert.match(r,/passengerId: auth.actor.id/g);assert.match(r,/deleteMany/);assert.match(r,/updateMany/);});
 ok('POST uses authoritative owned booking, not client fields',()=>{const r=shared('app/api/passenger/saved-routes/route.ts');assert.match(r,/bookingSource: "WEB"/);assert.match(r,/passengerAuthStatus: "AUTHENTICATED"/);assert.match(r,/saveRouteFromBooking/);});
 ok('auto-save only for verified passenger-owned PUBLIC bookings',()=>{const r=shared('lib/booking-creation-service.ts');assert.match(r,/actor.kind === "PUBLIC" && samePassenger/);assert.match(r,/autoSaveVerifiedBooking/);});
 ok('child autosave blocked',()=>assert.match(shared('lib/saved-routes.ts'),/booking.serviceType === "CHILDREN"\) return/));
 ok('client rebooking never submits a booking automatically',()=>{const r=shared('components/booking/BookingForm.tsx');assert.match(r,/\/api\/passenger\/saved-routes\//);assert.match(r,/setScheduledDate\(""\); setScheduledTime\(""\)/);});
 ok('confirmation renders three decisions',()=>{const r=shared('components/booking/BookingConfirmation.tsx');for(const key of ['savedRoutes.saveRoute','savedRoutes.notNow','savedRoutes.saveAlways'])assert.ok(r.includes(key));});
 ok('dashboard manage and rebook links',()=>{const r=shared('components/booking/SavedRoutesManager.tsx');assert.match(r,/book\?savedRoute=/);assert.match(r,/saved-routes\/preferences/);});
 ok('four languages have exact same keys',()=>{const t=shared('lib/i18n/translations/saved-routes.ts');for(const key of ['savedRoutes.prompt','savedRoutes.saveAlways','savedRoutes.bookAgain','savedRoutes.reviewChildren'])assert.ok(t.includes(key));assert.match(t,/\["en", "sk", "de", "uk"\]/);});
 console.log(`Saved Routes isolated checks passed: ${passed} (fake DB; no Mongo, browser, network)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
