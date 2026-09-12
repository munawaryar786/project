// Isolated runtime gate: real route/auth code and Next cookie serialization;
// database, maps, Stripe and email are fakes. No service credentials are loaded.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;
process.env.NODE_ENV = "production";
process.env.AUTH_SIGNING_SECRET = "phase3a-test-signing-key-only-000000000000";
process.env.CSRF_HMAC_SECRET = "phase3a-test-hmac-key-only-000000000000000";
process.env.JWT_SECRET = "phase3a-test-legacy-key-only-0000000000000";
process.env.APP_ORIGIN = "https://gate.example";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/isolated_never_connected";
process.env.NEXT_PUBLIC_CHILDREN_TRANSPORT_ENABLED = "false";
process.env.AUTH_RATE_LIMIT_KEY_SECRET = "phase3l-test-key-only-000000000000000000000000";
globalThis.__drivoAuthRateLimitRedis = { status: "ready", eval: async () => [1, 900, 4, 4] };
globalThis.fetch = async () => { throw new Error("Unexpected network access in gate test"); };
const { NextRequest, NextResponse } = require("next/server");
const { AppRouteRouteModule } = require("next/dist/server/route-modules/app-route/module");
const { SignJWT } = require("jose");
const root = process.cwd();
const id = "111111111111111111111111";
const other = "222222222222222222222222";
const sid = "333333333333333333333333";
let actor = { id, status: "ACTIVE", authVersion: 0, role: "DISPATCHER", phone: "+421900000000", normalizedPhone: "+421900000000", fullName: "Test Actor", phoneVerified: true, profileCompleted: true };
let records = [];
let booking = null;
let activeRequest = null;
let writes = 0;
let bookingReads = 0;
let stripeParams;
let paymentSession;
let event;
let emails = 0;
const prisma = {
  passenger: { findUnique: async () => actor, findFirst: async () => actor, update: async ({data}) => ({...actor, ...data, authVersion: data.authVersion?.increment ? (actor.authVersion || 0) + data.authVersion.increment : (data.authVersion ?? actor.authVersion)}) },
  passengerSession: {
    create: async ({ data }) => { const row = { id: sid, ...data, revokedAt: null }; records.push(row); return row; },
    findFirst: async ({where}) => records.find(r => r.id === where.id && r.passengerId === where.passengerId && r.tokenHash === where.tokenHash && !r.revokedAt && r.expiresAt > new Date()) || null,
    update: async () => ({}),
    updateMany: async () => { records.forEach(r => {r.revokedAt = new Date();}); return {count: records.length}; },
  },
  driver: { findUnique: async () => actor, findMany: async () => [], update: async () => ({}) },
  adminUser: { findUnique: async () => actor },
  booking: {
    findUnique: async () => {bookingReads++; return booking;},
    findFirst: async ({where}) => booking && booking.id === where.id && booking.passengerId === where.passengerId ? booking : null,
    findMany: async () => booking ? [booking] : [],
    updateMany: async ({where, data}) => { if (!booking || booking.status !== where.status) return {count:0}; writes++; Object.assign(booking, data); return {count:1}; },
    update: async ({data}) => { writes++; Object.assign(booking, data); return booking; },
    create: async ({data}) => {writes++; booking={id:other,...data};return booking;},
  },
  rideRequest: { findFirst: async () => activeRequest, findMany: async () => [], updateMany: async () => {writes++;return {count:0};}, create: async () => {writes++;return {};} },
};
const mocks = {
  "@/lib/prisma": {prisma},
  "@/lib/rate-limit": { withRateLimit: h => h, withDistributedIpRateLimit: h => h, authRateLimitResponse: () => NextResponse.json({ error: "rate limited" }, { status: 429 }), enforceAuthRateLimit: async () => ({ allowed: true, unavailable: false, retryAfter: 1, remaining: 4 }), resolveClientIp: () => "127.0.0.1", rateLimits: new Proxy({}, { get: () => ({ max: 5, windowMs: 900000, message: "rate limited" }) }) },
  "@/lib/stripe": {
    formatAmountForStripe: a => Math.round(a * 100),
    createPaymentSession: async p => {stripeParams=p; return {sessionId:"cs_test",sessionUrl:"https://checkout.example"};},
    getPaymentSession: async () => ({success:true,session:paymentSession,status:paymentSession.payment_status}),
    verifyWebhookSignature: (_, signature) => ({valid:signature==="test-valid",event}),
  },
  "@/lib/email": {bookingToEmailData:b=>b,sendPaymentReceipt:async()=>{emails++;},sendBookingCompletionEmails:async()=>{emails++;},isSeniorAssistedService:s=>["SENIOR","ACCESSIBLE"].includes(s),sendSeniorAssistedBookingEmails:async()=>({adminFull:{success:true},driverSafe:{success:true}})},
  "@/lib/google-maps": {calculateDistance:async()=>({distanceKm:10,durationMinutes:20})},
  "@/lib/pricing-engine-config": {getPricingEngineConfig:async()=>({config:{},distanceTiers:[]})},
};
const cache = new Map();
function load(file) {
  const full = path.resolve(root, file);
  if(cache.has(full)) return cache.get(full).exports;
  const mod = new Module(full, module);
  mod.filename=full; mod.paths=Module._nodeModulePaths(path.dirname(full));
  cache.set(full,mod);
  mod.require = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/")) {
      const candidate=path.resolve(root,name.slice(2));
      return load(fs.existsSync(candidate+".ts")?candidate+".ts":candidate+".tsx");
    }
    return Module.prototype.require.call(mod,name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(full,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,full);
  return mod.exports;
}
const session=load("lib/security/session.ts");
const passenger=load("lib/passenger-auth.ts");
const auth=load("lib/security/authorization.ts");
const price=load("lib/security/booking-price.ts");
const tracking=load("lib/tracking-token.ts");
function request(method="GET",token,actorName="PASSENGER",body,headers={}) {
  return new NextRequest("https://gate.example/api/test",{
    method, headers:{origin:process.env.APP_ORIGIN,...(token?{
      cookie:session.sessionCookieName(actorName)+"="+token.token+"; "+session.csrfCookieName(actorName)+"="+token.csrfToken,
      "x-drivo-csrf":token.csrfToken,
    }:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function routed(handler, req) {
  const route = new AppRouteRouteModule({
    definition:{kind:"APP_ROUTE",page:"/api/test/route",pathname:"/api/test",filename:"route",bundlePath:"app/api/test/route"},
    userland:{[req.method]:handler}, resolvedPagePath:path.join(root,"app/api/test/route.ts"),
    distDir:path.join(root,".next"),relativeProjectDir:"",
  });
  return route.handle(req,{params:{},renderOpts:{supportsDynamicResponse:true,experimental:{}},sharedContext:{buildId:"isolated-gate"},prerenderManifest:{preview:{}}});
}
async function test(name,fn) { await fn(); console.log("PASS "+name); }
async function main(){
await test("canonical actor, expiry, tampering and required claims",async()=>{
  const t=await session.createCanonicalToken({sub:id,actor:"DRIVER",role:"DRIVER",ver:0});
  assert.ok(await session.verifyCanonicalToken(t.token,"DRIVER"));
  assert.equal(await session.verifyCanonicalToken(t.token,"ADMIN"),null);
  assert.equal(await session.verifyCanonicalToken(t.token+"x","DRIVER"),null);
  const key=new TextEncoder().encode(process.env.AUTH_SIGNING_SECRET);
  const base={sub:id,jti:"test",actor:"DRIVER",role:"DRIVER",ver:0,csrf:session.hashCsrfToken("x")};
  const noExp=await new SignJWT(base).setProtectedHeader({alg:"HS256"}).setIssuer("drivo").setAudience("drivo-web").setIssuedAt().sign(key);
  assert.equal(await session.verifyCanonicalToken(noExp,"DRIVER"),null);
  const expired=await new SignJWT(base).setProtectedHeader({alg:"HS256"}).setIssuer("drivo").setAudience("drivo-web").setIssuedAt(1).setExpirationTime(2).sign(key);
  assert.equal(await session.verifyCanonicalToken(expired,"DRIVER"),null);
});
await test("driver/admin live actor state, version, CSRF and origin checks",async()=>{
  for(const role of ["DRIVER","ADMIN"]){
    actor={...actor,status:"ACTIVE",authVersion:0};
    const t=await session.createCanonicalToken({sub:id,actor:role,role:role,ver:0});
    const guard=role==="DRIVER"?auth.authorizeDriver:auth.authorizeAdmin;
    assert.equal((await guard(request("PATCH",t,role,{}))).ok,true);
    assert.equal((await guard(request("PATCH",t,role,{},{"x-drivo-csrf":"wrong"}))).response.status,403);
    assert.equal((await guard(request("PATCH",t,role,{},{origin:"https://attacker.example"}))).response.status,403);
    assert.equal((await guard(request("GET",undefined,role,undefined,{authorization:"Bearer "+t.token}))).response.status,401);
    actor.authVersion=1;assert.equal((await guard(request("GET",t,role))).response.status,401);
    actor.authVersion=0;
    if(role==="DRIVER"){actor.status="SUSPENDED";assert.equal((await guard(request("GET",t,role))).response.status,401);actor.status="ACTIVE";}
  }
});
await test("legacy passenger GET emits production Set-Cookie through Next route wrapper",async()=>{
  records=[{id:sid,passengerId:id,tokenHash:passenger.hashSecret("legacy-session-secret"),expiresAt:new Date(Date.now()+60000)}];
  const legacy=await new SignJWT({id,type:"PASSENGER",sessionId:sid,sessionToken:"legacy-session-secret"}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET));
  const req=request("GET",undefined,"PASSENGER",undefined,{cookie:"drivo_passenger_token="+legacy});
  const res=await routed(load("app/api/passenger/me/route.ts").GET,req);
  assert.equal(res.status,200);
  const values=res.headers.getSetCookie();
  assert.ok(values.some(v=>v.startsWith("__Host-drivo-passenger-session=")&&v.includes("HttpOnly")&&v.includes("Secure")&&v.includes("SameSite=lax")));
  assert.ok(values.some(v=>v.startsWith("__Host-drivo-passenger-csrf=")&&!v.includes("HttpOnly")&&v.includes("Secure")));
  const mutation=await routed(async r=>{const a=await passenger.authorizePassenger(r);return a.ok?NextResponse.json({ok:true}):a.response;},request("POST",undefined,"PASSENGER",{},{cookie:"drivo_passenger_token="+legacy}));
  assert.equal(mutation.status,409);assert.equal(mutation.headers.get("X-Drivo-Session-Upgraded"),"1");assert.equal(mutation.headers.getSetCookie().length,2);
});
await test("driver/admin login to me and logout cookie isolation",async()=>{
  actor={...actor,status:"ACTIVE",authVersion:0,passwordHash:await require("bcryptjs").hash("test-password",4),email:"test@example.com"};
  for(const name of ["driver","admin"]){
    const role=name.toUpperCase(),body=name==="driver"?{phone:actor.phone,password:"test-password"}:{email:actor.email,password:"test-password"};
    const res=await load("app/api/"+name+"/auth/route.ts").POST(request("POST",undefined,role,body));
    assert.equal(res.status,200);const values=res.cookies.getAll();
    const t={token:values.find(c=>c.name===session.sessionCookieName(role)).value,csrfToken:values.find(c=>c.name===session.csrfCookieName(role)).value};
    assert.equal((await load("app/api/"+name+"/me/route.ts").GET(request("GET",t,role))).status,200);
    const out=await load("app/api/"+name+"/logout/route.ts").POST(request("POST",t,role,{}));
    assert.equal(out.status,200);assert.ok(out.cookies.getAll().every(c=>c.name.includes(name)&&c.maxAge===0));
    assert.equal("token" in await res.json(),false);
  }
});
await test("passenger password login, canonical me, CSRF and logout revocation",async()=>{
  const res=await load("app/api/passenger/login/password/route.ts").POST(request("POST",undefined,"PASSENGER",{phone:actor.phone,password:"test-password"}));
  assert.equal(res.status,200);
  const t={token:res.cookies.get(session.sessionCookieName("PASSENGER")).value,csrfToken:res.cookies.get(session.csrfCookieName("PASSENGER")).value};
  assert.equal((await passenger.authorizePassenger(request("POST",t,"PASSENGER",{}))).ok,true);
  assert.equal((await passenger.authorizePassenger(request("POST",t,"PASSENGER",{},{"x-drivo-csrf":"wrong"}))).response.status,403);
  assert.equal((await load("app/api/passenger/logout/route.ts").POST(request("POST",t,"PASSENGER",{}))).status,200);
  assert.equal(await passenger.getPassengerFromRequest(request("GET",t)),null);
});
await test("payment authority rejects historical, lowered, substituted quotes",async()=>{
  const fare={serverPriceMac:price.signBookingPrice("DRIVO-TEST",25)};
  assert.ok(price.hasAuthoritativeBookingPrice({bookingRef:"DRIVO-TEST",estimatedPrice:25,fareBreakdown:fare}));
  assert.equal(price.hasAuthoritativeBookingPrice({bookingRef:"DRIVO-TEST",estimatedPrice:1,fareBreakdown:fare}),false);
  assert.equal(price.hasAuthoritativeBookingPrice({bookingRef:"DRIVO-OTHER",estimatedPrice:25,fareBreakdown:fare}),false);
  assert.equal(price.hasAuthoritativeBookingPrice({bookingRef:"DRIVO-TEST",estimatedPrice:1,fareBreakdown:{totalFare:1}}),false);
});
const t=await passenger.createPassengerSession(actor);
const paidBooking=()=>({id:other,passengerId:id,bookingRef:"DRIVO-TEST",status:"PENDING",paymentMethod:"CARD",estimatedPrice:25,fareBreakdown:{serverPriceMac:price.signBookingPrice("DRIVO-TEST",25)},customerEmail:"test@example.com",serviceType:"STANDARD"});
await test("checkout ownership, state, EUR, ignored browser amount and historical guard",async()=>{
  const checkout=load("app/api/payments/checkout/route.ts").POST;booking=paidBooking();
  assert.equal((await checkout(request("POST",t,"PASSENGER",{bookingId:other,amount:1}))).status,200);
  assert.equal(stripeParams.amount,2500);assert.equal(stripeParams.currency,"EUR");assert.equal(stripeParams.bookingRef,booking.bookingRef);
  assert.equal((await checkout(request("POST",t,"PASSENGER",{bookingId:other,currency:"USD"}))).status,400);
  booking.passengerId=other;assert.equal((await checkout(request("POST",t,"PASSENGER",{bookingId:other}))).status,404);
  booking=paidBooking();booking.fareBreakdown={};assert.equal((await checkout(request("POST",t,"PASSENGER",{bookingId:other}))).status,409);
  booking=paidBooking();booking.status="COMPLETED";assert.equal((await checkout(request("POST",t,"PASSENGER",{bookingId:other}))).status,409);
});
await test("webhook signature rejection, atomic duplicate guard, no ride status regression",async()=>{
  const webhook=load("app/api/payments/webhook/route.ts").POST;
  booking=paidBooking();writes=0;emails=0;
  paymentSession={id:"cs_test",payment_intent:"pi_test",metadata:{bookingId:other,bookingRef:booking.bookingRef},payment_status:"paid",amount_total:2500,currency:"eur"};
  event={id:"evt_test",type:"checkout.session.completed",data:{object:paymentSession}};
  assert.equal((await webhook(request("POST",undefined,"PASSENGER",{}))).status,400);
  const invoke=()=>webhook(request("POST",undefined,"PASSENGER",{},{"stripe-signature":"test-valid"}));
  await Promise.all([invoke(),invoke()]);assert.equal(writes,1);assert.equal(emails,2);
  for(const state of ["ASSIGNED","DRIVER_ENROUTE","IN_PROGRESS","NO_SHOW","COMPLETED","CANCELLED"]){booking.status=state;assert.equal((await invoke()).status,200);assert.equal(booking.status,state);}
  assert.equal(writes,1);assert.equal(emails,2);
});
await test("dispatch auth, ownership, assigned/terminal/card guards and repeated active request",async()=>{
  const dispatch=load("app/api/dispatch/start/route.ts").POST;
  booking=paidBooking();bookingReads=0;
  assert.equal((await dispatch(request("POST",undefined,"PASSENGER",{bookingId:other}))).status,401);assert.equal(bookingReads,0);
  booking.passengerId=other;assert.equal((await dispatch(request("POST",t,"PASSENGER",{bookingId:other}))).status,404);
  booking=paidBooking();assert.equal((await dispatch(request("POST",t,"PASSENGER",{bookingId:other}))).status,409);
  for(const state of ["ASSIGNED","DRIVER_ENROUTE","IN_PROGRESS","COMPLETED","CANCELLED","NO_SHOW"]){booking.status=state;assert.equal((await dispatch(request("POST",t,"PASSENGER",{bookingId:other}))).status,409);}
  booking.status="CONFIRMED";activeRequest={id:sid};writes=0;
  assert.equal((await dispatch(request("POST",t,"PASSENGER",{bookingId:other}))).status,200);assert.equal(writes,0);activeRequest=null;
});
await test("tracking token binding, tampering, expiry and terminal redaction",async()=>{
  const token=tracking.createTrackingToken(other);
  assert.equal(tracking.verifyTrackingToken(token,other),true);
  assert.equal(tracking.verifyTrackingToken(token,id),false);
  assert.equal(tracking.verifyTrackingToken(token+"x",other),false);
  assert.equal(tracking.verifyTrackingToken(token,other,Date.now()+86400001),false);
  const handler=load("app/api/track/[ref]/route.ts").GET;
  booking={...paidBooking(),status:"COMPLETED",pickupAddress:"private pickup",dropoffAddress:"private dropoff",driver:{fullName:"Private",currentLat:10,isOnTrip:true}};
  const res=await handler(new NextRequest("https://gate.example/api/track/DRIVO-TEST?token="+token),{params:Promise.resolve({ref:"DRIVO-TEST"})});
  const data=await res.json();assert.equal(res.status,200);assert.equal(data.driver,null);assert.equal("pickupAddress" in data.booking,false);
  booking.status="PENDING";const pending=await handler(new NextRequest("https://gate.example/api/track/DRIVO-TEST?token="+token),{params:Promise.resolve({ref:"DRIVO-TEST"})});assert.equal((await pending.json()).driver,null);
});
await test("Children disabled; other services enabled; generic booking PATCH stays closed",async()=>{
  const flags=load("lib/feature-flags.ts");
  assert.equal(flags.isCustomerServiceEnabled("CHILDREN"),false);
  for(const service of ["STANDARD","SENIOR","ACCESSIBLE","AIRPORT","RENTAL"])assert.equal(flags.isCustomerServiceEnabled(service),true);
  assert.equal((await load("app/api/bookings/[id]/route.ts").PATCH()).status,405);
});
await test("all protected admin/driver methods reject missing sessions independently of middleware",async()=>{
  let count=0;
  for(const family of ["admin","driver"]){
    const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
    for(const file of walk(path.join(root,"app/api",family)).filter(f=>f.endsWith("route.ts")&&!f.endsWith(path.join("auth","route.ts")))){
      const route=load(file);
      for(const method of ["GET","POST","PUT","PATCH","DELETE"]){
        if(typeof route[method]!=="function")continue;
        assert.equal((await route[method](request(method,undefined,family.toUpperCase(),method==="GET"?undefined:{}),{params:Promise.resolve({id:other})})).status,401,file+" "+method);count++;
      }
    }
  }
  console.log("Protected methods exercised: "+count);
});
await test("frontend helper chooses each actor CSRF cookie and retries legacy upgrade once",async()=>{
  const deniedNetwork=globalThis.fetch;
  const {csrfFetch}=load("lib/client/csrf-fetch.ts");
  try{
    for(const name of ["passenger","driver","admin"]){
      globalThis.document={cookie:"__Host-drivo-passenger-csrf=p; __Host-drivo-driver-csrf=d; __Host-drivo-admin-csrf=a"};
      globalThis.fetch=async(_,init)=>{assert.equal(new Headers(init.headers).get("x-drivo-csrf"),name[0]);assert.equal(init.credentials,"include");return new Response("{}");};
      await csrfFetch(name,"/api/"+name+"/test",{method:"PATCH"});
    }
    let calls=0;
    globalThis.fetch=async(url,init)=>{
      calls++;
      if(calls===1)return new Response("{}",{status:409,headers:{"X-Drivo-Session-Upgraded":"1"}});
      if(calls===2){assert.equal(url,"/api/passenger/me");globalThis.document.cookie="__Host-drivo-passenger-csrf=new";return new Response("{}");}
      assert.equal(new Headers(init.headers).get("x-drivo-csrf"),"new");return new Response("{}");
    };
    assert.equal((await csrfFetch("passenger","/api/passenger/profile/complete",{method:"POST"})).status,200);assert.equal(calls,3);
  }finally{globalThis.fetch=deniedNetwork;delete globalThis.document;}
});
await test("OTP challenge is active-only and cannot be consumed twice",async()=>{
  let used=false;
  prisma.passengerOtp={
    findFirst:async()=>used?null:{id:sid,code:"123456",attempts:0,maxAttempts:3},
    updateMany:async()=>{if(used)return {count:0};used=true;return {count:1};},
    update:async()=>({}),
  };
  const verify=load("app/api/passenger/login/otp/verify/route.ts").POST;
  const input={phone:actor.phone,otpCode:"123456",loginAttemptId:"test-attempt-id",rememberDevice:false};
  actor.status="SUSPENDED";assert.equal((await verify(request("POST",undefined,"PASSENGER",input))).status,400);assert.equal(used,false);
  actor.status="ACTIVE";const res=await verify(request("POST",undefined,"PASSENGER",input));assert.equal(res.status,200);assert.ok(res.cookies.get(session.sessionCookieName("PASSENGER")));
  assert.equal((await verify(request("POST",undefined,"PASSENGER",input))).status,400);
});
await test("profile completion reissues canonical cookie and reset proof replay cannot change password",async()=>{
  const originalFind=prisma.passenger.findFirst;
  prisma.passenger.findFirst=async({where})=>where.email?null:actor;
  const profile=await load("app/api/passenger/profile/complete/route.ts").POST(request("POST",t,"PASSENGER",{fullName:"Test Profile",email:"profile@example.com",password:"long-test-password"}));
  assert.equal(profile.status,200);assert.ok(profile.cookies.get(session.csrfCookieName("PASSENGER")));
  let consumed=false,updates=0;
  prisma.passengerVerificationProof={findFirst:async()=>({id:sid}),updateMany:async()=>{if(consumed)return {count:0};consumed=true;return {count:1};}};
  prisma.passengerTrustedDevice={updateMany:async()=>({count:0})};
  const originalUpdate=prisma.passenger.update;
  prisma.passenger.update=async({data})=>{updates++;return {...actor,...data};};
  const reset=load("app/api/passenger/password-reset/complete/route.ts").POST;
  const input={phone:actor.phone,passwordResetProofToken:"test-proof-never-production",resetAttemptId:"test-reset-attempt",password:"long-test-password",confirmPassword:"long-test-password",rememberDevice:false};
  const res=await reset(request("POST",undefined,"PASSENGER",input));assert.equal(res.status,200);assert.ok(res.cookies.get(session.sessionCookieName("PASSENGER")));
  assert.equal((await reset(request("POST",undefined,"PASSENGER",input))).status,400);assert.equal(updates,1);
  prisma.passenger.findFirst=originalFind;prisma.passenger.update=originalUpdate;
});
await test("cash/invoice continuation forwards cookies only to configured origin",async()=>{
  const token=await passenger.createPassengerSession(actor),deniedNetwork=globalThis.fetch;
  try{
    let calls=0;
    globalThis.fetch=async(url,init)=>{assert.equal(url,"https://gate.example/api/dispatch/start");assert.equal(init.headers.Origin,"https://gate.example");assert.equal(init.headers["X-Drivo-CSRF"],token.csrfToken);calls++;return new Response("{}");};
    for(const method of ["CASH","INVOICE"]){
      booking={...paidBooking(),paymentMethod:method,normalizedPhone:actor.phone};
      const res=await load("app/api/passenger/booking/continue/route.ts").POST(request("POST",token,"PASSENGER",{bookingId:other}));assert.equal(res.status,200);
    }
    assert.equal(calls,2);
  }finally{globalThis.fetch=deniedNetwork;}
});
await test("new bookings ignore browser prices and match Pricing Engine V1 preview",async()=>{
  const create=load("app/api/bookings/route.ts").POST, preview=load("app/api/bookings/distance/route.ts").POST;
  const oldLog=console.log;console.log=()=>{};
  try{
    for(const serviceType of ["STANDARD","AIRPORT","SENIOR","ACCESSIBLE"]){
      const input={serviceType,pickupAddress:"Test pickup",dropoffAddress:"Test destination",scheduledDate:"2026-10-01",scheduledTime:"12:00",passengerCount:1,customerName:"Test Customer",customerEmail:"test@example.com",customerPhone:"900000000",paymentMethod:"INVOICE",estimatedPrice:0.01,fareBreakdown:{totalFare:0.01}};
      const res=await create(request("POST",undefined,"PASSENGER",input));
      assert.equal(res.status,201,serviceType);assert.notEqual(booking.estimatedPrice,0.01);assert.ok(price.hasAuthoritativeBookingPrice(booking));
      const shown=await preview(request("POST",undefined,"PASSENGER",input));assert.equal(shown.status,200);assert.equal((await shown.json()).pricing.estimatedPrice,booking.estimatedPrice);
    }
    writes=0;
    const res=await create(request("POST",undefined,"PASSENGER",{serviceType:"CHILDREN",pickupAddress:"Test pickup",dropoffAddress:"Test school",scheduledDate:"2026-10-01",scheduledTime:"12:00",passengerCount:1,customerName:"Test Parent",customerEmail:"parent@example.com",customerPhone:"900000000",paymentMethod:"INVOICE"}));
    assert.equal(res.status,409);assert.equal(writes,0);
  }finally{console.log=oldLog;}
});
await test("payment verification is read-only and rejects wrong ownership/reference/amount",async()=>{
  const token=await passenger.createPassengerSession(actor);
  const verify=load("app/api/payments/verify/route.ts").POST;
  booking=paidBooking();writes=0;
  paymentSession={payment_status:"paid",amount_total:2500,currency:"eur",metadata:{bookingId:other,bookingRef:booking.bookingRef}};
  const invoke=()=>verify(request("POST",token,"PASSENGER",{sessionId:"cs_test_gate"}));
  assert.equal((await invoke()).status,200);assert.equal(writes,0);
  paymentSession.amount_total=1;assert.equal((await invoke()).status,409);
  paymentSession.amount_total=2500;paymentSession.metadata.bookingRef="DRIVO-OTHER";assert.equal((await invoke()).status,404);
  paymentSession.metadata.bookingRef=booking.bookingRef;booking.passengerId=other;assert.equal((await invoke()).status,404);
});
await test("pre-accept offer serialization excludes contact, medical and child details",async()=>{
  const originalFind=prisma.booking.findMany,originalRequests=prisma.rideRequest.findMany;
  try{
    booking={...paidBooking(),customerPhone:"PRIVATE_SENTINEL",customerEmail:"PRIVATE_SENTINEL",medicalAppointment:true,hospitalName:"PRIVATE_SENTINEL",childFullName:"PRIVATE_SENTINEL",specialNotes:"PRIVATE_SENTINEL",customWaitingDuration:"PRIVATE_SENTINEL",recurrenceCustom:"PRIVATE_SENTINEL",flightNumber:"PRIVATE_SENTINEL"};
    prisma.rideRequest.findMany=async()=>[{id:sid,bookingId:other,driverId:id,status:"PENDING",sentAt:new Date(),respondedAt:null,expiresAt:new Date(Date.now()+30000),createdAt:new Date()}];
    prisma.booking.findMany=async({select})=>[Object.fromEntries(Object.keys(select).map(k=>[k,booking[k]??null]))];
    const token=await session.createCanonicalToken({sub:id,actor:"DRIVER",role:"DRIVER",ver:0});
    const res=await load("app/api/driver/ride-requests/route.ts").GET(request("GET",token,"DRIVER"));
    const data=await res.json();assert.equal(data.rideRequests.length,1);
    assert.equal(JSON.stringify(data).includes("PRIVATE_SENTINEL"),false);
    for(const field of ["customerPhone","customerEmail","medicalAppointment","hospitalName","childFullName","specialNotes","customWaitingDuration","recurrenceCustom","flightNumber"])assert.equal(field in data.rideRequests[0].booking,false,field);
  }finally{prisma.booking.findMany=originalFind;prisma.rideRequest.findMany=originalRequests;}
});
await test("GDPR cannot export/delete contacts by self-entered unverified email",async()=>{
  const token=await passenger.createPassengerSession(actor);
  prisma.contactMessage={findMany:async()=>{throw new Error("Unverified email authorized contact export");},deleteMany:async({where})=>{assert.deepEqual(where,{id:{in:[]}});return {count:0};}};
  prisma.rentalInquiry={findMany:async()=>[],deleteMany:async()=>({count:0})};
  prisma.oTP={deleteMany:async()=>({count:0})};
  prisma.booking.deleteMany=async()=>({count:0});
  prisma.$transaction=ops=>Promise.all(ops);
  booking=null;
  const exported=await load("app/api/gdpr/export/route.ts").POST(request("POST",token,"PASSENGER",{}));
  assert.equal(exported.status,200);assert.deepEqual((await exported.json()).data.contactMessages,[]);
  const deleted=await load("app/api/gdpr/delete/route.ts").POST(request("POST",token,"PASSENGER",{confirmation:true}));
  assert.equal(deleted.status,200);
});
console.log("Phase 3A isolated runtime checks passed (no real DB/Stripe/maps/email).");
await test("final closure logout flows and replay policy",async()=>{
  const dashboard=fs.readFileSync(path.join(root,"app/driver/dashboard/page.tsx"),"utf8");
  assert.ok(dashboard.includes('/api/driver/logout'));
  assert.ok(dashboard.includes('csrfFetch("driver"'));
  assert.ok(dashboard.includes('router.push("/driver/login")'));

  actor={...actor,status:"ACTIVE",authVersion:0};
  const driverToken=await session.createCanonicalToken({sub:id,actor:"DRIVER",role:"DRIVER",ver:0});
  const driverLogout=await load("app/api/driver/logout/route.ts").POST(request("POST",driverToken,"DRIVER",{}));
  const driverCookies=driverLogout.cookies.getAll().map(c=>c.name);
  assert.ok(driverCookies.includes(session.sessionCookieName("DRIVER")));
  assert.ok(driverCookies.includes(session.csrfCookieName("DRIVER")));
  assert.equal(driverCookies.some(n=>n.includes("passenger")||n.includes("admin")),false);
  assert.equal((await load("app/api/driver/me/route.ts").GET(request("GET",undefined,"DRIVER"))).status,401);
  assert.equal((await load("app/api/driver/status/route.ts").PATCH(request("PATCH",undefined,"DRIVER",{}))).status,401);

  const adminToken=await session.createCanonicalToken({sub:id,actor:"ADMIN",role:"DISPATCHER",ver:0});
  const adminLogout=await load("app/api/admin/logout/route.ts").POST(request("POST",adminToken,"ADMIN",{}));
  const adminCookies=adminLogout.cookies.getAll().map(c=>c.name);
  assert.ok(adminCookies.includes(session.sessionCookieName("ADMIN")));
  assert.ok(adminCookies.includes(session.csrfCookieName("ADMIN")));
  assert.equal(adminCookies.some(n=>n.includes("passenger")||n.includes("driver")),false);
  assert.equal((await load("app/api/admin/me/route.ts").GET(request("GET",undefined,"ADMIN"))).status,401);

  records=[{id:sid,passengerId:id,tokenHash:passenger.hashSecret("logout-jti"),expiresAt:new Date(Date.now()+60000),revokedAt:null}];
  const passengerToken={token:"unused",csrfToken:"unused"};
  actor={...actor,status:"ACTIVE",authVersion:0};
  const pCanonical=await passenger.createPassengerSession(actor);
  const passengerLogout=await load("app/api/passenger/logout/route.ts").POST(request("POST",pCanonical,"PASSENGER",{}));
  const passengerCookies=passengerLogout.cookies.getAll().map(c=>c.name);
  assert.ok(passengerCookies.includes(session.sessionCookieName("PASSENGER")));
  assert.ok(passengerCookies.includes(session.csrfCookieName("PASSENGER")));
  assert.ok(passengerCookies.includes("drivo_passenger_token"));
  assert.equal(passengerCookies.some(n=>n.includes("driver")||n.includes("admin")),false);
  assert.equal(await passenger.getPassengerFromRequest(request("GET",pCanonical)),null);

  actor={...actor,authVersion:1};
  assert.equal((await auth.authorizeDriver(request("GET",driverToken,"DRIVER"))).response.status,401);
  assert.equal((await auth.authorizeAdmin(request("GET",adminToken,"ADMIN"))).response.status,401);
  console.log("Replay policy: expiry/authVersion/actor state; passenger session revocation; driver/admin logout is cookie-only.");
});
console.log("Phase 3A isolated runtime checks passed (no real DB/Stripe/maps/email).");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
