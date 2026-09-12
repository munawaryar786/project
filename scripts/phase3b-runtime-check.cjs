// Isolated behavioral gate. Real TS services/routes with a snapshot/CAS fake database.
// This simulates rollback/write conflicts; it is NOT a Mongo integration/concurrency test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/phase3b_never_connected";
globalThis.fetch = async () => { throw new Error("Network forbidden in isolated gate"); };
const { NextRequest, NextResponse } = require("next/server");
const A = "111111111111111111111111", B = "222222222222222222222222";
const X = "333333333333333333333333", Y = "444444444444444444444444";
const OA = "555555555555555555555555", OB = "666666666666666666666666";
let state, revision = 0, failAt, authorized = true, actorId = A, passes = 0;
function reset() {
  revision = 0; failAt = null; authorized = true; actorId = A;
  state = { driver: [A,B].map(id => ({id, status:"ACTIVE", fullName:"Driver", isOnline:true, isOnTrip:false,
      currentLat:48.1,currentLng:17.1,lastLocationReceivedAt:new Date(),lastLocationUpdate:new Date()})),
    booking: [{id:X,bookingRef:"TEST",driverId:null,status:"CONFIRMED",paymentMethod:"CASH",cashAgreed:true,
      estimatedPrice:125,fareTotalFare:123,serviceType:"STANDARD",scheduledDate:"2000-01-01",scheduledTime:"10:00",
      pickupAddress:"Secret apartment, Secret building, Secret street",dropoffAddress:"Other secret",
      customerPhone:"private-phone",customerName:"Rider",passengerAuthStatus:"PRIVATE_AUTH",specialNotes:"PRIVATE_ADMIN"}],
    rideRequest: [{id:OA,driverId:A,bookingId:X,status:"PENDING",expiresAt:new Date(Date.now()+60000)},
      {id:OB,driverId:B,bookingId:X,status:"PENDING",expiresAt:new Date(Date.now()+60000)}],
    outboxEvent:[],driverEarning:[],commissionConfig:[],pricingSettings:[] };
}
function matches(row, where={}) {
  return Object.entries(where).every(([k,v]) => {
    if (k==="AND") return (Array.isArray(v)?v:[v]).every(w=>matches(row,w));
    if (k==="OR") return v.some(w=>matches(row,w));
    if (k==="NOT") return !matches(row,v);
    const x=row[k];
    if (v && typeof v==="object" && !(v instanceof Date)) return Object.entries(v).every(([op,val]) => {
      if(op==="in") return val.includes(x);
      if(op==="notIn") return !val.includes(x);
      if(op==="not") return x!==val;
      if(op==="isSet") return (x!==undefined)===val;
      if(op==="gt") return x>val;
      if(op==="lte") return x<=val;
      if(op==="equals") return x===val;
      throw new Error("Unhandled fake predicate "+op);
    });
    return x===v;
  });
}
function project(row, args, data) {
  if(!row) return null;
  const result=structuredClone(row);
  if(args.include?.driver) result.driver=data.driver.find(d=>d.id===row.driverId)||null;
  if(!args.select) return result;
  return Object.fromEntries(Object.entries(args.select).map(([k,v]) => [k, typeof v==="object"
    ? (k==="earning" ? project(data.driverEarning.find(e=>e.bookingId===row.id),v,data) : null)
    : result[k] ?? null]));
}
function dbFor(data, write=()=>{}) {
  return Object.fromEntries(Object.keys(data).map(model=>[model,{
    findUnique: async args=>project(data[model].find(r=>matches(r,args.where)),args,data),
    findFirst: async args=>project(data[model].find(r=>matches(r,args.where)),args,data),
    findMany: async args=>data[model].filter(r=>matches(r,args?.where)).map(r=>project(r,args||{},data)),
    updateMany: async ({where,data:change})=>{
      if(failAt===model+".updateMany") throw Error("injected failure");
      const rows=data[model].filter(r=>matches(r,where)); if(rows.length)write();
      rows.forEach(r=>Object.assign(r,structuredClone(change))); return {count:rows.length};
    },
    update: async args=>{
      if(failAt===model+".update") throw Error("injected failure");
      const row=data[model].find(r=>matches(r,args.where)); if(!row)throw Error("missing update");
      write(); Object.assign(row,structuredClone(args.data)); return project(row,args,data);
    },
    create: async args=>{
      if(failAt===model+".create") throw Error("injected failure");
      if(model==="outboxEvent" && data[model].some(e=>e.idempotencyKey===args.data.idempotencyKey))throw Error("duplicate event");
      if(model==="rideRequest" && data[model].some(e=>e.bookingId===args.data.bookingId && e.driverId===args.data.driverId))throw Error("duplicate pair");
      write();const row={id:"fake-"+data[model].length,...structuredClone(args.data)};data[model].push(row);return row;
    },
    upsert: async args=>{
      if(failAt===model+".upsert")throw Error("injected financial failure");
      write();let row=data[model].find(r=>matches(r,args.where));
      if(row)Object.assign(row,args.update);else{row={id:"fake",...args.create};data[model].push(row);}return row;
    },
  }]));
}
const prisma = new Proxy({}, {get:(_,key)=>{
  if(key==="$transaction") return async fn=>{
    if(failAt==="transactions")throw Object.assign(Error("unsupported replica set"),{code:"P2031"});
    const snapshot=structuredClone(state), start=revision;let changed=false;
    const result=await fn(dbFor(snapshot,()=>{changed=true;}));
    if(changed && start!==revision)throw Object.assign(Error("write conflict"),{code:"P2034"});
    if(changed){state=snapshot;revision++;} return result;
  };
  return dbFor(state,()=>{revision++;})[key];
}});
const cache=new Map();
const mocks={
  "@/lib/prisma":{prisma},
  "@/lib/pricing-engine":{DEFAULT_COMMISSION_RATE:20},
  "@/lib/tracking":{updateDriverLocation:()=>{}},
  "@/lib/security/authorization":{authorizeDriver:async req=>{
    if(!authorized)return {ok:false,response:NextResponse.json({error:"Authentication required"},{status:401})};
    return {ok:true,actor:{id:actorId},session:{}};
  }},
};
function load(file){
  const full=path.resolve(file);if(cache.has(full))return cache.get(full).exports;
  const mod=new Module(full,module);mod.filename=full;mod.paths=Module._nodeModulePaths(path.dirname(full));cache.set(full,mod);
  mod.require=name=>{
    if(name in mocks)return mocks[name];
    if(name.startsWith("@/"))return load(name.slice(2)+".ts");
    return Module.prototype.require.call(mod,name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(full,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,full);
  return mod.exports;
}
const ops=load("lib/driver-operations.ts"), policy=load("lib/driver-state.ts");
const projections=load("lib/driver-projections.ts");
const accept=()=>ops.acceptDriverOfferAtomically({offerId:OA,driverId:A});
const command=c=>ops.transitionDriverBooking({bookingId:X,driverId:A,command:c,cashConfirmed:true});
function request(method, body, url="https://gate.example/api/test"){
  return new NextRequest(url,{method,...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)})});
}
async function check(name,fn){reset();await fn();passes++;console.log("PASS behavioral:",name);}
(async()=>{
await check("one accept assigns driver, cancels competitor, writes one event",async()=>{
  assert.equal((await accept()).ok,true);assert.equal(state.booking[0].driverId,A);
  assert.equal(state.rideRequest[1].status,"CANCELLED");assert.equal(state.outboxEvent.length,1);
});
for(const field of ["null","missing"])await check("legacy "+field+" driverId is claimable",async()=>{
  if(field==="missing")delete state.booking[0].driverId;assert.equal((await accept()).ok,true);
});
await check("same booking simultaneous accepts simulate one winner",async()=>{
  const results=await Promise.all([accept(),ops.acceptDriverOfferAtomically({offerId:OB,driverId:B})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(state.outboxEvent.length,1);
  assert.equal(state.rideRequest.filter(r=>r.status==="ACCEPTED").length,1);
});
await check("same driver simultaneous different bookings simulate one winner",async()=>{
  state.booking.push({...state.booking[0],id:Y});
  state.rideRequest[1]={...state.rideRequest[1],driverId:A,bookingId:Y};
  const results=await Promise.all([accept(),ops.acceptDriverOfferAtomically({offerId:OB,driverId:A})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(state.booking.filter(b=>b.driverId===A).length,1);
});
await check("duplicate accept creates no second event",async()=>{await accept();assert.equal((await accept()).ok,false);assert.equal(state.outboxEvent.length,1);});
for(const when of ["driver.updateMany","outboxEvent.create","transactions"])await check("accept rolls back on "+when,async()=>{
  failAt=when;assert.equal((await accept()).ok,false);assert.equal(state.booking[0].driverId,null);
  assert.equal(state.rideRequest[0].status,"PENDING");assert.equal(state.outboxEvent.length,0);
});
await check("booking claim conflict rolls back accepted offer",async()=>{
  state.booking[0].driverId=B;const r=await accept();assert.equal(r.code,"BOOKING_ALREADY_CLAIMED");assert.equal(state.rideRequest[0].status,"PENDING");
});
await check("pending CARD booking cannot be accepted",async()=>{
  state.booking[0].status="PENDING";state.booking[0].paymentMethod="CARD";assert.equal((await accept()).ok,false);
});
await check("expired accept is non-actionable at server boundary",async()=>{
  state.rideRequest[0].expiresAt=new Date();assert.equal((await accept()).code,"OFFER_EXPIRED");assert.equal(state.booking[0].driverId,null);
});
await check("cross-driver decline is indistinguishable from nonexistent",async()=>{
  assert.equal((await ops.declineDriverOffer(OB,A)).code,"OFFER_NOT_FOUND");assert.equal(state.rideRequest[1].status,"PENDING");
});
await check("expired decline persists EXPIRED without event",async()=>{
  state.rideRequest[0].expiresAt=new Date();assert.equal((await ops.declineDriverOffer(OA,A)).code,"OFFER_EXPIRED");
  assert.equal(state.rideRequest[0].status,"EXPIRED");assert.equal(state.outboxEvent.length,0);
});
await check("decline is idempotent and does not redispatch",async()=>{
  assert.equal((await ops.declineDriverOffer(OA,A)).ok,true);assert.equal((await ops.declineDriverOffer(OA,A)).ok,false);
  assert.equal(state.outboxEvent.length,1);assert.equal(state.rideRequest.length,2);
});
for(const status of policy.ACTIVE_TRIP_STATUSES)await check("assigned "+status+" conflicts in acceptance and presence",async()=>{
  state.booking.push({...state.booking[0],id:Y,driverId:A,status});
  assert.equal((await accept()).code,"CONFLICTING_ACTIVE_TRIP");assert.equal((await ops.getDriverPresence(A)).state,"BUSY");
});
for(const status of ["COMPLETED","CANCELLED","NO_SHOW"])await check(status+" does not conflict",async()=>{
  state.booking.push({...state.booking[0],id:Y,driverId:A,status});assert.equal((await accept()).ok,true);
});
for(const [status,c] of [["ASSIGNED","START"],["DRIVER_ENROUTE","COMPLETE"],["ARRIVED","COMPLETE"]])await check(status+" illegal "+c+" rejects",async()=>{
  state.booking[0].driverId=A;state.booking[0].status=status;assert.equal((await command(c)).code,"INVALID_TRANSITION");assert.equal(state.outboxEvent.length,0);
});
await check("complete atomically writes existing earning model and preserves offline",async()=>{
  state.booking[0].driverId=A;state.booking[0].status="IN_PROGRESS";state.driver[0].isOnline=false;state.driver[0].isOnTrip=true;
  assert.equal((await command("COMPLETE")).ok,true);assert.equal(state.driver[0].isOnTrip,false);
  assert.equal((await ops.getDriverPresence(A)).state,"OFFLINE");assert.equal(state.driverEarning[0].totalFare,123);
  assert.equal(state.driverEarning[0].driverAmount,98.4);assert.equal(state.outboxEvent.length,1);
  assert.equal((await command("COMPLETE")).ok,false);assert.equal(state.driverEarning.length,1);
});
await check("earning failure rolls back completion and remains retryable",async()=>{
  state.booking[0].driverId=A;state.booking[0].status="IN_PROGRESS";state.driver[0].isOnTrip=true;
  failAt="driverEarning.upsert";assert.equal((await command("COMPLETE")).ok,false);
  assert.equal(state.booking[0].status,"IN_PROGRESS");assert.equal(state.driver[0].isOnTrip,true);assert.equal(state.outboxEvent.length,0);
  failAt=null;assert.equal((await command("COMPLETE")).ok,true);
});
await check("completion outbox failure rolls back financial insert",async()=>{
  state.booking[0].driverId=A;state.booking[0].status="IN_PROGRESS";failAt="outboxEvent.create";
  assert.equal((await command("COMPLETE")).ok,false);assert.equal(state.driverEarning.length,0);assert.equal(state.booking[0].status,"IN_PROGRESS");
});
for(const [status,c] of [["DRIVER_ENROUTE","ARRIVED"],["ARRIVED","START"]])await check("duplicate "+c+" creates one logical event",async()=>{
  state.booking[0].driverId=A;state.booking[0].status=status;await command(c);assert.equal((await command(c)).ok,false);assert.equal(state.outboxEvent.length,1);
});
await check("creation refuses historical pair and does not retry",async()=>{
  state.rideRequest[0].status="DECLINED";assert.equal((await ops.createDriverOffer({bookingId:X,driverId:A})).code,"OFFER_ALREADY_EXISTS");
  assert.equal(state.rideRequest.length,2);
});
await check("offer creation rollback leaves no orphan",async()=>{
  state.rideRequest=[];failAt="rideRequest.create";assert.equal((await ops.createDriverOffer({bookingId:X,driverId:A})).ok,false);
  assert.equal(state.rideRequest.length,0);assert.equal(state.booking[0].dispatchStatus,undefined);
});
await check("free-text address layouts and arbitrary fields never leak",async()=>{
  const output=projections.serializeOfferBooking(state.booking[0]);
  for(const forbidden of ["Secret","private-phone","PRIVATE_AUTH","PRIVATE_ADMIN"])assert.ok(!JSON.stringify(output).includes(forbidden));
  assert.equal(output.pickupArea,"Area unavailable");assert.ok(!("pickupAddress" in output));
});
await check("offer route response omits private addresses and coordinates",async()=>{
  const route=load("app/api/driver/ride-requests/route.ts");const res=await route.GET(request("GET"));assert.equal(res.status,200);
  const body=await res.json();assert.equal(body.rideRequests.length,1);
  assert.ok(!JSON.stringify(body).includes("Secret"));assert.ok(!("pickupLat" in body.rideRequests[0].booking));
});
await check("own active trip projection excludes passenger auth and private notes",async()=>{
  state.booking[0].driverId=A;state.booking[0].status="ARRIVED";
  const route=load("app/api/driver/active-trip/route.ts");const body=await (await route.GET(request("GET"))).json();
  assert.equal(body.activeTrip.pickupAddress,state.booking[0].pickupAddress);
  assert.ok(!("passengerAuthStatus" in body.activeTrip));assert.ok(!("specialNotes" in body.activeTrip));
  actorId=B;assert.equal((await (await route.GET(request("GET"))).json()).activeTrip,null);
});
await check("assigned trip and booking lists strip arbitrary nested child JSON keys",async()=>{
  state.booking[0].driverId=A;state.booking[0].status="ARRIVED";state.booking[0].scheduledDate="2020-01-01";
  state.booking[0].childrenDetails=[{fullName:"Child",age:8,specialRequirements:"Booster seat",diagnosis:"PRIVATE_DIAGNOSIS",auth:{token:"PRIVATE_TOKEN"}},null,"bad"];
  for(const file of ["app/api/driver/active-trip/route.ts","app/api/driver/bookings/route.ts"]) {
    const body=await (await load(file).GET(request("GET"))).json();
    const trip=body.activeTrip||body.todayBookings[0];
    assert.deepEqual(trip.childrenDetails,[{fullName:"Child",age:8,specialRequirements:"Booster seat"}]);
    assert.ok(!JSON.stringify(body).includes("PRIVATE_"));
  }
});
await check("strict telemetry rejects null, strings, booleans and bad ranges",async()=>{
  const route=load("app/api/driver/location/route.ts");
  for(const body of [{lat:null,lng:1},{lat:"48",lng:17},{lat:true,lng:1},{lat:91,lng:1},{lat:1,lng:181},
    {lat:1,lng:1,accuracy:-1},{lat:1,lng:1,speed:101},{lat:1,lng:1,heading:361},
    {lat:1,lng:1,clientTimestamp:"bad"},{lat:1,lng:1,clientTimestamp:Date.now()+60000},{lat:1,lng:1,driverId:B}]) {
    assert.equal((await route.POST(request("POST",body))).status,400);
  }
});
await check("location accepts epoch time and keeps independent receipt time without outbox",async()=>{
  state.driverLocation=[];const route=load("app/api/driver/location/route.ts");const time=Date.now()-1000;
  const res=await route.POST(request("POST",{lat:48,lng:17,accuracy:4,clientTimestamp:time}));
  assert.equal(res.status,200);assert.equal(state.driver[0].lastLocationClientAt.getTime(),time);
  assert.ok(state.driver[0].lastLocationReceivedAt.getTime()>time);assert.equal(state.outboxEvent.length,0);
});
await check("invalid/future freshness is false and threshold is parameterized",async()=>{
  assert.equal(policy.isLocationFresh("bad"),false);assert.equal(policy.isLocationFresh(new Date(Date.now()+99999)),false);
  assert.equal(policy.isLocationFresh(new Date(0),new Date(1000),500),false);
  assert.equal(policy.isLocationFresh(new Date(0),new Date(1000),2000),true);
  state.driver[0].lastLocationReceivedAt=null;assert.equal((await ops.getDriverPresence(A)).state,"LOCATION_NOT_READY");
});
await check("availability only accepts intent and offline never cancels trip",async()=>{
  const route=load("app/api/driver/availability/route.ts");state.booking[0].driverId=A;state.booking[0].status="ARRIVED";
  assert.equal((await route.PATCH(request("PATCH",{isOnline:false}))).status,200);
  assert.equal(state.booking[0].status,"ARRIVED");assert.equal(state.driver[0].isOnline,false);
  assert.equal((await route.PATCH(request("PATCH",{isOnline:true,isOnTrip:false}))).status,400);
});
await check("commands reject malformed ids/json and cross-driver changes",async()=>{
  const route=load("app/api/driver/bookings/[id]/[command]/route.ts");
  assert.equal((await route.POST(request("POST",{}),{params:Promise.resolve({id:"bad",command:"arrived"})})).status,400);
  assert.equal((await route.POST(request("POST","{broken"),{params:Promise.resolve({id:X,command:"arrived"})})).status,400);
  state.booking[0].driverId=B;assert.equal((await route.POST(request("POST",{}),{params:Promise.resolve({id:X,command:"arrived"})})).status,404);
});
await check("new endpoints return auth rejection before database work",async()=>{
  authorized=false;
  for(const [file,method] of [["presence","GET"],["heartbeat","POST"],["active-trip","GET"],["location","POST"],["availability","PATCH"]]) {
    assert.equal((await load("app/api/driver/"+file+"/route.ts")[method](request(method,method==="GET"?undefined:{}))).status,401);
  }
});
console.log("Phase 3B isolated behavioral checks passed: "+passes+" (no real Mongo, browser or network)");
})().catch(error=>{console.error(error);process.exitCode=1;});
