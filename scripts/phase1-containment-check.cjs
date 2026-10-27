// Actual application routes/services with isolated adapters. No .env files,
// provider sends or production connections. Optional loopback-only MongoDB mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const ts = require('typescript');
const bcrypt = require('bcryptjs');
const mongoUrl = process.env.PHASE1_TEST_MONGO_URL;
if (mongoUrl) {
  const url = new URL(mongoUrl);
  assert.equal(url.protocol, 'mongodb:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/drivo_phase1_test_[a-f0-9]+$/);
  assert.ok(!url.username && !url.password, 'never accept external credentials');
}
Object.assign(process.env, {
  NODE_ENV: 'production', APP_ORIGIN: 'https://phase1.example',
  DATABASE_URL: mongoUrl || 'mongodb://127.0.0.1:1/isolated_never_connected',
  AUTH_SIGNING_SECRET: 'phase1-synthetic-signing-key-000000000000000',
  CSRF_HMAC_SECRET: 'phase1-synthetic-csrf-key-0000000000000000000',
  AUTH_RATE_LIMIT_KEY_SECRET: 'phase1-synthetic-limit-key-00000000000000000',
  NEXT_PUBLIC_CHILDREN_TRANSPORT_ENABLED: 'false',
  DRIVO_DISPATCH_OFFER_TTL_SECONDS: '30', DRIVO_DISPATCH_LOCATION_MAX_AGE_SECONDS: '120',
});
global.fetch = async () => { throw new Error('unexpected provider/network call'); };
const { NextRequest, NextResponse } = require('next/server');
const ids = { p: '111111111111111111111111', q: '222222222222222222222222', b: '333333333333333333333333', d: '444444444444444444444444', a: '555555555555555555555555', op: '666666666666666666666666', v: '777777777777777777777777' };
const names = ['booking','passenger','driver','vehicle','adminUser','dispatchOperator','passengerSession','passengerTrustedDevice','passengerVerificationProof','oTP','outboxEvent','adminAuditEvent','dispatchAuditEvent','rideRequest','bookingPayment','paymentWebhookEvent','dispatchBookingRequest','cashCollection','invoiceBillingAccount','bookingInvoice'];
const clone = v => v && structuredClone(v);
function matches(row, where = {}) {
  return Object.entries(where).every(([k,v]) => {
    if (k === 'AND') return v.every(w => matches(row,w));
    if (k === 'OR') return v.some(w => matches(row,w));
    if (k === 'NOT') return !matches(row,v);
    const a = row[k];
    if (v instanceof Date) return +a === +v;
    if (v && typeof v === 'object') return Object.entries(v).every(([op,n]) => {
      if (op === 'mode') return true;
      if (op === 'equals') return v.mode === 'insensitive' ? String(a).toLowerCase() === String(n).toLowerCase() : a === n;
      if (op === 'contains') return String(a || '').includes(n);
      if (op === 'not') return a !== n && a !== undefined;
      if (op === 'in') return n.includes(a);
      if (op === 'notIn') return !n.includes(a);
      if (op === 'isSet') return (a !== undefined) === n;
      if (op === 'gt') return a > n;
      if (op === 'gte') return a >= n;
      if (op === 'lt') return a < n;
      if (op === 'lte') return a <= n;
      throw new Error('unsupported query operator '+op);
    });
    return v === null ? a == null : a === v;
  });
}
let data = {}, bookingConflict = false, ownerConflict = false, outboxFailure = false, receiptFailure = false, queueFailure = false;
function memory() {
  const db = {};
  const project = (r,args={}) => {
    if (!r) return null;
    r = clone(r);
    if (args.include?.vehicle) r.vehicle = clone(data.vehicle.find(x=>x.id===r.vehicleId)) || null;
    if (args.include?.driver) r.driver = clone(data.driver.find(x=>x.id===r.driverId)) || null;
    if (args.select) r = Object.fromEntries(Object.keys(args.select).filter(k=>args.select[k]).map(k=>[k,r[k]]));
    return r;
  };
  for (const name of names) db[name] = {
    findUnique: async a=>project(data[name].find(r=>matches(r,a.where)),a),
    findUniqueOrThrow: async a=>{const r=project(data[name].find(r=>matches(r,a.where)),a);assert.ok(r);return r;},
    findFirst: async a=>project(data[name].find(r=>matches(r,a.where)),a),
    findMany: async (a={})=>data[name].filter(r=>matches(r,a.where)).slice(0,a.take || Infinity).map(r=>project(r,a)),
    count: async (a={})=>data[name].filter(r=>matches(r,a.where)).length,
    create: async ({data:input})=>{
      if (name==='outboxEvent' && outboxFailure) throw new Error('injected outbox failure');
      if (name==='cashCollection' && data[name].some(r=>r.bookingId===input.bookingId || r.operationKey===input.operationKey)) throw Object.assign(new Error('duplicate cash collection'),{code:'P2002'});
      const r={id:crypto.randomBytes(12).toString('hex'),createdAt:new Date(),updatedAt:new Date(),consumedAt:null,revokedAt:null,...(name==='oTP'?{used:false,attempts:0,maxAttempts:5}:{}),...(name==='paymentWebhookEvent'?{provider:'STRIPE',processingStatus:'RECEIVED',bookingId:null,paymentId:null}:{}),...clone(input)};
      data[name].push(r); return clone(r);
    },
    updateMany: async ({where, data:input})=>{
      if (name==='booking' && bookingConflict && input.driverId) { bookingConflict=false; return {count:0}; }
      if (name==='booking' && ownerConflict && input.passengerId) { ownerConflict=false; return {count:0}; }
      const rows=data[name].filter(r=>matches(r,where));
      for (const r of rows) for (const [k,v] of Object.entries(input)) r[k]=v && typeof v==='object' && 'increment' in v ? (r[k]||0)+v.increment : clone(v);
      return {count:rows.length};
    },
    update: async a=>{ const r=data[name].find(x=>matches(x,a.where)); assert.ok(r); await db[name].updateMany(a); return project(r,a); },
    deleteMany: async ({where}={})=>{const n=data[name].length; data[name]=data[name].filter(r=>!matches(r,where));return {count:n-data[name].length};},
  };
  let serial=Promise.resolve();
  db.$transaction=f=>{const run=serial.then(async()=>{const before=clone(data);try{return await f(db);}catch(e){data=before;throw e;}});serial=run.catch(()=>{});return run;};
  return db;
}
let rawDb = mongoUrl ? new (require('@prisma/client').PrismaClient)({datasourceUrl:mongoUrl}) : memory();
function instrument(db) {
  return new Proxy(db,{get(target,key){
    if(key==='$transaction') return f=>target.$transaction(tx=>f(instrument(tx)));
    if(key==='booking') return new Proxy(target.booking,{get(model,method){
      if(method==='updateMany') return args=>{if(bookingConflict && args.data.driverId){bookingConflict=false;return Promise.resolve({count:0});}if(ownerConflict && args.data.passengerId){ownerConflict=false;return Promise.resolve({count:0});}return model.updateMany(args);};
      return typeof model[method]==='function'?model[method].bind(model):model[method];
    }});
    if(key==='outboxEvent') return new Proxy(target.outboxEvent,{get(model,method){
      if(method==='create') return args=>{if(outboxFailure) throw new Error('injected outbox failure');return model.create(args);};
      return typeof model[method]==='function'?model[method].bind(model):model[method];
    }});
    if(key==='paymentWebhookEvent') return new Proxy(target.paymentWebhookEvent,{get(model,method){
      if(method==='update') return args=>{if(receiptFailure) throw new Error('injected receipt failure');return model.update(args);};
      return typeof model[method]==='function'?model[method].bind(model):model[method];
    }});
    return typeof target[key]==='function'?target[key].bind(target):target[key];
  }});
}
const prisma = instrument(rawDb);
let mailCalls=0, providerCalls=0, verifiedStripeEvent=null;
const mocks = {
  '@/lib/prisma':{prisma},
  '@/lib/rate-limit':{withRateLimit:h=>h,withDistributedIpRateLimit:h=>h,enforceAuthRateLimit:async()=>({allowed:true}),resolveClientIp:()=> '127.0.0.1',authRateLimitResponse:()=>NextResponse.json({}, {status:429}),rateLimits:new Proxy({}, {get:()=>({max:5,windowMs:60000})})},
  '@/lib/navigation/routes':{validCoordinate:(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max,computeGoogleRoute:async()=>({distanceKm:1,durationSeconds:60,durationMinutes:1})},
  '@/lib/booking-quote':{calculateAuthoritativeBookingQuote:async()=>({distance:{distanceKm:10},breakdown:{baseFare:3,distanceCharge:17,waitingCharge:0,optionalServiceCharges:{},nightServiceCharge:0,minimumFareAdjustment:0,totalFare:20}})},
  '@/lib/email':{bookingToEmailData:b=>b,sendBookingCompletionEmails:async()=>{mailCalls++;},isSeniorAssistedService:()=>false},
  '@/lib/twilio':{sendWhatsAppVerification:async()=>{providerCalls++;return {success:true,status:'pending'};},checkWhatsAppVerification:async()=>{providerCalls++;return {success:true,status:'approved'};}},
  '@/lib/stripe':{verifyWebhookSignature:(_body,signature)=>({valid:signature==='phase1-synthetic-valid'&&Boolean(verifiedStripeEvent),event:verifiedStripeEvent})},
  '@/lib/commission-engine':{calculateBookingFinancialBreakdown:()=>({}),createOrUpdateDriverEarningForBooking:async()=>({})},
  '@/lib/earnings-ledger':{postTripEarningLedger:async()=>({})},
  '@/lib/realtime/queues':{getScheduledRideQueue:()=>{if(queueFailure)throw new Error('injected queue failure');return {waitUntilReady:async()=>{},add:async()=>null,getJob:async()=>null};}},
};
const cache = new Map();
function load(file) {
  const full=path.resolve(file); if(cache.has(full)) return cache.get(full).exports;
  const m=new Module(full,module);m.filename=full;m.paths=Module._nodeModulePaths(path.dirname(full));cache.set(full,m);
  m.require=n=>{
    if(n in mocks) return mocks[n];
    if(n.startsWith('@/') || n.startsWith('.')) {const p=n.startsWith('@/')?path.resolve(n.slice(2)):path.resolve(path.dirname(full),n);if(fs.existsSync(p+'.ts'))return load(p+'.ts');}
    return require(n);
  };
  m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,full);return m.exports;
}
const session=load('lib/security/session.ts'), auth=load('lib/passenger-auth.ts');
const password='Synthetic-only-passphrase-123';
let hash;
async function reset() {
  if(mongoUrl) for(const name of [...names].reverse()) await rawDb[name].deleteMany({});
  else data=Object.fromEntries(names.map(n=>[n,[]]));
  bookingConflict=false;ownerConflict=false;outboxFailure=false;receiptFailure=false;queueFailure=false;mailCalls=0;providerCalls=0;verifiedStripeEvent=null;
  for(const [id,phone,email] of [[ids.p,'+421900000001','passenger1@example.test'],[ids.q,'+421900000002','passenger2@example.test']]) await prisma.passenger.create({data:{id,phone,normalizedPhone:phone,email,fullName:'Synthetic Passenger',phoneVerified:true,profileCompleted:true,status:'ACTIVE',authVersion:0,passwordHash:hash}});
  await prisma.adminUser.create({data:{id:ids.a,email:'staff@example.test',fullName:'Synthetic Admin',passwordHash:hash,role:'DISPATCHER',authVersion:0}});
  await prisma.dispatchOperator.create({data:{id:ids.op,email:'operator@example.test',phone:'+421900000003',normalizedPhone:'+421900000003',fullName:'Synthetic Operator',passwordHash:hash,status:'ACTIVE',mustChangePassword:false,authVersion:0}});
  await prisma.vehicle.create({data:{id:ids.v,plateNumber:'TEST-ONLY',type:'STANDARD',status:'ACTIVE',maxPassengers:4}});
  await prisma.driver.create({data:{id:ids.d,fullName:'Synthetic Driver',phone:'+421900000004',vehicleId:ids.v,vehicleType:'STANDARD',vehicleCapacity:4,status:'ACTIVE',isOnline:true,isOnTrip:false,authVersion:0,currentLat:48.14,currentLng:17.1,lastLocationReceivedAt:new Date()}});
}
const input = (method='CASH')=>({serviceType:'STANDARD',pickupAddress:'Synthetic pickup',dropoffAddress:'Synthetic destination',scheduledDate:'2026-12-20',scheduledTime:'12:00',pickupDate:'2026-12-20',pickupTime:'12:00',passengerCount:1,luggageType:'NONE',smallBags:0,largeBags:0,companionCount:0,customerName:'Synthetic Passenger',customerEmail:'passenger1@example.test',customerPhone:'900000001',customerPhoneCode:'+421',languagePref:'en',paymentMethod:method,cashAgreed:true,scheduledRide:true,pickupLat:48.14,pickupLng:17.1,dropoffLat:48.15,dropoffLng:17.12});
async function booking(overrides={}) {return prisma.booking.create({data:{...input(),id:ids.b,bookingRef:'TEST-'+crypto.randomBytes(4).toString('hex'),status:'PENDING',dispatchStatus:'NOT_STARTED',passengerId:ids.p,normalizedPhone:'+421900000001',phoneVerified:true,passengerAuthStatus:'AUTHENTICATED',passengerAuthCompletedAt:new Date(),bookingSource:'WEB',driverId:null,estimatedPrice:20,...overrides}});}
async function request(url,body,actor='PASSENGER',extra={}) {
  const method=extra.method || 'POST';extra={...extra};delete extra.method;
  let headers={origin:process.env.APP_ORIGIN,'content-type':'application/json'};
  if(actor) {
    const id=actor==='PASSENGER'?ids.p:actor==='ADMIN'?ids.a:actor==='DRIVER'?ids.d:ids.op;
    const s=actor==='PASSENGER'?await auth.createPassengerSession({id,authVersion:0}):await session.createCanonicalToken({sub:id,actor,role:actor==='ADMIN'?'DISPATCHER':actor,ver:0});
    headers={...headers,cookie:session.sessionCookieName(actor)+'='+s.token+'; '+session.csrfCookieName(actor)+'='+s.csrfToken,'x-drivo-csrf':s.csrfToken};
  }
  if(extra.cookie) extra={...extra,cookie:[headers.cookie,extra.cookie].filter(Boolean).join('; ')};
  else delete extra.cookie;
  return new NextRequest(process.env.APP_ORIGIN+url,{method,headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const cookieOf=r=>r.cookies.getAll().map(c=>c.name+'='+c.value).join('; ');
async function guestBooking(overrides={}) {
  const r=await load('app/api/bookings/route.ts').POST(await request('/api/bookings',{...input(),...overrides},null));
  assert.equal(r.status,201);const body=await r.json();return {body,cookie:cookieOf(r)};
}
let failures=0, passes=0;
async function test(name,fn){await reset();try{await fn();console.log('PASS '+name);passes++;}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}}
async function main(){
  hash=await bcrypt.hash(password,4);
  await test('email login cannot claim another passenger booking',async()=>{
    await booking({passengerId:ids.q,normalizedPhone:'+421900000002'});
    const r=await load('app/api/passenger/login/password/route.ts').POST(await request('/api/passenger/login/password',{identifier:'passenger1@example.test',password,bookingId:ids.b},null));
    assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).passengerId,ids.q);
    assert.ok([200,403,404].includes(r.status));
  });
  await test('anonymous booking cannot be claimed from matching phone alone',async()=>{
    await booking({passengerId:null,phoneVerified:false,passengerAuthStatus:'PENDING_PHONE_VERIFICATION'});
    const r=await load('app/api/passenger/booking/continue/route.ts').POST(await request('/api/passenger/booking/continue',{bookingId:ids.b}));
    assert.ok([403,404].includes(r.status));assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).passengerId,null);
  });
  await test('owned passenger continuation remains available',async()=>{
    await booking(); const r=await load('app/api/passenger/booking/continue/route.ts').POST(await request('/api/passenger/booking/continue',{bookingId:ids.b}));assert.equal(r.status,200);
  });
  for(const actor of [null,'DISPATCH_OPERATOR']) await test('crafted Invoice rejected by '+(actor?'Dispatcher':'public')+' API',async()=>{
    const file=actor?'app/api/dispatch/bookings/route.ts':'app/api/bookings/route.ts';
    const r=await load(file).POST(await request('/api/bookings',input('INVOICE'),actor,actor?{'idempotency-key':crypto.randomUUID()}:{}));
    assert.equal(r.status,403);assert.equal(await prisma.booking.count({}),0);
  });
  for(const method of ['CASH','CARD']) await test('Dispatcher '+method+' booking still creates without a passenger account or guest capability',async()=>{
    const result=await load('app/api/dispatch/bookings/route.ts').POST(await request('/api/dispatch/bookings',{...input(method),scheduledRide:true},'DISPATCH_OPERATOR',{'idempotency-key':crypto.randomUUID()}));
    assert.equal(result.status,201,JSON.stringify(await result.clone().json()));
    const made=await prisma.booking.findFirst({where:{bookingSource:'PHONE_DISPATCH'}});
    assert.ok(made);assert.equal(made.passengerId,null);assert.equal(made.paymentMethod,method);
    assert.equal(await prisma.passengerVerificationProof.count({where:{purpose:'PUBLIC_BOOKING_ACCESS'}}),0);
  });
  await test('signed-in public booking with a different phone waits for its own verification',async()=>{
    const result=await load('app/api/bookings/route.ts').POST(await request('/api/bookings',{...input('CASH'),customerPhone:'900000009',scheduledRide:false},'PASSENGER'));
    assert.equal(result.status,201);const body=await result.json();const made=await prisma.booking.findUnique({where:{id:body.bookingId}});
    assert.equal(made.passengerId,null);assert.equal(made.phoneVerified,false);
    assert.equal(await prisma.rideRequest.count({where:{bookingId:made.id}}),0);
    assert.ok(cookieOf(result).includes('drivo-booking-access-'));
  });
  await test('verified signed-in passenger creates an owned booking without guest capability',async()=>{
    const result=await load('app/api/bookings/route.ts').POST(await request('/api/bookings',input('CASH'),'PASSENGER'));
    assert.equal(result.status,201);const body=await result.json();const made=await prisma.booking.findUnique({where:{id:body.bookingId}});
    assert.equal(made.passengerId,ids.p);assert.equal(made.phoneVerified,true);
    assert.ok(!cookieOf(result).includes('booking-access-'));
  });
  await test('Invoice is visible to public but Dispatcher is restricted to CASH and CARD',async()=>{
    const publicSource=fs.readFileSync('components/booking/BookingForm.tsx','utf8');
    assert.ok(publicSource.includes('["invoice"'), 'Invoice option missing on public booking form');
    assert.ok(publicSource.includes('/api/passenger/invoice-eligibility'), 'Invoice approval check missing');
    const staffSource=fs.readFileSync('app/dispatch/bookings/new/page.tsx','utf8');
    assert.ok(!staffSource.includes('["INVOICE"'), 'Staff booking must not bypass passenger ownership');
  });
  await test('invoice eligibility defaults to denied, is private and requires passenger login',async()=>{
    const route=load('app/api/passenger/invoice-eligibility/route.ts');
    const unauth=await route.GET(await request('/api/passenger/invoice-eligibility',undefined,null,{method:'GET'}));
    assert.equal(unauth.status,401);
    const normal=await route.GET(await request('/api/passenger/invoice-eligibility',undefined,'PASSENGER',{method:'GET'}));
    assert.equal(normal.status,200);
    assert.equal((await normal.json()).eligible,false);
    assert.equal(normal.headers.get('cache-control'),'private, no-store');
  });
  await test('only Super Admin may grant invoice eligibility',async()=>{
    const route=load('app/api/admin/invoicing/route.ts');
    const denied=await route.PATCH(await request('/api/admin/invoicing',{
      action:'APPROVE',passengerId:ids.p,billingName:'Synthetic Organisation',billingAddress:'Test Street 123 Bratislava',
    },'ADMIN',{method:'PATCH'}));
    assert.equal(denied.status,403);
    assert.equal(await prisma.invoiceBillingAccount.count({}),0);
  });
  await test('Super Admin approval enables invoice booking with atomic invoice and one outbox event',async()=>{
    await prisma.adminUser.update({where:{id:ids.a},data:{role:'SUPER_ADMIN'}});
    const admin=load('app/api/admin/invoicing/route.ts');
    const grant=await admin.PATCH(await request('/api/admin/invoicing',{
      action:'APPROVE',passengerId:ids.p,billingName:'Synthetic Organisation',
      billingAddress:'Test Street 123 Bratislava',billingTaxId:'SK1234567890',
    },'ADMIN',{method:'PATCH'}));
    assert.equal(grant.status,200,JSON.stringify(await grant.json()));
    const status=await load('app/api/passenger/invoice-eligibility/route.ts').GET(await request('/api/passenger/invoice-eligibility',undefined,'PASSENGER',{method:'GET'}));
    assert.equal((await status.json()).eligible,true);
    const result=await load('app/api/bookings/route.ts').POST(await request('/api/bookings',input('INVOICE'),'PASSENGER'));
    assert.equal(result.status,201,JSON.stringify(await result.clone().json()));
    const response=await result.json();
    const invoice=await prisma.bookingInvoice.findUnique({where:{bookingId:response.bookingId}});
    assert.ok(invoice);assert.equal(invoice.passengerId,ids.p);assert.equal(invoice.amountMinor,2000);
    assert.equal(invoice.status,'ISSUED');assert.equal(invoice.currency,'EUR');
    assert.equal(invoice.billingName,'Synthetic Organisation');assert.equal(invoice.billingTaxId,'SK1234567890');
    assert.ok(invoice.dueAt.getTime()>invoice.issuedAt.getTime());
    assert.equal(await prisma.outboxEvent.count({where:{idempotencyKey:'booking-activation:'+response.bookingId}}),1);
    const eligibility=await load('lib/booking-eligibility.ts').authoritativeAssignmentEligibility(
      await prisma.booking.findUnique({where:{id:response.bookingId}}),prisma);
    assert.equal(eligibility.eligible,true);
    const ownerView=await load('app/api/passenger/invoices/route.ts').GET(await request('/api/passenger/invoices',undefined,'PASSENGER',{method:'GET'}));
    assert.equal(ownerView.status,200);assert.equal((await ownerView.json()).invoices.length,1);
  });
  await test('Invoice remains denied when phone identity does not match approved passenger',async()=>{
    await prisma.invoiceBillingAccount.create({data:{passengerId:ids.p,status:'APPROVED',
      billingName:'Synthetic Organisation',billingAddress:'Test Street 123 Bratislava'}});
    const r=await load('app/api/bookings/route.ts').POST(await request('/api/bookings',{...input('INVOICE'),customerPhone:'900000009'},'PASSENGER'));
    assert.equal(r.status,403);assert.equal(await prisma.bookingInvoice.count({}),0);
    assert.equal(await prisma.booking.count({}),0);
  });
  await test('Super Admin revocation blocks new Invoice bookings and preserves historical invoices',async()=>{
    await prisma.adminUser.update({where:{id:ids.a},data:{role:'SUPER_ADMIN'}});
    const admin=load('app/api/admin/invoicing/route.ts');
    const grant=await admin.PATCH(await request('/api/admin/invoicing',{
      action:'APPROVE',passengerId:ids.p,billingName:'Synthetic Organisation',
      billingAddress:'Test Street 123 Bratislava',
    },'ADMIN',{method:'PATCH'}));
    assert.equal(grant.status,200);
    const first=await load('app/api/bookings/route.ts').POST(await request('/api/bookings',input('INVOICE'),'PASSENGER'));
    assert.equal(first.status,201);
    const b=(await first.json()).bookingId;
    const rev=await admin.PATCH(await request('/api/admin/invoicing',{
      action:'REVOKE',passengerId:ids.p,reason:'Synthetic revocation test',
    },'ADMIN',{method:'PATCH'}));
    assert.equal(rev.status,200);
    const second=await load('app/api/bookings/route.ts').POST(await request('/api/bookings',input('INVOICE'),'PASSENGER'));
    assert.equal(second.status,403);assert.equal(await prisma.bookingInvoice.count({}),1);
    assert.ok(await prisma.bookingInvoice.findUnique({where:{bookingId:b}}));
  });
  await test('Super Admin marks issued invoice paid exactly once; non-admin may not',async()=>{
    await prisma.bookingInvoice.create({data:{bookingId:ids.b,passengerId:ids.p,
      billingAccountId:ids.p,invoiceNumber:'INV-TEST-01',bookingRef:'TEST-01',
      billingName:'Synthetic Organisation',billingAddress:'Test Street 123 Bratislava',
      amountMinor:2000,currency:'EUR',status:'ISSUED',dueAt:new Date(Date.now()+86400000)}});
    const inv=await prisma.bookingInvoice.findFirst({});
    const api=load('app/api/admin/invoicing/route.ts');
    const denied=await api.PATCH(await request('/api/admin/invoicing',{
      action:'MARK_PAID',invoiceId:inv.id,paymentReference:'TEST-TRANSFER-001',
    },'ADMIN',{method:'PATCH'}));assert.equal(denied.status,403);
    await prisma.adminUser.update({where:{id:ids.a},data:{role:'SUPER_ADMIN'}});
    const paid=await api.PATCH(await request('/api/admin/invoicing',{
      action:'MARK_PAID',invoiceId:inv.id,paymentReference:'TEST-TRANSFER-001',
    },'ADMIN',{method:'PATCH'}));
    assert.equal(paid.status,200);
    assert.equal((await prisma.bookingInvoice.findUnique({where:{id:inv.id}})).status,'PAID');
    const repeated=await api.PATCH(await request('/api/admin/invoicing',{
      action:'MARK_PAID',invoiceId:inv.id,paymentReference:'TEST-TRANSFER-001',
    },'ADMIN',{method:'PATCH'}));
    assert.equal(repeated.status,409);
    assert.equal(await prisma.adminAuditEvent.count({where:{action:'INVOICE_PAID'}}),1);
  });
  for(const compatibility of [true,false]) await test('unpaid CARD rejected by '+(compatibility?'compatibility':'domain')+' Admin assignment',async()=>{
    await booking({paymentMethod:'CARD'});
    const r=await load(compatibility?'app/api/admin/bookings/route.ts':'app/api/admin/operations/assign/route.ts')[compatibility?'PATCH':'POST'](await request('/api/admin/assign',{bookingId:ids.b,driverId:ids.d,...(compatibility?{}:{reason:'Synthetic test',requestId:crypto.randomUUID()})},'ADMIN'));
    assert.equal(r.status,409);assert.equal((await prisma.driver.findUnique({where:{id:ids.d}})).isOnTrip,false);
  });
  await test('Admin booking CAS failure rolls back claimed driver',async()=>{
    await booking({scheduledRide:false});bookingConflict=true;
    const result=await load('lib/admin-operations.ts').assignAdminDriver({bookingId:ids.b,driverId:ids.d,reason:'Synthetic test',requestId:crypto.randomUUID()},ids.a);
    assert.equal(result.ok,false);assert.equal((await prisma.driver.findUnique({where:{id:ids.d}})).isOnTrip,false);
  });
  for(const expired of [false,true]) await test((expired?'expired':'revoked')+' passenger database session denied by realtime',async()=>{
    const s=await auth.createPassengerSession({id:ids.p,authVersion:0});
    await prisma.passengerSession.updateMany({where:{passengerId:ids.p},data:expired?{expiresAt:new Date(0)}:{revokedAt:new Date()}});
    await assert.rejects(()=>load('lib/realtime/auth.ts').authenticateHandshake({headers:{origin:process.env.APP_ORIGIN,cookie:session.sessionCookieName('PASSENGER')+'='+s.token}},'PASSENGER'));
  });
  await test('guest create -> password login -> capability continuation -> retry',async()=>{
    const g=await guestBooking();assert.ok(g.cookie.includes('__Host-drivo-booking-access-'));
    assert.ok(!JSON.stringify(g.body).includes('proofToken'));
    const login=await load('app/api/passenger/login/password/route.ts').POST(await request('/api/passenger/login/password',{phone:'+421900000001',password,bookingId:g.body.bookingId},null,{cookie:g.cookie}));assert.equal(login.status,200);
    assert.equal((await prisma.booking.findUnique({where:{id:g.body.bookingId}})).passengerId,null);
    const req=()=>request('/api/passenger/booking/continue',{bookingId:g.body.bookingId},null,{cookie:g.cookie+'; '+cookieOf(login),'x-drivo-csrf':login.cookies.get(session.csrfCookieName('PASSENGER')).value});
    const cont=load('app/api/passenger/booking/continue/route.ts');assert.equal((await cont.POST(await req())).status,200);assert.equal((await cont.POST(await req())).status,200);
    assert.equal((await prisma.booking.findUnique({where:{id:g.body.bookingId}})).passengerId,ids.p);
  });
  await test('newly created public booking can be claimed after authorized continuation',async()=>{
    const g=await guestBooking();
    const continued=await load('app/api/passenger/booking/continue/route.ts').POST(await request('/api/passenger/booking/continue',{bookingId:g.body.bookingId},'PASSENGER',{cookie:g.cookie}));assert.equal(continued.status,200);
    const listing=await load('app/api/driver/scheduled-rides/route.ts').GET(await request('/api/driver/scheduled-rides',undefined,'DRIVER',{method:'GET'}));
    assert.equal(listing.status,200);assert.equal((await listing.json()).marketplace.length,1);
    const result=await load('lib/scheduled-marketplace.ts').claimScheduledRide(g.body.bookingId,ids.d);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal((await prisma.booking.findUnique({where:{id:g.body.bookingId}})).driverId,ids.d);
  });
  for(const mode of ['missing','tampered','expired','different-booking','wrong-purpose']) await test('guest capability rejects '+mode,async()=>{
    const g=await guestBooking();let cookie=g.cookie;
    if(mode==='missing')cookie='';
    if(mode==='tampered')cookie=cookie.slice(0,-1)+'!';
    if(mode==='expired')await prisma.passengerVerificationProof.updateMany({where:{bookingId:g.body.bookingId},data:{expiresAt:new Date(0)}});
    if(mode==='wrong-purpose')await prisma.passengerVerificationProof.updateMany({where:{bookingId:g.body.bookingId},data:{purpose:'PASSENGER_PASSWORD_RESET_EMAIL'}});
    if(mode==='different-booking'){await booking({passengerId:null,phoneVerified:false,passengerAuthStatus:'PENDING_PHONE_VERIFICATION'});g.body.bookingId=ids.b;}
    const r=await load('app/api/passenger/booking/continue/route.ts').POST(await request('/api/passenger/booking/continue',{bookingId:g.body.bookingId},'PASSENGER',{cookie}));assert.equal(r.status,404);
    assert.equal((await prisma.booking.findUnique({where:{id:g.body.bookingId}})).passengerId,null);
  });
  await test('guest capability never takes a now-owned booking from another account',async()=>{
    const g=await guestBooking();await prisma.booking.update({where:{id:g.body.bookingId},data:{passengerId:ids.q}});
    const r=await load('app/api/passenger/booking/continue/route.ts').POST(await request('/api/passenger/booking/continue',{bookingId:g.body.bookingId},'PASSENGER',{cookie:g.cookie}));assert.equal(r.status,404);
  });
  await test('new guest registration verifies OTP, binds owner atomically and continues',async()=>{
    const g=await guestBooking({customerPhone:'900000009',customerEmail:'new@example.test'});const phone='+421900000009';
    const send=await load('app/api/otp/send/route.ts').POST(await request('/api/otp/send',{bookingId:g.body.bookingId,phone},null,{cookie:g.cookie}));assert.equal(send.status,200);
    const verify=await load('app/api/otp/verify/route.ts').POST(await request('/api/otp/verify',{bookingId:g.body.bookingId,code:'123456'},null,{cookie:g.cookie}));assert.equal(verify.status,200);const proof=await verify.json();
    const r=await load('app/api/passenger/account/create/route.ts').POST(await request('/api/passenger/account/create',{bookingId:g.body.bookingId,phone,registrationProofToken:proof.registrationProofToken,fullName:'Synthetic New Passenger',email:'new@example.test',password,confirmPassword:password,rememberDevice:false},null,{cookie:g.cookie}));assert.equal(r.status,200);const result=await r.json();
    assert.equal((await prisma.booking.findUnique({where:{id:g.body.bookingId}})).passengerId,result.passenger.id);
    const c=await load('app/api/passenger/booking/continue/route.ts').POST(await request('/api/passenger/booking/continue',{bookingId:g.body.bookingId},null,{cookie:cookieOf(r),'x-drivo-csrf':r.cookies.get(session.csrfCookieName('PASSENGER')).value}));assert.equal(c.status,200);
    assert.equal(providerCalls,2);
  });
  await test('OTP cannot touch legacy/unowned booking without its creation capability',async()=>{
    await booking({passengerId:null});
    const s=await load('app/api/otp/send/route.ts').POST(await request('/api/otp/send',{bookingId:ids.b,phone:'+421900000001'},null));assert.equal(s.status,404);
    const v=await load('app/api/otp/verify/route.ts').POST(await request('/api/otp/verify',{bookingId:ids.b,code:'123456'},null));assert.equal(v.status,404);assert.equal(providerCalls,0);
  });
  for(const compatibility of [true,false]) for(const invalid of ['unverified','terminal','capacity','negative-companions','inactive-driver','unpaid-confirmed-card','historical-invoice']) await test((compatibility?'compatibility':'domain')+' Admin blocks '+invalid,async()=>{
    const fields=invalid==='unverified'?{phoneVerified:false,passengerAuthStatus:'PENDING_PHONE_VERIFICATION'}:invalid==='terminal'?{status:'CANCELLED'}:invalid==='capacity'?{passengerCount:6}:invalid==='negative-companions'?{companionCount:-1}:invalid==='unpaid-confirmed-card'?{status:'CONFIRMED',paymentMethod:'CARD'}:invalid==='historical-invoice'?{paymentMethod:'INVOICE'}:{};
    await booking(fields);if(invalid==='inactive-driver')await prisma.driver.update({where:{id:ids.d},data:{status:'DISABLED'}});
    const r=await load(compatibility?'app/api/admin/bookings/route.ts':'app/api/admin/operations/assign/route.ts')[compatibility?'PATCH':'POST'](await request('/api/admin/assign',{bookingId:ids.b,driverId:ids.d,...(compatibility?{}:{reason:'Synthetic test',requestId:crypto.randomUUID()})},'ADMIN'));
    assert.equal(r.status,409);assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).driverId,null);
  });
  await test('late Admin outbox failure rolls back driver, booking, audit and email intent',async()=>{
    await booking({scheduledRide:false});outboxFailure=true;
    const r=await load('lib/admin-operations.ts').assignAdminDriver({bookingId:ids.b,driverId:ids.d,reason:'Synthetic test',requestId:crypto.randomUUID()},ids.a);assert.equal(r.ok,false);
    assert.equal((await prisma.driver.findUnique({where:{id:ids.d}})).isOnTrip,false);assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).driverId,null);assert.equal(await prisma.adminAuditEvent.count({}),0);
  });
  for(const method of ['CASH','CARD']) await test('eligible '+method+' assignment audited and replay safe',async()=>{
    await booking({scheduledRide:false,paymentMethod:method,status:method==='CARD'?'CONFIRMED':'PENDING'});
    if(method==='CARD')await prisma.paymentWebhookEvent.create({data:{provider:'STRIPE',providerEventId:'evt_test_paid',eventType:'checkout.session.completed',bookingId:ids.b,processingStatus:'PROCESSED'}});
    const domain=load('lib/admin-operations.ts');const args={bookingId:ids.b,driverId:ids.d,reason:'Synthetic test',requestId:crypto.randomUUID()};assert.equal((await domain.assignAdminDriver(args,ids.a)).ok,true);
    const assigned=await prisma.booking.findUnique({where:{id:ids.b}});assert.equal(assigned.status,'ASSIGNED');assert.equal((await domain.assignAdminDriver(args,ids.a)).ok,true);assert.equal(await prisma.adminAuditEvent.count({}),1);
    assert.equal(+assigned.acceptedAt,+(await prisma.booking.findUnique({where:{id:ids.b}})).acceptedAt);
  });
  await test('Admin compatibility assignment remains successful when post-commit reminder queue fails',async()=>{
    await booking({scheduledRide:true,pickupAt:new Date(Date.now()+3*3600000)});queueFailure=true;
    const r=await load('app/api/admin/bookings/route.ts').PATCH(await request('/api/admin/bookings',{bookingId:ids.b,driverId:ids.d,status:'ASSIGNED'},'ADMIN'));
    assert.equal(r.status,200);assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).driverId,ids.d);
    assert.equal(await prisma.adminAuditEvent.count({where:{action:'MANUAL_ASSIGNMENT'}}),1);
  });
  await test('active realtime uses session room; revocation removes delivery targets',async()=>{
    const s=await auth.createPassengerSession({id:ids.p,authVersion:0});const rt=load('lib/realtime/auth.ts');const h={headers:{origin:process.env.APP_ORIGIN,cookie:session.sessionCookieName('PASSENGER')+'='+s.token}};
    assert.equal((await rt.authenticateHandshake(h,'PASSENGER')).id,ids.p);
    const delivery=load('lib/security/passenger-session.ts');assert.equal((await delivery.activePassengerRealtimeRooms(ids.p)).length,1);
    await prisma.passengerSession.updateMany({where:{passengerId:ids.p},data:{revokedAt:new Date()}});assert.deepEqual(await delivery.activePassengerRealtimeRooms(ids.p),[]);
  });
  await test('Driver and Admin realtime actors remain isolated',async()=>{
    const rt=load('lib/realtime/auth.ts');for(const actor of ['ADMIN','DRIVER']){const req=await request('/test',{},actor);assert.equal((await rt.authenticateHandshake({headers:{origin:process.env.APP_ORIGIN,cookie:req.headers.get('cookie')}},actor)).id,actor==='ADMIN'?ids.a:ids.d);await assert.rejects(()=>rt.authenticateHandshake({headers:{origin:process.env.APP_ORIGIN,cookie:req.headers.get('cookie')}},'PASSENGER'));}
  });
  await test('live loopback Socket.IO rejects revoked delivery and disconnects invalid incoming work',async()=>{
    const http=require('node:http');const {Server}=require('socket.io');const {io}=require('socket.io-client');
    const server=http.createServer(), sockets=new Server(server,{transports:['websocket']});
    const s=await auth.createPassengerSession({id:ids.p,authVersion:0});
    const ns=sockets.of('/passenger');
    ns.use(async(socket,next)=>{try{const row=await load('lib/realtime/auth.ts').authenticateHandshake(socket.handshake,'PASSENGER');Object.assign(socket.data,row);next();}catch{next(new Error('denied'));}});
    ns.on('connection',socket=>{socket.join(load('lib/security/passenger-session.ts').passengerSessionRoom(socket.data.id,socket.data.realtimeSessionId));load('lib/realtime/passenger-socket.ts').protectPassengerSocket(socket);socket.on('probe',()=>{throw new Error('revoked inbound event was delivered');});});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const client=io('http://127.0.0.1:'+server.address().port+'/passenger',{transports:['websocket'],reconnection:false,extraHeaders:{origin:process.env.APP_ORIGIN,cookie:session.sessionCookieName('PASSENGER')+'='+s.token}});
    const once=(event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('socket timeout: '+event)),3000);client.once(event,()=>{clearTimeout(timer);resolve();});});
    try {
      await once('connect');let delivered=0;client.on('booking-update',()=>delivered++);
      await load('lib/realtime/contracts.ts').emitToActor(sockets,'PASSENGER',ids.p,{eventId:'test-live',type:'booking-update',entityId:ids.b,occurredAt:new Date().toISOString()});await new Promise(r=>setTimeout(r,50));assert.equal(delivered,1);
      await prisma.passengerSession.updateMany({where:{passengerId:ids.p},data:{revokedAt:new Date()}});
      await load('lib/realtime/contracts.ts').emitToActor(sockets,'PASSENGER',ids.p,{eventId:'test-revoked',type:'booking-update',entityId:ids.b,occurredAt:new Date().toISOString()});await new Promise(r=>setTimeout(r,50));assert.equal(delivered,1);
      const disconnected=once('disconnect');client.emit('probe');await disconnected;
    } finally {client.close();await new Promise(r=>sockets.close(r));server.close();}
  });
  await test('scheduled marketplace listing uses internal authority but redacts external offer',async()=>{
    await booking({scheduledRide:true,pickupAt:new Date(Date.now()+3*3600000)});
    const r=await load('app/api/driver/scheduled-rides/route.ts').GET(await request('/api/driver/scheduled-rides',undefined,'DRIVER',{method:'GET'}));assert.equal(r.status,200);const body=await r.json();assert.equal(body.marketplace.length,1);
    for(const field of ['passengerId','phoneVerified','passengerAuthStatus','pickupLat','dropoffLat','createdByDispatchOperatorId','customerEmail'])assert.ok(!(field in body.marketplace[0]),field);
  });
  for(const invalid of ['unverified','unpaid-card','historical-invoice']) for(const path of ['offer','accept','claim','automatic']) await test(path+' blocks '+invalid+' before assignment',async()=>{
    await booking({scheduledRide:path==='claim',pickupAt:new Date(Date.now()+3*3600000),...(invalid==='unverified'?{phoneVerified:false}:invalid==='unpaid-card'?{paymentMethod:'CARD'}:{paymentMethod:'INVOICE'})});
    const ops=load('lib/driver-operations.ts');let result;
    if(path==='offer')result=await ops.createDriverOffer({bookingId:ids.b,driverId:ids.d});
    if(path==='accept'){const offer=await prisma.rideRequest.create({data:{bookingId:ids.b,driverId:ids.d,status:'PENDING',expiresAt:new Date(Date.now()+30000)}});result=await ops.acceptDriverOfferAtomically({offerId:offer.id,driverId:ids.d});assert.equal((await prisma.rideRequest.findUnique({where:{id:offer.id}})).status,'PENDING');}
    if(path==='claim')result=await load('lib/scheduled-marketplace.ts').claimScheduledRide(ids.b,ids.d);
    if(path==='automatic')result=await load('lib/automatic-dispatch.ts').startAutomaticDispatch(ids.b);
    assert.equal(result.ok,false);assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).driverId,null);
  });
  await test('CASH automatic/recovery offer acceptance uses the shared authority and fresh assignment',async()=>{
    await booking({scheduledRide:false,pickupAt:new Date()});const ops=load('lib/driver-operations.ts');const made=await ops.createDriverOffer({bookingId:ids.b,driverId:ids.d});assert.equal(made.ok,true);
    const accepted=await ops.acceptDriverOfferAtomically({offerId:made.offer.id,driverId:ids.d});assert.equal(accepted.ok,true);assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).status,'ASSIGNED');
  });
  await test('scheduled CASH claim establishes startable assignment without marking driver busy',async()=>{
    await booking({scheduledRide:true,pickupAt:new Date(Date.now()+3*3600000)});
    assert.equal((await load('lib/scheduled-marketplace.ts').claimScheduledRide(ids.b,ids.d)).ok,true);const b=await prisma.booking.findUnique({where:{id:ids.b}});assert.equal(b.status,'ASSIGNED');assert.ok(load('lib/driver-state.ts').canTransitionTrip(b.status,'DRIVER_ENROUTE'));assert.equal((await prisma.driver.findUnique({where:{id:ids.d}})).isOnTrip,false);
  });
  await test('CASH START atomically records one collection under concurrent retries',async()=>{
    await booking({status:'ARRIVED',dispatchStatus:'ACCEPTED',driverId:ids.d,acceptedAt:new Date(),fareTotalFare:20});
    await prisma.driver.update({where:{id:ids.d},data:{isOnTrip:true}});
    const transition=load('lib/driver-operations.ts').transitionDriverBooking;
    const attempts=await Promise.allSettled([
      transition({bookingId:ids.b,driverId:ids.d,command:'START',cashConfirmed:true}),
      transition({bookingId:ids.b,driverId:ids.d,command:'START',cashConfirmed:true}),
    ]);
    assert.ok(attempts.some(x=>x.status==='fulfilled'&&x.value.ok));
    assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).status,'IN_PROGRESS');
    assert.equal(await prisma.cashCollection.count({where:{bookingId:ids.b}}),1);
    const collection=await prisma.cashCollection.findUnique({where:{bookingId:ids.b}});
    assert.equal(collection.driverId,ids.d);assert.equal(collection.amountMinor,2000);assert.equal(collection.currency,'EUR');assert.equal(collection.status,'COLLECTED');
    assert.equal(+collection.assignmentAcceptedAt,+(await prisma.booking.findUnique({where:{id:ids.b}})).acceptedAt);
    assert.equal(await prisma.outboxEvent.count({where:{idempotencyKey:'driver-trip:start:'+ids.b}}),1);
  });
  await test('CASH START rollback leaves neither state nor collection and remains retryable',async()=>{
    await booking({status:'ARRIVED',dispatchStatus:'ACCEPTED',driverId:ids.d,acceptedAt:new Date(),fareTotalFare:20});
    outboxFailure=true;
    const transition=load('lib/driver-operations.ts').transitionDriverBooking;
    assert.equal((await transition({bookingId:ids.b,driverId:ids.d,command:'START',cashConfirmed:true})).ok,false);
    assert.equal((await prisma.booking.findUnique({where:{id:ids.b}})).status,'ARRIVED');
    assert.equal(await prisma.cashCollection.count({where:{bookingId:ids.b}}),0);
    outboxFailure=false;
    assert.equal((await transition({bookingId:ids.b,driverId:ids.d,command:'START',cashConfirmed:true})).ok,true);
    assert.equal(await prisma.cashCollection.count({where:{bookingId:ids.b}}),1);
  });
  await test('two concurrent scheduled claims cannot reserve one Driver for the same pickup',async()=>{
    const when=new Date(Date.now()+3*3600000),secondId=crypto.randomBytes(12).toString('hex');
    await booking({scheduledRide:true,pickupAt:when});await booking({id:secondId,scheduledRide:true,pickupAt:when});
    const claim=load('lib/scheduled-marketplace.ts').claimScheduledRide;
    const attempts=await Promise.allSettled([claim(ids.b,ids.d),claim(secondId,ids.d)]);
    assert.equal(attempts.filter(x=>x.status==='fulfilled'&&x.value.ok).length,1);
    assert.equal(await prisma.booking.count({where:{driverId:ids.d}}),1);
  });
  await test('legacy reconstructed scheduled pickup participates in route conflict checks',async()=>{
    const old=await booking({scheduledRide:true,pickupAt:null,status:'ASSIGNED',driverId:ids.d,acceptedAt:new Date()});
    const pickup=load('lib/scheduled-marketplace.ts').bookingPickupAt(old);assert.ok(pickup);
    const candidate=await booking({id:crypto.randomBytes(12).toString('hex'),scheduledRide:true,pickupAt:pickup});
    const result=await load('lib/scheduled-marketplace.ts').claimScheduledRide(candidate.id,ids.d);
    assert.equal(result.ok,false);assert.equal(await prisma.booking.count({where:{driverId:ids.d}}),1);
    assert.equal((await prisma.booking.findUnique({where:{id:old.id}})).driverId,ids.d);
  });
  await test('unknown staff role cannot assign; dedicated operator cannot use Admin actor',async()=>{
    await booking();await prisma.adminUser.update({where:{id:ids.a},data:{role:'UNAPPROVED_ROLE'}});
    const route=load('app/api/admin/operations/assign/route.ts');const payload={bookingId:ids.b,driverId:ids.d,reason:'Synthetic test',requestId:crypto.randomUUID()};assert.equal((await route.POST(await request('/api/admin/assign',payload,'ADMIN'))).status,403);assert.equal((await route.POST(await request('/api/admin/assign',payload,'DISPATCH_OPERATOR'))).status,401);
    for(const file of ['app/api/admin/operations/dispatch/retry/route.ts','app/api/admin/operations/release/route.ts']) {
      const r=await load(file).POST(await request('/api/admin/operations',{bookingId:ids.b,reason:'Synthetic test',requestId:crypto.randomUUID()},'ADMIN'));
      assert.equal(r.status,403);
    }
  });
  await test('failed owner bind rolls back consumed registration proof and new account',async()=>{
    const g=await guestBooking({customerPhone:'900000009',customerEmail:'new@example.test'}),phone='+421900000009';
    assert.equal((await load('app/api/otp/send/route.ts').POST(await request('/api/otp/send',{bookingId:g.body.bookingId,phone},null,{cookie:g.cookie}))).status,200);
    const verified=await load('app/api/otp/verify/route.ts').POST(await request('/api/otp/verify',{bookingId:g.body.bookingId,code:'123456'},null,{cookie:g.cookie}));assert.equal(verified.status,200);
    const proof=(await verified.json()).registrationProofToken;ownerConflict=true;
    const made=await load('app/api/passenger/account/create/route.ts').POST(await request('/api/passenger/account/create',{bookingId:g.body.bookingId,phone,registrationProofToken:proof,fullName:'Synthetic New Passenger',email:'new@example.test',password,confirmPassword:password,rememberDevice:false},null,{cookie:g.cookie}));
    assert.notEqual(made.status,200);
    assert.equal((await prisma.booking.findUnique({where:{id:g.body.bookingId}})).passengerId,null);
    assert.equal(await prisma.passenger.findFirst({where:{phone}}),null);
    assert.equal((await prisma.passengerVerificationProof.findFirst({where:{proofTokenHash:auth.hashSecret(proof)}})).consumedAt,null);
    assert.equal(await prisma.passengerSession.count({where:{passengerId:{notIn:[ids.p,ids.q]}}}),0);
  });
  await test('concurrent capability continuation has one owner and one consumed grant',async()=>{
    const g=await guestBooking();
    const run=async()=>load('app/api/passenger/booking/continue/route.ts').POST(await request('/api/passenger/booking/continue',{bookingId:g.body.bookingId},'PASSENGER',{cookie:g.cookie}));
    const responses=await Promise.allSettled([run(),run()]);
    assert.equal(responses.filter(r=>r.status==='fulfilled'&&r.value.status===200).length>=1,true);
    assert.equal((await prisma.booking.findUnique({where:{id:g.body.bookingId}})).passengerId,ids.p);
    assert.equal(await prisma.passengerVerificationProof.count({where:{bookingId:g.body.bookingId,purpose:'PUBLIC_BOOKING_ACCESS',consumedAt:{not:null}}}),1);
  });
  await test('CARD assignment requires a matching paid BookingPayment record for phone booking',async()=>{
    await booking({bookingSource:'PHONE_DISPATCH',createdByDispatchOperatorId:ids.op,passengerId:null,phoneVerified:false,passengerAuthStatus:'NOT_REQUIRED',paymentMethod:'CARD',status:'CONFIRMED'});
    const ops=load('lib/admin-operations.ts');const assign=()=>ops.assignAdminDriver({bookingId:ids.b,driverId:ids.d,reason:'Synthetic test',requestId:crypto.randomUUID()},ids.a);
    assert.equal((await assign()).ok,false);
    const payment=await prisma.bookingPayment.create({data:{bookingId:ids.b,provider:'STRIPE',paymentMethod:'CARD',currency:'EUR',providerSessionId:'cs_synthetic',createdByDispatchOperatorId:ids.op,idempotencyKey:'synthetic-payment',amountMinor:1999,expiresAt:new Date(Date.now()+3600000),status:'PAID'}});
    assert.equal((await assign()).ok,false);
    await prisma.bookingPayment.update({where:{id:payment.id},data:{amountMinor:2000}});
    const assigned=await assign();assert.equal(assigned.ok,true,JSON.stringify(assigned));
  });
  await test('public CARD assignment accepts verified current and legacy receipts but rejects mismatched evidence',async()=>{
    const eligibility=load('lib/booking-eligibility.ts').authoritativeAssignmentEligibility;
    const row=await booking({paymentMethod:'CARD',status:'CONFIRMED',fareTotalFare:20});
    assert.equal((await eligibility(row,prisma)).eligible,false);
    const receipt=await prisma.paymentWebhookEvent.create({data:{provider:'STRIPE',providerEventId:'evt_public_paid',eventType:'checkout.session.completed',bookingId:ids.b,processingStatus:'PROCESSED',amountMinor:1999,currency:'EUR'}});
    assert.equal((await eligibility(row,prisma)).eligible,false);
    await prisma.paymentWebhookEvent.update({where:{id:receipt.id},data:{amountMinor:2000,currency:'USD'}});
    assert.equal((await eligibility(row,prisma)).eligible,false);
    await prisma.paymentWebhookEvent.update({where:{id:receipt.id},data:{currency:'EUR'}});
    assert.equal((await eligibility(row,prisma)).eligible,true);
    await prisma.paymentWebhookEvent.update({where:{id:receipt.id},data:{amountMinor:null,currency:null}});
    assert.equal((await eligibility(row,prisma)).eligible,true,'previously linked signed webhook receipts remain eligible');
    await prisma.paymentWebhookEvent.update({where:{id:receipt.id},data:{amountMinor:1999,currency:'EUR'}});
    await prisma.paymentWebhookEvent.create({data:{provider:'STRIPE',providerEventId:'evt_public_paid_second',eventType:'checkout.session.completed',bookingId:ids.b,processingStatus:'PROCESSED',amountMinor:2000,currency:'EUR'}});
    assert.equal((await eligibility(row,prisma)).eligible,true,'a prior mismatched receipt cannot hide later valid evidence');
  });
  await test('signed public Stripe receipt retries atomically after an outbox failure',async()=>{
    const row=await booking({paymentMethod:'CARD',status:'PENDING',fareTotalFare:20,pickupAt:new Date(Date.now()+3600000)});
    const pricing=load('lib/security/booking-price.ts');
    await prisma.booking.update({where:{id:row.id},data:{fareBreakdown:{serverPriceMac:pricing.signBookingPrice(row.bookingRef,20)}}});
    verifiedStripeEvent={id:'evt_phase1_synthetic',type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:'cs_phase1_synthetic',payment_intent:'pi_phase1_synthetic',metadata:{bookingId:row.id,bookingRef:row.bookingRef},payment_status:'paid',amount_total:2000,currency:'eur'}}};
    const webhook=load('app/api/payments/webhook/route.ts').POST;
    const deliver=()=>webhook(new NextRequest('https://phase1.example/api/payments/webhook',{method:'POST',headers:{'stripe-signature':'phase1-synthetic-valid'},body:'{}'}));
    outboxFailure=true;
    assert.equal((await deliver()).status,500);
    assert.equal((await prisma.booking.findUnique({where:{id:row.id}})).status,'PENDING');
    assert.equal(await prisma.outboxEvent.count({where:{eventType:'BOOKING_EMAIL_PAYMENT'}}),0);
    let receipt=await prisma.paymentWebhookEvent.findUnique({where:{providerEventId:verifiedStripeEvent.id}});
    assert.equal(receipt.processingStatus,'FAILED');assert.equal(receipt.bookingId,null);
    outboxFailure=false;
    assert.equal((await deliver()).status,200);
    assert.equal((await prisma.booking.findUnique({where:{id:row.id}})).status,'CONFIRMED');
    receipt=await prisma.paymentWebhookEvent.findUnique({where:{providerEventId:verifiedStripeEvent.id}});
    assert.equal(receipt.processingStatus,'PROCESSED');assert.equal(receipt.bookingId,row.id);assert.equal(receipt.amountMinor,2000);assert.equal(receipt.currency,'EUR');
    assert.equal(await prisma.outboxEvent.count({where:{eventType:'BOOKING_EMAIL_PAYMENT'}}),1);
    assert.equal((await deliver()).status,200);
    assert.equal(await prisma.outboxEvent.count({where:{eventType:'BOOKING_EMAIL_PAYMENT'}}),1);
  });
  await test('signed public Stripe receipt write failure rolls back confirmation and email intent',async()=>{
    const row=await booking({paymentMethod:'CARD',status:'PENDING',fareTotalFare:20,pickupAt:new Date(Date.now()+3600000)});
    const pricing=load('lib/security/booking-price.ts');
    await prisma.booking.update({where:{id:row.id},data:{fareBreakdown:{serverPriceMac:pricing.signBookingPrice(row.bookingRef,20)}}});
    verifiedStripeEvent={id:'evt_phase1_receipt_failure',type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:'cs_phase1_receipt_failure',payment_intent:'pi_phase1_receipt_failure',metadata:{bookingId:row.id,bookingRef:row.bookingRef},payment_status:'paid',amount_total:2000,currency:'eur'}}};
    const webhook=load('app/api/payments/webhook/route.ts').POST;
    const deliver=()=>webhook(new NextRequest('https://phase1.example/api/payments/webhook',{method:'POST',headers:{'stripe-signature':'phase1-synthetic-valid'},body:'{}'}));
    receiptFailure=true;
    assert.equal((await deliver()).status,500);
    assert.equal((await prisma.booking.findUnique({where:{id:row.id}})).status,'PENDING');
    assert.equal(await prisma.outboxEvent.count({where:{eventType:'BOOKING_EMAIL_PAYMENT'}}),0);
    receiptFailure=false;
    assert.equal((await deliver()).status,200);
    assert.equal((await prisma.booking.findUnique({where:{id:row.id}})).status,'CONFIRMED');
    assert.equal(await prisma.outboxEvent.count({where:{eventType:'BOOKING_EMAIL_PAYMENT'}}),1);
  });
  await test('stale or revoked passenger session cannot authenticate even with a valid JWT',async()=>{
    const s=await auth.createPassengerSession({id:ids.p,authVersion:0});
    const handshake=()=>load('lib/realtime/auth.ts').authenticateHandshake({headers:{origin:process.env.APP_ORIGIN,cookie:session.sessionCookieName('PASSENGER')+'='+s.token}},'PASSENGER');
    assert.equal((await handshake()).id,ids.p);
    await prisma.passenger.update({where:{id:ids.p},data:{authVersion:1}});await assert.rejects(handshake);
    await prisma.passenger.update({where:{id:ids.p},data:{authVersion:0}});
    await prisma.passengerSession.updateMany({where:{passengerId:ids.p},data:{expiresAt:new Date(0)}});await assert.rejects(handshake);
  });
  console.log(`${passes} passed, ${failures} failed (${mongoUrl?'isolated MongoDB':'isolated adapters'})`);
  if(failures) process.exitCode=1;
}
main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;}).finally(async()=>{if(mongoUrl)await rawDb.$disconnect();});
