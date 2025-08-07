const { MongoClient } = require('mongodb');

async function checkReferrals() {
  try {
    const client = new MongoClient('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority');
    await client.connect();
    
    const db = client.db('hetasinglar');
    
    // Check users with referral data
    const usersWithReferrals = await db.collection('users').find({ 
      'referral.affiliateCode': { $exists: true, $ne: null } 
    }).toArray();
    
    console.log('Users with referral data:', usersWithReferrals.length);
    
    if (usersWithReferrals.length > 0) {
      console.log('Sample referral data:');
      usersWithReferrals.slice(0, 3).forEach(user => {
        console.log(`- ${user.username}: ${user.referral ? user.referral.affiliateCode : 'none'}`);
      });
    }
    
    // Check affiliate links
    const affiliateLinks = await db.collection('affiliatelinks').find({}).toArray();
    console.log('Affiliate links:');
    affiliateLinks.forEach(link => {
      console.log(`- Agent: ${link.agentId}, Code: ${link.affiliateCode}, Active: ${link.isActive}`);
    });
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkReferrals();
