/**
 * MongoDB Connection & API Test Script
 * Tests MongoDB connection and all critical APIs
 */

const http = require('http');

const BASE_URL = 'http://localhost:3002';

console.log('\n' + '='.repeat(70));
console.log('🧪 DRIVO MongoDB & API Test Suite');
console.log('='.repeat(70) + '\n');

let passed = 0;
let failed = 0;
let total = 0;

function test(name, options = {}) {
  total++;
  return new Promise((resolve, reject) => {
    const { method = 'GET', path, body, expectedStatus = 200 } = options;
    
    const url = `${BASE_URL}${path}`;
    const data = body ? JSON.stringify(body) : undefined;
    
    const reqOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (data) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(data);
    }
    
    const req = http.request(url, reqOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          
          if (res.statusCode === expectedStatus) {
            console.log(`✅ PASS: ${name}`);
            console.log(`   Status: ${res.statusCode} ${path}`);
            if (parsed.success !== undefined) console.log(`   Success: ${parsed.success}`);
            if (parsed.message) console.log(`   Message: ${parsed.message}`);
            passed++;
            resolve(parsed);
          } else {
            console.error(`❌ FAIL: ${name}`);
            console.error(`   Expected: ${expectedStatus}, Got: ${res.statusCode}`);
            console.error(`   Path: ${path}`);
            console.error(`   Response: ${responseData.substring(0, 200)}`);
            failed++;
            resolve(parsed);
          }
        } catch (error) {
          console.error(`❌ FAIL: ${name} - Parse Error`);
          console.error(`   Error: ${error.message}`);
          failed++;
          resolve(null);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ FAIL: ${name} - Request Error`);
      console.error(`   Error: ${error.message}`);
      failed++;
      resolve(null);
    });
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

async function runTests() {
  // Test 1: MongoDB Connection via Bookings API
  await test('MongoDB Connection - List Bookings', {
    path: '/api/bookings',
    expectedStatus: 200
  });
  
  // Test 2: Create Booking (Write to MongoDB)
  await test('MongoDB Write - Create Booking', {
    method: 'POST',
    path: '/api/bookings',
    body: {
      serviceType: 'STANDARD',
      pickupAddress: 'Test Street 123, Bratislava',
      dropoffAddress: 'Airport, Bratislava',
      scheduledDate: '2026-05-15',
      scheduledTime: '14:00',
      passengerCount: 2,
      luggageType: 'SMALL',
      wheelchairNeeded: false,
      customerName: 'MongoDB Test User',
      customerEmail: 'test@mongodb-test.com',
      customerPhone: '908123456',
      customerPhoneCode: '+421',
      languagePref: 'english',
      paymentMethod: 'CASH',
      cashAgreed: true
    },
    expectedStatus: 201
  });
  
  // Test 3: Admin Stats (MongoDB Read)
  await test('MongoDB Read - Admin Stats', {
    path: '/api/admin/stats',
    expectedStatus: 200
  });
  
  // Test 4: List Drivers (MongoDB)
  await test('MongoDB Read - List Drivers', {
    path: '/api/admin/drivers',
    expectedStatus: 200
  });
  
  // Test 5: Driver Tracking API (MongoDB)
  await test('MongoDB Read - Driver Tracking', {
    path: '/api/admin/drivers/tracking',
    expectedStatus: 200
  });
  
  // Test 6: Address Suggest (Google Maps)
  await test('Google Maps API - Address Suggest', {
    path: '/api/addresses/suggest?input=Bratislava',
    expectedStatus: 200
  });
  
  // Test 7: Booking Estimate (Pricing)
  await test('Pricing API - Booking Estimate', {
    method: 'POST',
    path: '/api/bookings/estimate',
    body: {
      serviceType: 'STANDARD',
      pickupAddress: 'Bratislava',
      dropoffAddress: 'Vienna',
      passengerCount: 2,
      luggageType: 'SMALL',
      wheelchairNeeded: false
    },
    expectedStatus: 200
  });
  
  // Test 8: Contact Form (MongoDB Write)
  await test('MongoDB Write - Contact Form', {
    method: 'POST',
    path: '/api/contact',
    body: {
      name: 'Test User',
      email: 'test@mongodb-test.com',
      subject: 'MongoDB Test',
      message: 'Testing MongoDB connection'
    },
    expectedStatus: 200
  });
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(70));
  console.log(`✅ Passed:  ${passed}/${total}`);
  console.log(`❌ Failed:  ${failed}/${total}`);
  console.log(`📈 Success Rate: ${((passed/total)*100).toFixed(1)}%`);
  console.log('='.repeat(70));
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! MongoDB is fully connected and working!\n');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Review errors above.\n`);
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests();
