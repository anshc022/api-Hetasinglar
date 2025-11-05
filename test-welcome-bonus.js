require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

(async () => {
	try {
		const MONGODB_URI = process.env.MONGODB_URI;
		if (!MONGODB_URI) {
			console.error('❌ MONGODB_URI not set');
			process.exit(1);
		}

		await mongoose.connect(MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true
		});

		console.log('🧪 Testing 5-coin welcome bonus...');

		const suffix = Math.random().toString(36).slice(2, 8);
		const username = `welbonus_${suffix}`;
		const email = `${username}@example.com`;

		// Create a fresh user (simulating post-registration, pre-verification)
		let user = await User.create({
			username,
			email,
			password: 'Password123!#',
			emailVerified: true // simulate verified for test
		});

		console.log('➡️  Created user:', user.username);
		console.log('Initial coins balance:', user.coins?.balance || 0);

		// Grant welcome bonus first time
		const firstGrant = await user.grantWelcomeBonus(5);
		user = await User.findById(user._id);
		console.log('First grant applied:', firstGrant);
		console.log('Balance after first grant:', user.coins.balance);
		console.log('Welcome flag:', user.coins.welcomeBonusGranted);

		// Try granting again (should be idempotent)
		const secondGrant = await user.grantWelcomeBonus(5);
		user = await User.findById(user._id);
		console.log('Second grant applied (should be false):', secondGrant);
		console.log('Balance after second attempt:', user.coins.balance);

		const awards = user.coins.awardHistory || [];
		console.log('Award history entries:', awards.length);
		console.log('Latest award:', awards[awards.length - 1]);

		// Cleanup test user (optional)
		await User.deleteOne({ _id: user._id });
		console.log('🧹 Cleaned up test user');

		await mongoose.disconnect();
		console.log('✅ Welcome bonus test complete');
	} catch (err) {
		console.error('❌ Test error:', err);
		process.exit(1);
	}
})();

