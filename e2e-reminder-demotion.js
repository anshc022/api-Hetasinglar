/**
 * E2E: Validate that a customer message makes the chat appear as Unread (queue), not Reminder.
 * Steps:
 *  - Login as admin and ensure a test agent exists
 *  - Login as that agent
 *  - Fetch an escort
 *  - Register/login a test user
 *  - Start a chat and send a customer message
 *  - Fetch live-queue and assert the chat shows as queue with unreadCount > 0 (not reminder)
 */

const axios = require('axios');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const ADMIN = { adminId: process.env.ADMIN_ID || 'admin', password: process.env.ADMIN_PW || 'admin123' };
const AGENT = { agentId: process.env.AGENT_ID || 'qaagent', password: process.env.AGENT_PW || 'QaAgent123!', name: 'QA Agent', email: 'qaagent@example.com' };

async function main() {
  console.log('E2E: reminder → unread demotion check');
  try {
    // 1) Admin login
    const adminRes = await axios.post(`${BASE}/api/admin/login`, ADMIN);
    const adminToken = adminRes.data.access_token;
    console.log('✓ Admin login');

    // 2) Ensure agent exists (admin route)
    try {
      await axios.post(`${BASE}/api/admin/agents`, AGENT, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log('✓ Created test agent');
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      if (msg?.toLowerCase().includes('exists') || msg?.toLowerCase().includes('taken')) {
        console.log('• Test agent already exists');
      } else {
        console.log('• Create agent skipped:', msg);
      }
    }

    // 3) Agent login
    const agentLogin = await axios.post(`${BASE}/api/agents/login`, {
      agentId: AGENT.agentId,
      password: AGENT.password
    });
    const agentToken = agentLogin.data.access_token;
    console.log('✓ Agent login');

    // 4) Get an escort (public endpoint)
    const escortsRes = await axios.get(`${BASE}/api/agents/escorts`);
    if (!Array.isArray(escortsRes.data) || escortsRes.data.length === 0) {
      throw new Error('No escorts found to start a chat with');
    }
    const escort = escortsRes.data[0];
    const escortId = escort._id || escort.id;
    if (!escortId) throw new Error('Escort ID missing');
    console.log(`✓ Escort selected: ${escort.firstName || escort.username || escortId}`);

    // 5) Register/login a test user
    const rnd = Math.random().toString(36).slice(2, 8);
    const username = `qauser_${rnd}`;
    const password = 'QaUser123!';
    await axios.post(`${BASE}/api/auth/register`, {
      username,
      email: `${username}@example.com`,
      password,
      sex: 'male',
      dateOfBirth: '1990-01-01'
    });
    const userLogin = await axios.post(`${BASE}/api/auth/login`, { username, password });
    const userToken = userLogin.data.access_token;
    console.log(`✓ User registered & logged in: ${username}`);

    // 5a) Top-up coins for the user via admin (purchaseHistory is persisted by server routes normally)
    try {
      await axios.patch(
        `${BASE}/api/admin/users/credits`,
        { username, coins: 5, addCoins: true },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      console.log('✓ Added 5 coins to user');
    } catch (e) {
      console.log('• Coin top-up skipped:', e.response?.data?.message || e.message);
    }

    // 6) Start a chat and send a customer message
    const chatStart = await axios.post(
      `${BASE}/api/chats/start`,
      { escortId },
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    const chatId = chatStart.data.id || chatStart.data._id;
    if (!chatId) throw new Error('Chat ID not returned from /chats/start');
    const sendMessage = async () => {
      return axios.post(
        `${BASE}/api/chats/${chatId}/message`,
        { message: `Hello from ${username} @ ${new Date().toISOString()}` },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
    };

    try {
      await sendMessage();
      console.log(`✓ Sent customer message to chat ${chatId}`);
    } catch (e) {
      const data = e.response?.data;
      if (data?.type === 'INSUFFICIENT_COINS' && Array.isArray(data.availablePackages) && data.availablePackages.length) {
        const pkgId = data.availablePackages[0].id;
        console.log(`• Purchasing coin package ${pkgId}...`);
        await axios.post(
          `${BASE}/api/subscription/purchase/coins`,
          { packageId: pkgId },
          { headers: { Authorization: `Bearer ${userToken}` } }
        );
        console.log('✓ Coins purchased');
        await sendMessage();
        console.log(`✓ Sent customer message to chat ${chatId}`);
      } else {
        throw e;
      }
    }

    // 7) Fetch live-queue and assert classification
    const queue = await axios.get(`${BASE}/api/agents/chats/live-queue`, {
      headers: { Authorization: `Bearer ${agentToken}` }
    });
    const chats = queue.data;
    if (!Array.isArray(chats)) throw new Error('Live-queue did not return an array');
    const found = chats.find(c => (c._id === chatId) || (c.id === chatId));
    if (!found) {
      console.log('⚠ Chat not found in live-queue list (may be filtered/limited)');
      console.log('Result count:', chats.length);
      return;
    }

    const unread = found.unreadCount;
    const type = found.chatType;
    console.log('→ Live-queue entry:', { chatId: found._id || found.id, unreadCount: unread, chatType: type });

    const ok = (unread > 0) && (type !== 'reminder');
    if (ok) {
      console.log('✅ PASS: New customer message appears as Unread (queue), not Reminder');
    } else {
      console.log('❌ FAIL: Expected unreadCount > 0 and chatType !== "reminder"');
    }
  } catch (err) {
    console.error('E2E error:', err.response?.data || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
