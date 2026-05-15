// Simple MongoDB connection test
const { MongoClient } = require('mongodb');

const connectionString = 'mongodb://drivo-yar:Munawar786yar@ac-abfxn8s-shard-00-00.qgu4fcq.mongodb.net:27017,ac-abfxn8s-shard-00-01.qgu4fcq.mongodb.net:27017,ac-abfxn8s-shard-00-02.qgu4fcq.mongodb.net:27017/drivo?ssl=true&replicaSet=atlas-l3oanw-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster5';

async function testConnection() {
  console.log('Testing MongoDB connection...');
  console.log('Connection string:', connectionString.split('@')[1].split('?')[0]);
  
  const client = new MongoClient(connectionString);
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB!');
    
    const db = client.db('drivo');
    const collections = await db.listCollections().toArray();
    console.log('✅ Collections found:', collections.length);
    collections.forEach(c => console.log(`  - ${c.name}`));
    
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.error('\n🔐 Authentication failed. Possible causes:');
      console.error('1. Wrong username or password');
      console.error('2. IP address not whitelisted in MongoDB Atlas');
      console.error('3. User does not have access to the database');
      console.error('\n📋 Solutions:');
      console.error('- Go to https://cloud.mongodb.com/');
      console.error('- Check Network Access > Add your IP or 0.0.0.0/0');
      console.error('- Check Database Access > Verify user drivo-yar exists');
      console.error('- Reset password if needed');
    }
    
    return false;
  } finally {
    await client.close();
  }
}

testConnection();
