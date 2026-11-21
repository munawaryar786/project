// Starts its own disposable loopback-only MongoDB replica set. Never reads .env
// or accepts DATABASE_URL. No prisma db push/migration and no existing DB access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { MongoClient } = require('mongodb');
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
function findBinary(root) {
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    const p=path.join(root,entry.name);
    if(entry.isFile() && entry.name==='mongod.exe') return p;
    if(entry.isDirectory()) {const found=findBinary(p);if(found)return found;}
  }
  return null;
}
async function main() {
  const binary=process.env.PHASE1_MONGOD_BINARY || findBinary(path.join(os.tmpdir(),'drivo-phase1-mongo-8.0.16'));
  assert.ok(binary && fs.existsSync(binary),'Supply a local mongod binary; isolated integration cannot be replaced by mock success');
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'drivo-phase1-mongo-data-'));
  const child=spawn(binary,['--bind_ip','127.0.0.1','--port',String(port),'--dbpath',dir,'--replSet','drivoPhase1','--logpath',path.join(dir,'mongod.log'),'--noauth'],{windowsHide:true,stdio:'ignore'});
  let exited=false;child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
  let client;
  try {
    const deadline=Date.now()+60000;
    while(Date.now()<deadline) {
      assert.ok(!exited,'Disposable mongod failed to start');
      client=new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`,{serverSelectionTimeoutMS:500});
      try {await client.connect();await client.db('admin').command({ping:1});break;}
      catch {await client.close();client=null;await delay(200);}
    }
    assert.ok(client,'Disposable MongoDB unavailable');
    await client.db('admin').command({replSetInitiate:{_id:'drivoPhase1',members:[{_id:0,host:`127.0.0.1:${port}`} ]}});
    let primary=false;
    while(Date.now()<deadline) {const hello=await client.db('admin').command({hello:1});if(hello.isWritablePrimary){primary=true;break;}await delay(200);}
    assert.ok(primary,'Disposable replica set did not elect primary');
    const dbName='drivo_phase1_test_'+crypto.randomBytes(8).toString('hex');
    const db=client.db(dbName);
    // Existing schema constraints, created only in this newly created test DB.
    for(const [collection,field] of [['Booking','bookingRef'],['Passenger','phone'],['passenger_verification_proofs','proofTokenHash'],['outbox_events','idempotencyKey'],['admin_audit_events','requestId'],['passenger_sessions','tokenHash'],['cash_collections','bookingId'],['cash_collections','operationKey'],['payment_webhook_events','providerEventId']]) await db.collection(collection).createIndex({[field]:1},{unique:true});
    await db.collection('cash_collections').createIndex({driverId:1,confirmedAt:1});
    const result=await new Promise((resolve,reject)=>{
      const test=spawn(process.execPath,['scripts/phase1-containment-check.cjs'],{cwd:process.cwd(),windowsHide:true,stdio:'inherit',env:{...process.env,PHASE1_TEST_MONGO_URL:`mongodb://127.0.0.1:${port}/${dbName}?replicaSet=drivoPhase1`}});
      test.once('error',reject);test.once('exit',resolve);
    });
    process.exitCode=result || 0;
  } finally {
    if(client)await client.close();
    if(!exited){child.kill();await new Promise(resolve=>{if(exited)return resolve();child.once('exit',resolve);});}
    const resolved=path.resolve(dir), expected=path.resolve(os.tmpdir())+path.sep+'drivo-phase1-mongo-data-';
    assert.ok(resolved.startsWith(expected),'Refuse cleanup outside the unique test directory');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error('ISOLATED_MONGO_FAILED: '+e.message);process.exitCode=1;});
