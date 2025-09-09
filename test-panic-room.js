const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AGENT_ID = process.env.AGENT_ID || 'Ansh';
const AGENT_PASS = process.env.AGENT_PASS || '111111';

async function loginAgent() {
  const res = await axios.post(`${BASE_URL}/api/agents/login`, {
    agentId: AGENT_ID,
    password: AGENT_PASS,
  });
  return res.data.access_token;
}

async function getLiveQueue(token) {
  const res = await axios.get(`${BASE_URL}/api/agents/chats/live-queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Endpoint returns an array of chats
  return res.data;
}

async function getPanicList(token) {
  const res = await axios.get(`${BASE_URL}/api/agents/chats/panic-room`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.chats || [];
}

async function moveToPanic(token, chatId) {
  const res = await axios.post(
    `${BASE_URL}/api/agents/chats/${chatId}/panic-room`,
    { reason: 'QA test', notes: 'E2E: moved to panic room' },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

async function addPanicNote(token, chatId, text) {
  const res = await axios.post(
    `${BASE_URL}/api/agents/chats/${chatId}/panic-room/notes`,
    { text },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.note;
}

async function removeFromPanic(token, chatId) {
  const res = await axios.post(
    `${BASE_URL}/api/agents/chats/${chatId}/remove-panic-room`,
    { notes: 'E2E: removed from panic room' },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

(async () => {
  console.log('🧪 Panic Room E2E test starting...');
  try {
    // 1) Login
    const token = await loginAgent();
    console.log('✅ Agent login ok');

    // 2) Pick a chat from live queue (not already in panic)
    const queue = await getLiveQueue(token);
    if (!Array.isArray(queue) || queue.length === 0) {
      console.log('❌ No chats in live queue to test with.');
      process.exit(2);
    }

    const candidate = queue.find(c => !c.isInPanicRoom) || queue[0];
    const chatId = candidate._id || candidate.id;
    if (!chatId) {
      console.log('❌ Could not resolve chatId from live queue item.');
      process.exit(2);
    }
    console.log(`➡️ Using chat ${chatId}`);

    // 3) Move to panic room
    const moved = await moveToPanic(token, chatId);
    console.log('✅ Moved response:', moved.message);

    // 4) Verify in panic list
    const panicList = await getPanicList(token);
    const inList = panicList.some(c => (c._id || c.id) === chatId);
    console.log(`🔎 Panic list contains chat: ${inList}`);
    if (!inList) throw new Error('Chat not found in panic room list after move');

    // 5) Verify live queue shows it as panic/high priority
    const queueAfter = await getLiveQueue(token);
    const itemAfter = queueAfter.find(c => (c._id || c.id) === chatId);
    if (!itemAfter) console.log('ℹ️ Chat not in trimmed live queue (limit); continuing...');
    else console.log(`🔎 Live queue isInPanicRoom=${itemAfter.isInPanicRoom}, priority=${itemAfter.priority}`);

    // 6) Add a note
    const note = await addPanicNote(token, chatId, 'E2E: extra note');
    console.log('✅ Note added at:', note?.timestamp || '(no timestamp)');

    // 7) Remove from panic room
    const removed = await removeFromPanic(token, chatId);
    console.log('✅ Removed response:', removed.message);

    // 8) Validate not in panic list anymore
    const panicList2 = await getPanicList(token);
    const stillInList = panicList2.some(c => (c._id || c.id) === chatId);
    console.log(`🔎 Panic list after removal contains chat: ${stillInList}`);
    if (stillInList) throw new Error('Chat still present in panic room list after removal');

    console.log('\n🎉 Panic Room E2E test PASSED');
    process.exit(0);
  } catch (err) {
    console.error('❌ Panic Room E2E test FAILED:', err.response?.data || err.message);
    process.exit(1);
  }
})();
